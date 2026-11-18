import assert from "node:assert/strict";
import { test } from "node:test";

import { createBugReporter as createBrowserBugReporter } from "@handrail/bug-reporter";
import {
  APPLICATION_SESSION_TOKEN_HEADER,
  createRequestScopedBugReporter,
  createSameOriginBugReporterHandler,
} from "@handrail/bug-reporter/server";

const policy = {
  schema_version: 1,
  project_id: "project-123",
  environment: "staging",
  reporter: { identity_verified: true, access_level: "full_access" },
  reporter_notifications: { available: true, recipient_hint: "r***@example.com", lifecycles: ["fixed"] },
  ask_options: [{ key: "fix", label: "Fix" }],
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sharedConfig(overrides = {}) {
  return {
    apiBaseUrl: "https://handrail.example/api",
    projectId: "project-123",
    environment: "staging",
    reportToken: "server-report-secret",
    retry: { maxAttempts: 1, delayMs: 0 },
    ...overrides,
  };
}

test("request-scoped reporters resolve fresh identity without cross-request leakage", async () => {
  const requests = [];
  const factory = createRequestScopedBugReporter(
    sharedConfig({
      resolveApplicationSessionToken: (request) => request.session,
      fetch: async (_url, init) => {
        requests.push(init);
        return init.method === "GET"
          ? jsonResponse(policy)
          : jsonResponse({ bug_id: "bug-123" }, 201);
      },
    }),
  );
  const firstRequest = { session: "request-one-policy" };
  const secondRequest = { session: "request-two-submit" };
  const first = factory.forRequest(firstRequest);
  const second = factory.forRequest(secondRequest);

  assert.ok(await first.discoverPolicy());
  firstRequest.session = "request-one-submit";
  await first.submit(
    { title: "First", description: "First request" },
    { automationRequests: ["fix"] },
  );
  await second.submit({ title: "Second", description: "Second request" });

  assert.deepEqual(
    requests.map(
      (request) => request.headers[APPLICATION_SESSION_TOKEN_HEADER],
    ),
    ["request-one-policy", "request-one-submit", "request-two-submit"],
  );
  assert.equal(JSON.parse(requests[1].body).reporter_sdk_runtime, "node");
  assert.equal(JSON.parse(requests[1].body).automation_requests, undefined);
  assert.doesNotMatch(
    requests.filter((request) => request.body).map((request) => request.body).join("\n"),
    /request-one|request-two/,
  );
});

test("request-scoped reporting remains vanilla when identity is unavailable", async () => {
  let submission;
  const factory = createRequestScopedBugReporter(
    sharedConfig({
      fetch: async (_url, init) => {
        if (init.method === "GET") {
          return jsonResponse({
            ...policy,
            reporter: { identity_verified: false, access_level: "default" },
          });
        }
        submission = init;
        return jsonResponse({ bug_id: "vanilla" }, 201);
      },
    }),
  );
  const reporter = factory.forRequest({ user: null });
  assert.equal(await reporter.discoverPolicy(), null);
  await reporter.submit(
    { title: "Vanilla", description: "No application identity" },
    { automationRequests: ["fix"] },
  );
  assert.equal(
    submission.headers[APPLICATION_SESSION_TOKEN_HEADER],
    undefined,
  );
  assert.equal(JSON.parse(submission.body).automation_requests, undefined);
});

test("same-origin forwarding keeps HttpOnly cookies and server secrets out of browser code", async () => {
  const upstreamRequests = [];
  let identityCall = 0;
  const handler = createSameOriginBugReporterHandler(
    sharedConfig({
      resolveApplicationSessionToken: (request) => {
        assert.equal(request.headers.get("cookie"), "app_session=http-only-value");
        identityCall += 1;
        return `resolved-request-${identityCall}`;
      },
      fetch: async (url, init) => {
        upstreamRequests.push({ url: String(url), init });
        assert.equal(init.headers.cookie, undefined);
        return init.method === "GET"
          ? jsonResponse(policy)
          : jsonResponse({
              bug_id: "forwarded",
              notification_subscription: {
                active: true,
                created: true,
                recipient_hint: "r***@example.com",
                subscribed_at: "2026-08-26T12:00:00.000Z",
              },
            }, 201);
      },
    }),
  );

  const browserRequests = [];
  const sameOriginFetch = async (url, init) => {
    browserRequests.push({ url, init });
    const headers = new Headers(init.headers);
    // The user agent adds an HttpOnly cookie; application JavaScript never sees it.
    headers.set("cookie", "app_session=http-only-value");
    return handler(
      new Request(`https://app.example${url}`, { ...init, headers }),
    );
  };
  const browserReporter = createBrowserBugReporter({
    apiBaseUrl: "/api",
    projectId: "project-123",
    environment: "staging",
    transport: "same-origin",
    fetch: sameOriginFetch,
  });

  assert.equal(browserReporter.configuration.status, "ready");
  assert.equal(browserReporter.configuration.hasReportToken, false);
  assert.ok(await browserReporter.discoverPolicy());
  await browserReporter.submit(
    {
      title: "Forwarded issue",
      description: "Uses an HttpOnly application session.",
      route: "/settings",
      notification: { notifyOnResolution: true },
    },
    { automationRequests: ["fix"] },
  );

  assert.equal(browserRequests.length, 2);
  for (const request of browserRequests) {
    assert.equal(request.init.credentials, "same-origin");
    assert.equal(request.init.headers.authorization, undefined);
    assert.equal(
      request.init.headers[APPLICATION_SESSION_TOKEN_HEADER],
      undefined,
    );
  }
  assert.equal(upstreamRequests.length, 2);
  assert.equal(
    upstreamRequests[0].init.headers[APPLICATION_SESSION_TOKEN_HEADER],
    "resolved-request-1",
  );
  assert.equal(
    upstreamRequests[1].init.headers[APPLICATION_SESSION_TOKEN_HEADER],
    "resolved-request-2",
  );
  assert.equal(
    upstreamRequests[1].init.headers.authorization,
    "Bearer server-report-secret",
  );
  const forwardedBody = JSON.parse(upstreamRequests[1].init.body);
  assert.equal(forwardedBody.automation_requests, undefined);
  assert.deepEqual(forwardedBody.reporter_notification, {
    notify_on_resolution: true,
    consent_version: "v1",
  });
  assert.equal(forwardedBody.reporter_sdk_runtime, "browser");
  assert.doesNotMatch(
    upstreamRequests[1].init.body,
    /server-report-secret|http-only-value|resolved-request/,
  );
});

test("same-origin forwarding scopes paged bug history and lookup to server-owned identity", async () => {
  const upstreamRequests = [];
  const handler = createSameOriginBugReporterHandler(sharedConfig({
    resolveApplicationSessionToken: () => "server-history-session",
    fetch: async (url, init) => {
      upstreamRequests.push({ url: String(url), init });
      if (String(url).includes("/mine")) {
        return jsonResponse({
          contract_version: "v1",
          bugs: [],
          pagination: { limit: 25, has_more: false, next_cursor: null },
        });
      }
      return jsonResponse({ contract_version: "v1", bug: { id: "bug-1" } });
    },
  }));

  const history = await handler(new Request(
    "https://app.example/api/mobile-bug-reports/mine?limit=25&cursor=opaque&search=insurance&status_group=needs_attention&sort=oldest&visibility=archived&project_id=attacker&environment=production&unexpected=ignored",
  ));
  assert.equal(history.status, 200);
  assert.equal(history.headers.get("cache-control"), "private, no-store");
  const lookup = await handler(new Request(
    "https://app.example/api/mobile-bug-reports/bugs/bug%2F1?project_id=attacker",
  ));
  assert.equal(lookup.status, 200);

  const historyUrl = new URL(upstreamRequests[0].url);
  assert.equal(historyUrl.pathname, "/api/mobile-bug-reports/mine");
  assert.equal(historyUrl.searchParams.get("project_id"), "project-123");
  assert.equal(historyUrl.searchParams.get("environment"), "staging");
  assert.equal(historyUrl.searchParams.get("limit"), "25");
  assert.equal(historyUrl.searchParams.get("cursor"), "opaque");
  assert.equal(historyUrl.searchParams.get("search"), "insurance");
  assert.equal(
    historyUrl.searchParams.get("status_group"),
    "needs_attention",
  );
  assert.equal(historyUrl.searchParams.get("sort"), "oldest");
  assert.equal(historyUrl.searchParams.get("visibility"), "archived");
  assert.equal(historyUrl.searchParams.has("unexpected"), false);
  assert.equal(
    upstreamRequests[0].init.headers[APPLICATION_SESSION_TOKEN_HEADER],
    "server-history-session",
  );
  assert.equal(upstreamRequests[0].init.body, undefined);
  assert.match(upstreamRequests[1].url, /\/bugs\/bug%2F1\?/);

  const crossSite = await handler(new Request(
    "https://app.example/api/mobile-bug-reports/mine",
    { headers: { origin: "https://attacker.example" } },
  ));
  assert.equal(crossSite.status, 403);
  assert.equal(upstreamRequests.length, 2);
});

test("same-origin forwarding validates and isolates report notification consent", async () => {
  const upstreamRequests = [];
  const handler = createSameOriginBugReporterHandler(sharedConfig({
    resolveApplicationSessionToken: () => "verified-notification-session",
    fetch: async (url, init) => {
      upstreamRequests.push({ url: String(url), init });
      return jsonResponse({
        notification_subscription: {
          active: true,
          created: true,
          recipient_hint: "r***@example.com",
          subscribed_at: "2026-08-25T12:00:00.000Z",
        },
      }, 201);
    },
  }));
  const response = await handler(new Request(
    "https://app.example/api/mobile-bug-reports/bugs/bug%2F1/subscription",
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://app.example" },
      body: JSON.stringify({
        reporter_notification: {
          notify_on_resolution: true,
        },
      }),
    },
  ));

  assert.equal(response.status, 201);
  assert.equal(upstreamRequests.length, 1);
  assert.equal(
    new URL(upstreamRequests[0].url).pathname,
    "/api/mobile-bug-reports/bugs/bug%2F1/subscription",
  );
  assert.deepEqual(JSON.parse(upstreamRequests[0].init.body), {
    reporter_notification: {
      notify_on_resolution: true,
      consent_version: "v1",
    },
  });
  assert.equal(
    upstreamRequests[0].init.headers[APPLICATION_SESSION_TOKEN_HEADER],
    "verified-notification-session",
  );
});

test("same-origin notification forwarding logs bounded context without credentials", async () => {
  const diagnostics = [];
  const originalConsoleError = console.error;
  console.error = (message) => diagnostics.push(JSON.parse(String(message)));
  try {
    const handler = createSameOriginBugReporterHandler(sharedConfig({
      resolveApplicationSessionToken: () => "secret-session-value",
      fetch: async () => jsonResponse({
        error: "The feedback report was not found.",
        code: "feedback_notification_report_not_found",
      }, 404),
    }));
    const response = await handler(new Request(
      "https://app.example/api/mobile-bug-reports/bugs/bug-log-1/subscription",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://app.example" },
        body: JSON.stringify({
          reporter_notification: { notify_on_resolution: true },
        }),
      },
    ));

    assert.equal(response.status, 404);
    assert.equal(diagnostics.length, 1);
    assert.deepEqual(diagnostics[0], {
      schema_version: 1,
      component: "handrail_bug_reporter_proxy",
      event: "bug_notification.forward_failed",
      stage: "upstream_rejected",
      status: 404,
      project_id: "project-123",
      environment: "staging",
      bug_id: "bug-log-1",
      application_session_forwarded: true,
      attempts: 1,
    });
    assert.doesNotMatch(JSON.stringify(diagnostics), /secret-session-value|server-token/u);
  } finally {
    console.error = originalConsoleError;
  }
});

test("same-origin forwarding scopes archive, restore, and clear-closed mutations", async () => {
  const upstreamRequests = [];
  const handler = createSameOriginBugReporterHandler(sharedConfig({
    resolveApplicationSessionToken: () => "server-history-session",
    fetch: async (url, init) => {
      upstreamRequests.push({ url: String(url), init });
      return jsonResponse({ ok: true });
    },
  }));

  for (const [path, method] of [
    ["/api/mobile-bug-reports/bugs/bug%2F1/archive", "PUT"],
    ["/api/mobile-bug-reports/bugs/bug%2F1/archive", "DELETE"],
    ["/api/mobile-bug-reports/mine/archive-closed", "POST"],
  ]) {
    const response = await handler(new Request(`https://app.example${path}`, {
      method,
    }));
    assert.equal(response.status, 200);
  }

  assert.deepEqual(
    upstreamRequests.map((request) => request.init.method),
    ["PUT", "DELETE", "POST"],
  );
  assert.match(upstreamRequests[0].url, /\/bugs\/bug%2F1\/archive\?/);
  assert.match(upstreamRequests[2].url, /\/mine\/archive-closed\?/);
  for (const request of upstreamRequests) {
    const url = new URL(request.url);
    assert.equal(url.searchParams.get("project_id"), "project-123");
    assert.equal(url.searchParams.get("environment"), "staging");
    assert.equal(
      request.init.headers[APPLICATION_SESSION_TOKEN_HEADER],
      "server-history-session",
    );
    assert.equal(request.init.body, undefined);
  }
});

test("same-origin browser mode rejects browser-held secrets and preserves core payload behavior", async () => {
  let forwardedBody;
  const handler = createSameOriginBugReporterHandler(
    sharedConfig({
      resolveApplicationSessionToken: () => "forward-session",
      fetch: async (_url, init) => {
        if (init.method === "GET") return jsonResponse(policy);
        forwardedBody = JSON.parse(init.body);
        return jsonResponse({ bug_id: "forward" }, 201);
      },
    }),
  );
  const forwarded = createBrowserBugReporter({
    apiBaseUrl: "/api",
    projectId: "project-123",
    environment: "staging",
    transport: "same-origin",
    fetch: (url, init) =>
      handler(new Request(`https://app.example${url}`, init)),
  });
  const input = {
    title: "Equivalent",
    description: "Same browser payload",
    route: "/equivalent",
    metadata: { safe: true },
  };
  await forwarded.discoverPolicy();
  await forwarded.submit(input, { automationRequests: ["fix"] });

  let directBody;
  let directCall = 0;
  const direct = createBrowserBugReporter({
    ...sharedConfig({
      applicationSessionTokenProvider: () => "direct-session",
      fetch: async (_url, init) => {
        directCall += 1;
        if (directCall === 1) return jsonResponse(policy);
        directBody = JSON.parse(init.body);
        return jsonResponse({ bug_id: "direct" }, 201);
      },
    }),
  });
  await direct.discoverPolicy();
  await direct.submit(input, { automationRequests: ["fix"] });
  delete forwardedBody.event_id;
  delete directBody.event_id;
  assert.deepEqual(forwardedBody, directBody);

  const unsafeBrowserConfig = createBrowserBugReporter({
    apiBaseUrl: "/api",
    projectId: "project-123",
    environment: "staging",
    transport: "same-origin",
    reportToken: "must-not-be-in-browser",
  });
  assert.equal(unsafeBrowserConfig.configuration.status, "misconfigured");
});

test("same-origin forwarding ignores spoofed auth and redacts incidental session material", async () => {
  let upstream;
  const handler = createSameOriginBugReporterHandler(
    sharedConfig({
      resolveApplicationSessionToken: () => "server-resolved-session",
      fetch: async (_url, init) => {
        upstream = init;
        return new Response("upstream echoed server-resolved-session", {
          status: 401,
        });
      },
    }),
  );
  const response = await handler(
    new Request("https://app.example/api/mobile-bug-reports", {
      method: "POST",
      headers: {
        authorization: "Bearer browser-spoof",
        "content-type": "application/json",
        [APPLICATION_SESSION_TOKEN_HEADER]: "browser-session-spoof",
        cookie: "app_session=http-only-cookie",
      },
      body: JSON.stringify({
        title: "Boundary",
        description: "Do not leak credentials",
        project_id: "attacker-project",
        environment: "production",
        metadata: { sessionToken: "accidentally-copied-session" },
      }),
    }),
  );

  assert.equal(upstream.headers.authorization, "Bearer server-report-secret");
  assert.equal(
    upstream.headers[APPLICATION_SESSION_TOKEN_HEADER],
    "server-resolved-session",
  );
  assert.equal(upstream.headers.cookie, undefined);
  const body = JSON.parse(upstream.body);
  assert.equal(body.project_id, "project-123");
  assert.equal(body.environment, "staging");
  assert.equal(body.metadata.sessionToken, "[REDACTED]");
  assert.doesNotMatch(
    upstream.body,
    /browser-spoof|browser-session-spoof|http-only-cookie|accidentally-copied-session|server-resolved-session/,
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "bug_reporting_rejected" });
});

test("same-origin submission falls back to vanilla when request identity disappears", async () => {
  let upstreamBody;
  const handler = createSameOriginBugReporterHandler(
    sharedConfig({
      resolveApplicationSessionToken: () => {
        throw new Error("session expired");
      },
      fetch: async (_url, init) => {
        upstreamBody = JSON.parse(init.body);
        return jsonResponse({ bug_id: "vanilla-forward" }, 201);
      },
    }),
  );
  const response = await handler(
    new Request("https://app.example/api/mobile-bug-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Expired identity",
        description: "Still submit the report",
        automation_requests: { fix: true },
      }),
    }),
  );
  assert.equal(response.status, 201);
  assert.equal(upstreamBody.automation_requests, undefined);
});

test("same-origin forwarding scopes information request answers and strips extra keys", async () => {
  const upstreamRequests = [];
  let upstreamResponse = () => jsonResponse({
    contract_version: "v1",
    bug_id: "bug/1",
    information_request_id: "rfi/1",
    answered: true,
    replayed: false,
    analysis_resumed: true,
  });
  const handler = createSameOriginBugReporterHandler(sharedConfig({
    resolveApplicationSessionToken: () => "server-answer-session",
    fetch: async (url, init) => {
      upstreamRequests.push({ url: String(url), init });
      return upstreamResponse();
    },
  }));
  const path = "/api/mobile-bug-reports/bugs/bug%2F1/information-requests/rfi%2F1/answer?project_id=attacker&environment=production";

  const response = await handler(new Request(`https://app.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "app_session=secret-cookie",
      origin: "https://app.example",
    },
    body: JSON.stringify({
      option: "From the Lineup tab",
      answer: " I used the Lineup tab. ",
      project_id: "attacker",
      report_token: "browser-token",
      application_session_token: "browser-session",
      extra: { nested: true },
    }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).answered, true);
  assert.equal(upstreamRequests.length, 1);
  const upstream = upstreamRequests[0];
  const url = new URL(upstream.url);
  assert.equal(url.pathname, "/api/mobile-bug-reports/bugs/bug%2F1/information-requests/rfi%2F1/answer");
  assert.equal(url.searchParams.get("project_id"), "project-123");
  assert.equal(url.searchParams.get("environment"), "staging");
  assert.equal(upstream.init.method, "POST");
  assert.equal(upstream.init.headers.authorization, "Bearer server-report-secret");
  assert.equal(upstream.init.headers[APPLICATION_SESSION_TOKEN_HEADER], "server-answer-session");
  assert.equal(upstream.init.headers.cookie, undefined);
  assert.deepEqual(JSON.parse(upstream.init.body), {
    option: "From the Lineup tab",
    answer: "I used the Lineup tab.",
  });

  // Only POST is forwarded for the answer route.
  for (const method of ["GET", "PUT", "DELETE"]) {
    const rejected = await handler(new Request(`https://app.example${path}`, { method }));
    assert.equal(rejected.status, 405, method);
  }
  assert.equal(upstreamRequests.length, 1);

  // An answer without option or answer is rejected before forwarding.
  const empty = await handler(new Request(`https://app.example${path}`, {
    method: "POST",
    body: JSON.stringify({ extra: "only" }),
  }));
  assert.equal(empty.status, 400);
  assert.equal((await empty.json()).code, "information_request_answer_invalid");
  assert.equal(upstreamRequests.length, 1);

  // Cross-site answers are rejected before forwarding.
  const crossSite = await handler(new Request(`https://app.example${path}`, {
    method: "POST",
    headers: { origin: "https://attacker.example" },
    body: JSON.stringify({ option: "A" }),
  }));
  assert.equal(crossSite.status, 403);
  assert.equal(upstreamRequests.length, 1);

  // Handrail's stable error code survives forwarding; other upstream text does not.
  upstreamResponse = () => jsonResponse({
    error: "Question already answered by server-report-secret",
    code: "information_request_already_answered",
  }, 409);
  const conflict = await handler(new Request(`https://app.example${path}`, {
    method: "POST",
    body: JSON.stringify({ option: "A" }),
  }));
  assert.equal(conflict.status, 409);
  const conflictBody = await conflict.json();
  assert.deepEqual(conflictBody, {
    error: "bug_reporting_rejected",
    code: "information_request_already_answered",
  });

  const browser = createBrowserBugReporter({
    apiBaseUrl: "/api",
    projectId: "project-123",
    environment: "staging",
    transport: "same-origin",
    fetch: async (url, init) => handler(new Request(`https://app.example${url}`, init)),
  });
  await assert.rejects(
    browser.answerInformationRequest("bug/1", "rfi/1", { option: "A" }),
    (error) => error.statusCode === 409
      && error.upstreamCode === "information_request_already_answered",
  );
});
