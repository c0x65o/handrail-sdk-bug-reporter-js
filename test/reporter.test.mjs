import assert from "node:assert/strict";
import { test } from "node:test";

import {
  APPLICATION_SESSION_TOKEN_HEADER,
  BUG_SEVERITY_OPTIONS,
  BugReporterError,
  MAX_SCREENSHOT_BYTES,
  bugImpactLabel,
  createBugReporter,
  handrailBugSeverity,
  normalizeBugImpact,
  normalizeBugReporterEndpoints,
} from "@handrail/bug-reporter";

const validPolicy = {
  schema_version: 1,
  project_id: "project-123",
  environment: "staging",
  reporter: {
    identity_verified: true,
    access_level: "full_access",
    role: "maintainer",
  },
  reporter_notifications: {
    available: true,
    recipient_hint: "r***@example.com",
    lifecycles: ["fixed"],
  },
  ask_options: [],
  automation_policy: {
    schema_version: 3,
    automatic_fix_max_risk: "high",
    production_max_risk_by_impact: {
      critical: "moderate",
      high: "low",
      moderate: "none",
      low: "none",
    },
  },
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function reporterConfig(overrides = {}) {
  return {
    apiBaseUrl: "https://handrail.example/api",
    projectId: "project-123",
    environment: "staging",
    reportToken: "public-report-token",
    retry: { maxAttempts: 1, delayMs: 0 },
    ...overrides,
  };
}

test("bug severity contract normalizes labels, canonical impact, and Handrail storage values", () => {
  assert.deepEqual(BUG_SEVERITY_OPTIONS, [
    { label: "Critical", impact: "critical", handrailSeverity: "sev1" },
    { label: "High", impact: "high", handrailSeverity: "sev2" },
    { label: "Moderate", impact: "moderate", handrailSeverity: "sev3" },
    { label: "Low", impact: "low", handrailSeverity: "sev4" },
  ]);
  assert.equal(normalizeBugImpact("Medium"), "moderate");
  assert.equal(normalizeBugImpact("sev3"), "moderate");
  assert.equal(handrailBugSeverity("moderate"), "sev3");
  assert.equal(bugImpactLabel("sev3"), "Moderate");
  assert.equal(normalizeBugImpact("unknown"), null);
});

test("trusted server callers may retain a stable event id across outer retries", async () => {
  let submitted;
  const reporter = createBugReporter(reporterConfig({
    fetch: async (_url, init) => {
      submitted = JSON.parse(init.body);
      return jsonResponse({ bug_id: "bug-stable" }, 201);
    },
  }));
  await reporter.submit({
    title: "Stable retry",
    description: "Use one canonical intake event.",
    eventId: "assistant-conversation-1-turn-4",
  });
  assert.equal(submitted.event_id, "assistant-conversation-1-turn-4");
});

function trackedBug(overrides = {}) {
  return {
    id: "bug-123",
    title: "Checkout failure",
    severity: "sev2",
    environment: "staging",
    status: "in_progress",
    status_rollup: {
      stage: "fixing",
      label: "Fix in progress",
      terminal: false,
      raw_status: "in_progress",
      workflow_state: "fixing",
      environment: null,
      fixed_version: null,
      version: null,
      updated_at: "2026-08-13T18:00:00.000Z",
    },
    archived: false,
    archived_at: null,
    occurrence_count: 3,
    reporter_occurrence_count: 2,
    first_reported_at: "2026-08-12T18:00:00.000Z",
    last_reported_at: "2026-08-13T18:00:00.000Z",
    created_at: "2026-08-12T18:00:00.000Z",
    updated_at: "2026-08-13T18:00:00.000Z",
    fixed_at: null,
    closed_at: null,
    ...overrides,
  };
}

function resolutionJourney(overrides = {}) {
  const keys = ["reported", "confirmed", "corrected", "checked", "released", "confirmed_resolved"];
  return {
    schema_version: 1,
    headline: "Confirmed resolved",
    outcome: "resolved",
    handling: "automatic",
    next_step: null,
    started_at: "2026-08-13T17:50:00.000Z",
    completed_at: "2026-08-13T18:00:00.000Z",
    total_duration_ms: 600_000,
    verification_method: "source_code_audit",
    verification_label: "Application source review",
    release_environment: "staging",
    fixed_version: "1.4.0",
    released_version: "1.4.0",
    automatic_fix_authorized: true,
    automatic_delivery_authorized: true,
    approval_required: false,
    milestones: keys.map((key, index) => ({
      key,
      label: ["Reported", "Confirmed", "Corrected", "Safety checked", "Released", "Confirmed resolved"][index],
      state: "complete",
      started_at: `2026-08-13T17:${50 + index}:00.000Z`,
      completed_at: `2026-08-13T17:${51 + index}:00.000Z`,
      duration_ms: index === 0 ? 0 : 60_000,
    })),
    ...overrides,
  };
}

test("history accepts a frozen safe resolution journey and ignores malformed optional projections", async () => {
  let malformed = false;
  const reporter = createBugReporter(reporterConfig({
    fetch: async () => jsonResponse({
      contract_version: "v1",
      bugs: [trackedBug({
        resolution_journey: malformed
          ? resolutionJourney({ milestones: [{ key: "reported" }] })
          : resolutionJourney({
              next_step: {
                kind: "read_only_runtime_diagnosis",
                label: "Read-only diagnosis required",
                summary: "The team needs a safe state comparison before selecting a fix.",
              },
            }),
      })],
      summary: { total: 1, needs_attention: 0, in_progress: 1, closed: 0, not_reproduced: 0 },
      query: { search: null, status_group: null, sort: "newest", visibility: "active" },
      pagination: { limit: 20, filtered_count: 1, has_more: false, next_cursor: null },
    }),
  }));

  const valid = await reporter.listBugs();
  assert.equal(valid.bugs[0].resolution_journey.headline, "Confirmed resolved");
  assert.equal(valid.bugs[0].resolution_journey.milestones.length, 6);
  assert.equal(valid.bugs[0].resolution_journey.total_duration_ms, 600_000);
  assert.equal(valid.bugs[0].resolution_journey.next_step.kind, "read_only_runtime_diagnosis");
  assert.equal(valid.bugs[0].resolution_journey.next_step.label, "Read-only diagnosis required");
  assert.ok(Object.isFrozen(valid.bugs[0].resolution_journey.next_step));
  assert.ok(Object.isFrozen(valid.bugs[0].resolution_journey));
  assert.ok(Object.isFrozen(valid.bugs[0].resolution_journey.milestones));

  malformed = true;
  const compatible = await reporter.listBugs();
  assert.equal(compatible.bugs[0].resolution_journey, null);
});

test("normalizes Handrail origins, /api bases, relative paths, and full endpoints", () => {
  const cases = [
    [
      "https://handrail.example",
      "https://handrail.example/api/mobile-bug-reports",
    ],
    [
      "https://handrail.example/",
      "https://handrail.example/api/mobile-bug-reports",
    ],
    [
      "https://handrail.example/api",
      "https://handrail.example/api/mobile-bug-reports",
    ],
    [
      "https://handrail.example/api/",
      "https://handrail.example/api/mobile-bug-reports",
    ],
    ["/api", "/api/mobile-bug-reports"],
    ["/api/", "/api/mobile-bug-reports"],
    ["/api/mobile-bug-reports", "/api/mobile-bug-reports"],
  ];

  for (const [input, reports] of cases) {
    assert.deepEqual(normalizeBugReporterEndpoints(input), {
      reports,
      policy: `${reports}/policy`,
      history: `${reports}/mine`,
      bugs: `${reports}/bugs`,
    });
  }
  assert.throws(
    () => normalizeBugReporterEndpoints("https://user:secret@example.test/api"),
    (error) =>
      error instanceof BugReporterError &&
      error.code === "invalid_configuration" &&
      !error.message.includes("secret"),
  );
});

test("disabled and misconfigured reporters never make requests", async () => {
  let requestCount = 0;
  let providerCount = 0;
  const disabled = createBugReporter({
    enabled: false,
    reportToken: "snapshot-report-secret",
    applicationSessionTokenProvider: () => {
      providerCount += 1;
      return "snapshot-session-secret";
    },
    fetch: async () => {
      requestCount += 1;
      return jsonResponse({ ok: true }, 201);
    },
  });

  assert.equal(disabled.configuration.status, "disabled");
  assert.equal(await disabled.discoverPolicy(), null);
  assert.deepEqual(
    await disabled.submit({ title: "Ignored", description: "Ignored" }),
    { status: "disabled" },
  );
  assert.equal(requestCount, 0);
  assert.equal(providerCount, 0);
  const snapshot = JSON.stringify(disabled.configuration);
  assert.doesNotMatch(snapshot, /snapshot-report-secret|snapshot-session-secret/);

  const misconfigured = createBugReporter({
    enabled: true,
    apiBaseUrl: "not-a-url",
    reportToken: "misconfigured-secret",
    fetch: async () => {
      requestCount += 1;
      return jsonResponse({ ok: true }, 201);
    },
  });
  assert.equal(misconfigured.configuration.status, "misconfigured");
  assert.equal(await misconfigured.discoverPolicy(), null);
  await assert.rejects(
    misconfigured.submit({ title: "Issue", description: "Details" }),
    (error) =>
      error instanceof BugReporterError &&
      error.code === "invalid_configuration" &&
      !error.message.includes("misconfigured-secret"),
  );
  assert.equal(requestCount, 0);
});

test("policy lookup resolves a fresh session and accepts only verified allowlisted options", async () => {
  const sessionTokens = ["policy-session-one", "policy-session-two"];
  const requests = [];
  const reporter = createBugReporter(
    reporterConfig({
      applicationSessionTokenProvider: () => sessionTokens.shift(),
      fetch: async (url, init) => {
        requests.push({ url, init });
        return jsonResponse(validPolicy);
      },
    }),
  );

  const first = await reporter.loadPolicy();
  const second = await reporter.discoverPolicy();
  assert.equal(requests.length, 2);
  assert.equal(
    requests[0].url,
    "https://handrail.example/api/mobile-bug-reports/policy?project_id=project-123&environment=staging",
  );
  assert.equal(
    requests[0].init.headers[APPLICATION_SESSION_TOKEN_HEADER],
    "policy-session-one",
  );
  assert.equal(
    requests[1].init.headers[APPLICATION_SESSION_TOKEN_HEADER],
    "policy-session-two",
  );
  assert.deepEqual(first.askOptions, []);
  assert.deepEqual(second, first);
  assert.equal(second.role, "maintainer");
  assert.ok(Object.isFrozen(second));
  assert.ok(Object.isFrozen(second.askOptions));
  assert.doesNotMatch(JSON.stringify(second), /policy-session/);
});

test("policy discovery retries while application identity is still hydrating", async () => {
  const sessionTokens = [null, "hydrated-policy-session"];
  const requests = [];
  const reporter = createBugReporter(
    reporterConfig({
      applicationSessionTokenProvider: () => sessionTokens.shift(),
      fetch: async (_url, init) => {
        requests.push(init);
        return jsonResponse(
          init.headers[APPLICATION_SESSION_TOKEN_HEADER]
            ? validPolicy
            : {
                ...validPolicy,
                reporter: {
                  identity_verified: false,
                  access_level: "default",
                },
                ask_options: [],
              },
        );
      },
    }),
  );

  const policy = await reporter.discoverPolicy();

  assert.equal(requests.length, 2);
  assert.equal(
    requests[0].headers[APPLICATION_SESSION_TOKEN_HEADER],
    undefined,
  );
  assert.equal(
    requests[1].headers[APPLICATION_SESSION_TOKEN_HEADER],
    "hydrated-policy-session",
  );
  assert.equal(policy?.identityVerified, true);
  assert.equal(reporter.currentPolicy, policy);
});

test("an older policy lookup cannot replace a newer verified policy", async () => {
  const pendingResponses = [];
  const reporter = createBugReporter(
    reporterConfig({
      fetch: async () =>
        new Promise((resolve) => {
          pendingResponses.push(resolve);
        }),
    }),
  );

  const olderLookup = reporter.discoverPolicy();
  await new Promise((resolve) => setImmediate(resolve));
  const newerLookup = reporter.discoverPolicy();
  await new Promise((resolve) => setImmediate(resolve));

  pendingResponses[1](jsonResponse(validPolicy));
  const verifiedPolicy = await newerLookup;
  pendingResponses[0](
    jsonResponse({
      ...validPolicy,
      reporter: { identity_verified: false, access_level: "default" },
      ask_options: [],
    }),
  );
  assert.equal(await olderLookup, null);

  assert.equal(reporter.currentPolicy, verifiedPolicy);
  assert.equal(reporter.currentPolicy?.identityVerified, true);
});

test("unverified, mismatched, failed, and malformed policies fall back to vanilla", async () => {
  const responses = [
    jsonResponse({
      ...validPolicy,
      reporter: { identity_verified: false, access_level: "default" },
    }),
    jsonResponse({ ...validPolicy, project_id: "wrong-project" }),
    jsonResponse({ error: "unavailable" }, 503),
    new Response("not json", { status: 200 }),
  ];
  const reporter = createBugReporter(
    reporterConfig({ fetch: async () => responses.shift() }),
  );

  for (let index = 0; index < 4; index += 1) {
    assert.equal(await reporter.discoverPolicy(), null);
    assert.equal(reporter.currentPolicy, null);
  }
});

test("policy discovery has a bounded vanilla fallback when identity resolution stalls", async () => {
  let releaseIdentity;
  let fetchCalls = 0;
  const pendingIdentity = new Promise((resolve) => {
    releaseIdentity = resolve;
  });
  const reporter = createBugReporter(
    reporterConfig({
      policyDiscoveryTimeoutMs: 20,
      applicationSessionTokenProvider: () => pendingIdentity,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("policy fetch should not start without identity");
      },
    }),
  );

  assert.equal(reporter.configuration.policyDiscoveryTimeoutMs, 20);
  assert.equal(await reporter.discoverPolicy(), null);
  assert.equal(reporter.currentPolicy, null);
  releaseIdentity("identity-that-resolved-after-timeout");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fetchCalls, 0);
});

test("submission retries idempotently with fresh session headers and filtered automation", async () => {
  const sessionTokens = [
    "policy-session",
    "submission-session-one",
    "submission-session-two",
  ];
  const requests = [];
  const reporter = createBugReporter(
    reporterConfig({
      retry: { maxAttempts: 2, delayMs: 0 },
      applicationSessionTokenProvider: () => sessionTokens.shift(),
      fetch: async (url, init) => {
        requests.push({ url, init });
        if (init.method === "GET") return jsonResponse(validPolicy);
        const submissionNumber = requests.filter(
          (request) => request.init.method === "POST",
        ).length;
        return submissionNumber === 1
          ? jsonResponse({ error: "temporary" }, 503)
          : jsonResponse({ bug_id: "bug-123" }, 201);
      },
    }),
  );

  await reporter.discoverPolicy();
  const result = await reporter.submit(
    {
      title: "Checkout failure",
      description: "Continue does not work.",
      route: "/checkout",
      appVersion: "1.2.3",
      buildNumber: "42",
      commitSha: "abc123",
      severity: "sev2",
    },
    {
      automationRequests: [
        "fix",
        "deploy_production",
        "future_unsafe_option",
      ],
    },
  );

  assert.deepEqual(result, {
    status: "submitted",
    statusCode: 201,
    bugId: "bug-123",
    response: { bug_id: "bug-123" },
  });
  const submissions = requests.filter(
    (request) => request.init.method === "POST",
  );
  assert.equal(submissions.length, 2);
  assert.equal(
    submissions[0].init.headers[APPLICATION_SESSION_TOKEN_HEADER],
    "submission-session-one",
  );
  assert.equal(
    submissions[1].init.headers[APPLICATION_SESSION_TOKEN_HEADER],
    "submission-session-two",
  );
  const firstBody = JSON.parse(submissions[0].init.body);
  const secondBody = JSON.parse(submissions[1].init.body);
  assert.equal(firstBody.automation_requests, undefined);
  assert.equal(secondBody.event_id, firstBody.event_id);
  assert.match(firstBody.event_id, /^js-/);
  assert.equal(firstBody.project_id, "project-123");
  assert.equal(firstBody.environment, "staging");
  assert.equal(firstBody.severity, "high");
  assert.equal(firstBody.source, "node_web_bug_reporter");
  assert.equal(firstBody.platform, "browser");
  assert.equal(firstBody.reporter_sdk_runtime, "browser");
  assert.equal(firstBody.reporter_sdk_package, "@handrail/bug-reporter");
  assert.equal(typeof firstBody.reporter_sdk_version, "string");
  assert.equal(typeof firstBody.reporter_sdk_commit, "string");
  assert.equal(typeof firstBody.reporter_sdk_ref, "string");
  assert.doesNotMatch(
    JSON.stringify(submissions),
    /policy-session(?!-one|-two)/,
  );
  assert.doesNotMatch(
    submissions.map((request) => request.init.body).join("\n"),
    /submission-session/,
  );
});

test("report-scoped notification opt-in is persisted by the report request", async () => {
  const requests = [];
  const reporter = createBugReporter(reporterConfig({
    applicationSessionTokenProvider: () => "verified-session",
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse({
        bug_id: "bug-notify-1",
        notification_subscription: {
          active: true,
          created: true,
          recipient_hint: "r***@example.com",
          subscribed_at: "2026-08-25T12:00:00.000Z",
        },
      }, 201);
    },
  }));

  const result = await reporter.submit({
    title: "Checkout failure",
    description: "Continue does not work.",
    notification: {
      notifyOnResolution: true,
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).pathname, "/api/mobile-bug-reports");
  assert.deepEqual(JSON.parse(requests[0].init.body).reporter_notification, {
    notify_on_resolution: true,
    consent_version: "v1",
  });
  assert.equal(result.status, "submitted");
  assert.equal(result.notificationSubscription.active, true);
  assert.equal(result.notificationWarning, null);
});

test("notification opt-in falls back to the child route for older servers", async () => {
  const requests = [];
  const reporter = createBugReporter(reporterConfig({
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).includes("/subscription")) {
        return jsonResponse({
          notification_subscription: {
            active: true,
            created: true,
            recipient_hint: "r***@example.com",
            subscribed_at: "2026-08-25T12:00:00.000Z",
          },
        }, 201);
      }
      return jsonResponse({ bug_id: "bug-notify-legacy" }, 201);
    },
  }));

  const result = await reporter.submit({
    title: "Checkout failure",
    description: "Continue does not work.",
    notification: { notifyOnResolution: true },
  });

  assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    reporter_notification: {
      notify_on_resolution: true,
      consent_version: "v1",
    },
  });
  assert.equal(result.status, "submitted");
  assert.equal(result.notificationSubscription.active, true);
  assert.equal(result.notificationWarning, null);
});

test("notification failure is reported separately from a saved bug", async () => {
  const reporter = createBugReporter(reporterConfig({
    fetch: async (url) => String(url).includes("/subscription")
      ? jsonResponse({ error: "temporary" }, 503)
      : jsonResponse({ bug_id: "bug-notify-2" }, 201),
  }));
  const result = await reporter.submit({
    title: "Checkout failure",
    description: "Continue does not work.",
    notification: {
      notifyOnResolution: true,
    },
  });
  assert.equal(result.status, "submitted");
  assert.equal(result.bugId, "bug-notify-2");
  assert.equal(result.notificationSubscription, null);
  assert.match(result.notificationWarning, /report was sent/u);
});

test("verified reporters page and look up their bugs with fresh session headers", async () => {
  const calls = [];
  let sessionNumber = 0;
  const reporter = createBugReporter(reporterConfig({
    applicationSessionTokenProvider: () => `history-session-${++sessionNumber}`,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("/mine")) {
        return jsonResponse({
          contract_version: "v1",
          bugs: [trackedBug({
            status_group: "in_progress",
            reported_app_version: "2.24.1",
            reported_route: "/checkout",
            reported_app_flavor: "web",
          })],
          summary: {
            total: 3,
            needs_attention: 1,
            in_progress: 2,
            closed: 0,
            not_reproduced: 0,
          },
          query: {
            search: "checkout",
            status_group: "in_progress",
            sort: "oldest",
            visibility: "archived",
          },
          pagination: {
            limit: 10,
            filtered_count: 2,
            has_more: true,
            next_cursor: "opaque-page-2",
          },
        });
      }
      return jsonResponse({
        contract_version: "v1",
        bug: trackedBug({
          status: "fixed",
          status_rollup: {
            ...trackedBug().status_rollup,
            stage: "fixed",
            label: "Fixed",
            raw_status: "fixed",
            fixed_version: "1.4.0",
          },
        }),
      });
    },
  }));

  const page = await reporter.listBugs({
    limit: 10,
    cursor: "opaque-page-1",
    search: "  checkout  ",
    statusGroup: "in_progress",
    sort: "oldest",
    visibility: "archived",
  });
  assert.equal(page.bugs[0].status_rollup.stage, "fixing");
  assert.equal(page.bugs[0].impact, "high");
  assert.equal(page.bugs[0].status_group, "in_progress");
  assert.equal(page.bugs[0].reported_app_version, "2.24.1");
  assert.equal(page.bugs[0].reported_route, "/checkout");
  assert.equal(page.bugs[0].reporter_occurrence_count, 2);
  assert.equal(page.summary.total, 3);
  assert.equal(page.summary.needs_attention, 1);
  assert.deepEqual(page.query, {
    search: "checkout",
    statusGroup: "in_progress",
    sort: "oldest",
    visibility: "archived",
  });
  assert.equal(page.pagination.filtered_count, 2);
  assert.equal(page.pagination.next_cursor, "opaque-page-2");
  const current = await reporter.getBug("bug/123");
  assert.equal(current.status_rollup.stage, "fixed");
  assert.equal(current.status_rollup.fixed_version, "1.4.0");

  assert.match(calls[0].url, /\/mine\?/);
  assert.match(calls[0].url, /project_id=project-123/);
  assert.match(calls[0].url, /environment=staging/);
  assert.match(calls[0].url, /limit=10/);
  assert.match(calls[0].url, /cursor=opaque-page-1/);
  assert.match(calls[0].url, /search=checkout/);
  assert.match(calls[0].url, /status_group=in_progress/);
  assert.match(calls[0].url, /sort=oldest/);
  assert.match(calls[0].url, /visibility=archived/);
  assert.match(calls[1].url, /\/bugs\/bug%2F123\?/);
  assert.deepEqual(
    calls.map((call) => call.init.headers[APPLICATION_SESSION_TOKEN_HEADER]),
    ["history-session-1", "history-session-2"],
  );
  assert.ok(calls.every((call) => call.init.body === undefined));
});

test("bug tracking rejects malformed pages and preserves bounded upstream diagnostics", async () => {
  const malformed = createBugReporter(reporterConfig({
    fetch: async () => jsonResponse({ contract_version: "v1", bugs: [] }),
  }));
  await assert.rejects(
    malformed.listBugs(),
    (error) => error instanceof BugReporterError
      && error.code === "tracking_rejected",
  );

  const rejected = createBugReporter(reporterConfig({
    applicationSessionTokenProvider: () => "history-secret",
    fetch: async () => jsonResponse({
      code: "bug_history_identity_required",
      error: "A verified application user is required.",
    }, 403),
  }));
  await assert.rejects(
    rejected.listBugs(),
    (error) => error instanceof BugReporterError
      && error.code === "tracking_rejected"
      && error.statusCode === 403
      && error.upstreamCode === "bug_history_identity_required"
      && !error.message.includes("history-secret"),
  );
});

test("bug tracking rejects invalid discovery queries before making a request", async () => {
  let requestCount = 0;
  const reporter = createBugReporter(reporterConfig({
    fetch: async () => {
      requestCount += 1;
      return jsonResponse({});
    },
  }));
  await assert.rejects(
    reporter.listBugs({ search: "x".repeat(201) }),
    (error) => error instanceof BugReporterError
      && error.code === "tracking_rejected",
  );
  await assert.rejects(
    reporter.listBugs({ statusGroup: "unsafe" }),
    (error) => error instanceof BugReporterError
      && error.code === "tracking_rejected",
  );
  await assert.rejects(
    reporter.listBugs({ visibility: "hidden-forever" }),
    (error) => error instanceof BugReporterError
      && error.code === "tracking_rejected",
  );
  assert.equal(requestCount, 0);
});

test("verified reporters archive, restore, and clear closed bugs", async () => {
  const calls = [];
  const reporter = createBugReporter(reporterConfig({
    applicationSessionTokenProvider: () => "archive-session",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      if (init.method === "PUT") {
        return jsonResponse({
          contract_version: "v1",
          bug_id: "bug/123",
          archived: true,
          archived_at: "2026-08-17T13:00:00.000Z",
        });
      }
      if (init.method === "DELETE") {
        return jsonResponse({
          contract_version: "v1",
          bug_id: "bug/123",
          archived: false,
          archived_at: null,
        });
      }
      return jsonResponse({
        contract_version: "v1",
        archived_count: 35,
      });
    },
  }));

  assert.deepEqual(await reporter.archiveBug("bug/123"), {
    contract_version: "v1",
    bugId: "bug/123",
    archived: true,
    archivedAt: "2026-08-17T13:00:00.000Z",
  });
  assert.deepEqual(await reporter.restoreBug("bug/123"), {
    contract_version: "v1",
    bugId: "bug/123",
    archived: false,
    archivedAt: null,
  });
  assert.deepEqual(await reporter.archiveClosedBugs(), {
    contract_version: "v1",
    archivedCount: 35,
  });
  assert.match(calls[0].url, /\/bugs\/bug%2F123\/archive\?/);
  assert.match(calls[2].url, /\/mine\/archive-closed\?/);
  assert.deepEqual(calls.map((call) => call.init.method), [
    "PUT",
    "DELETE",
    "POST",
  ]);
  assert.ok(calls.every((call) => (
    call.init.headers[APPLICATION_SESSION_TOKEN_HEADER] === "archive-session"
  )));
});

test("submission without a current session degrades to vanilla automation", async () => {
  const bodies = [];
  let providerCall = 0;
  const reporter = createBugReporter(
    reporterConfig({
      applicationSessionTokenProvider: () => {
        if (providerCall++ === 0) return "verified-policy-session";
        throw new Error("application auth is temporarily unavailable");
      },
      fetch: async (_url, init) => {
        if (init.method === "GET") return jsonResponse(validPolicy);
        bodies.push(JSON.parse(init.body));
        return jsonResponse({ bug_id: "bug-vanilla" }, 201);
      },
    }),
  );
  assert.ok(await reporter.discoverPolicy());
  await reporter.submit(
    { title: "Vanilla issue", description: "Still report this issue." },
    { automationRequests: ["fix"] },
  );
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].automation_requests, undefined);
});

test("built-in and caller redaction hooks sanitize nested metadata", async () => {
  let request;
  const reporter = createBugReporter(
    reporterConfig({
      applicationSessionTokenProvider: () => "header-only-session-token",
      redactionHooks: [
        (report) => ({
          ...report,
          description: String(report.description).replace(
            "alice@example.test",
            "[email removed]",
          ),
          metadata: {
            ...report.metadata,
            custom_private_value: "[custom removed]",
          },
          automation_requests: { deploy_production: true },
          screenshot_base64: "hook-bypass-attempt",
          reporter_assertion: { verifier: "hook-session-bypass" },
        }),
      ],
      fetch: async (_url, init) => {
        request = init;
        return jsonResponse({ bug_id: "redacted" }, 201);
      },
    }),
  );

  await reporter.submit({
    title: "Redaction check",
    description: "Reported by alice@example.test",
    metadata: {
      authorization: "Bearer nested-secret",
      nested: {
        refreshToken: "refresh-secret",
        apiKey: "api-key-secret",
        safe: "visible",
      },
      password: "password-secret",
    },
  });
  const body = JSON.parse(request.body);
  assert.equal(body.description, "Reported by [email removed]");
  assert.equal(body.metadata.authorization, "[REDACTED]");
  assert.equal(body.metadata.password, "[REDACTED]");
  assert.equal(body.metadata.nested.refreshToken, "[REDACTED]");
  assert.equal(body.metadata.nested.apiKey, "[REDACTED]");
  assert.equal(body.metadata.nested.safe, "visible");
  assert.equal(body.metadata.custom_private_value, "[custom removed]");
  assert.equal(body.automation_requests, undefined);
  assert.equal(body.screenshot_base64, undefined);
  assert.equal(body.reporter_assertion, undefined);
  assert.equal(
    request.headers[APPLICATION_SESSION_TOKEN_HEADER],
    "header-only-session-token",
  );
  assert.doesNotMatch(
    request.body,
    /header-only-session-token|nested-secret|refresh-secret|api-key-secret|password-secret|hook-session-bypass|hook-bypass-attempt/,
  );
});

test("screenshots are opt-in, signature checked, MIME bounded, and limited to 20 MiB", async () => {
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
  ]);
  let body;
  const enabled = createBugReporter(
    reporterConfig({
      allowScreenshots: true,
      fetch: async (_url, init) => {
        body = JSON.parse(init.body);
        return jsonResponse({ bug_id: "with-image" }, 201);
      },
    }),
  );
  await enabled.submit({
    title: "Image issue",
    description: "See screenshot.",
    screenshot: {
      data: pngBytes,
      mimeType: "image/png",
      filename: "../unsafe/name.png",
    },
  });
  assert.equal(body.screenshot_mime_type, "image/png");
  assert.equal(body.screenshot_filename, ".._unsafe_name.png");
  assert.equal(body.screenshot_base64, "iVBORw0KGgoA");

  const disabled = createBugReporter(
    reporterConfig({ fetch: async () => jsonResponse({}, 201) }),
  );
  await assert.rejects(
    disabled.submit({
      title: "Image issue",
      description: "See screenshot.",
      screenshot: { data: pngBytes, mimeType: "image/png" },
    }),
    (error) =>
      error instanceof BugReporterError && error.code === "invalid_screenshot",
  );

  await assert.rejects(
    enabled.submit({
      title: "Wrong image",
      description: "This is not a supported image.",
      screenshot: {
        data: "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
        mimeType: "image/png",
      },
    }),
    (error) =>
      error instanceof BugReporterError && error.code === "invalid_screenshot",
  );

  const oversized = new Uint8Array(MAX_SCREENSHOT_BYTES + 1);
  oversized.set(pngBytes);
  await assert.rejects(
    enabled.submit({
      title: "Large image",
      description: "This image is too large.",
      screenshot: { data: oversized, mimeType: "image/png" },
    }),
    (error) =>
      error instanceof BugReporterError &&
      error.code === "invalid_screenshot" &&
      !error.message.includes(String(MAX_SCREENSHOT_BYTES + 1)),
  );
});

test("network and HTTP errors expose only safe messages", async () => {
  const secret = "fresh-session-value-that-must-not-escape";
  const networkReporter = createBugReporter(
    reporterConfig({
      applicationSessionTokenProvider: () => secret,
      fetch: async () => {
        throw new Error(`transport failed with ${secret}`);
      },
    }),
  );
  await assert.rejects(
    networkReporter.submit({ title: "Issue", description: "Details" }),
    (error) =>
      error instanceof BugReporterError &&
      error.code === "request_failed" &&
      !error.message.includes(secret) &&
      !(error.stack || "").includes(secret),
  );

  const httpReporter = createBugReporter(
    reporterConfig({
      fetch: async () =>
        new Response(`server echoed public-report-token and ${secret}`, {
          status: 401,
        }),
    }),
  );
  await assert.rejects(
    httpReporter.submit({ title: "Issue", description: "Details" }),
    (error) =>
      error instanceof BugReporterError &&
      error.code === "submission_rejected" &&
      error.statusCode === 401 &&
      error.upstreamCode === null &&
      error.upstreamMessage === null &&
      error.requestId === null &&
      !error.message.includes("public-report-token") &&
      !error.message.includes(secret),
  );
});

test("HTTP rejections preserve structured Handrail diagnostics with credentials redacted", async () => {
  const sessionSecret = "current-application-session-secret";
  const reporter = createBugReporter(
    reporterConfig({
      applicationSessionTokenProvider: () => sessionSecret,
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "bug_report_intake_rejected",
              message:
                `Intake rejected public-report-token and ${sessionSecret}.`,
              requestId: "body-request-id",
            },
          }),
          {
            status: 422,
            headers: {
              "content-type": "application/json",
              "x-request-id": "header-request-id",
            },
          },
        ),
    }),
  );

  await assert.rejects(
    reporter.submit({ title: "Issue", description: "Details" }),
    (error) => {
      assert.equal(error instanceof BugReporterError, true);
      assert.equal(error.code, "submission_rejected");
      assert.equal(error.statusCode, 422);
      assert.equal(error.upstreamCode, "bug_report_intake_rejected");
      assert.equal(
        error.upstreamMessage,
        "Intake rejected [REDACTED] and [REDACTED].",
      );
      assert.equal(error.requestId, "header-request-id");
      assert.equal(error.message, "The bug report was not accepted.");
      assert.doesNotMatch(
        `${error.message}\n${error.stack || ""}\n${JSON.stringify(error)}`,
        /public-report-token|current-application-session-secret/,
      );
      return true;
    },
  );
});

test("HTTP rejections accept Handrail's current string error shape", async () => {
  const reporter = createBugReporter(
    reporterConfig({
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: "production report intake requires a valid policy",
            request_id: "body-correlation-id",
          }),
          {
            status: 403,
            headers: { "content-type": "application/json" },
          },
        ),
    }),
  );

  await assert.rejects(
    reporter.submit({ title: "Issue", description: "Details" }),
    (error) =>
      error instanceof BugReporterError &&
      error.code === "submission_rejected" &&
      error.statusCode === 403 &&
      error.upstreamCode === null &&
      error.upstreamMessage ===
        "production report intake requires a valid policy" &&
      error.requestId === "body-correlation-id",
  );
});

test('All users requires fresh verified opt-in for each read, and drops a switched session', async () => {
  let allowed = false, session = 'alice', listCalls = 0, release;
  const reporter = createBugReporter(reporterConfig({
    applicationSessionTokenProvider: () => session,
    fetch: async (url) => {
      if (String(url).includes('/policy')) return jsonResponse({ ...validPolicy, history: { all_users: allowed } });
      listCalls++;
      assert.equal(new URL(url).searchParams.get('audience'), 'all');
      if (release === 'wait') await new Promise(resolve => { release = resolve; });
      return jsonResponse({ contract_version: 'v1', bugs: [trackedBug({ is_owner: false })], pagination: { limit: 20, has_more: false, next_cursor: null } });
    },
  }));
  await assert.rejects(reporter.listBugs({ audience: 'all' })); assert.equal(listCalls, 0);
  allowed = true;
  assert.equal((await reporter.listBugs({ audience: 'all' })).bugs[0].is_owner, false);
  allowed = false; await assert.rejects(reporter.listBugs({ audience: 'all' })); assert.equal(listCalls, 1);
  allowed = true; release = 'wait';
  const pending = reporter.listBugs({ audience: 'all' });
  while (typeof release !== 'function') await new Promise(resolve => setTimeout(resolve, 1));
  session = 'bob'; release(); await assert.rejects(pending, /session changed/);
  assert.equal(reporter.currentPolicy, null);
});
