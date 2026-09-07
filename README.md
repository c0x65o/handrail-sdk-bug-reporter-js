# @handrail/bug-reporter

Framework-neutral JavaScript bug-reporting primitives for Handrail. The package
has separate browser and Node/server entry points plus a React entry point with
both a headless controller and explicitly mounted packaged UI. Every runtime
stamps reports with immutable SDK release identity.

## Installation

This public SDK is distributed from its GitHub repository in the same exact-pin
model as Handrail's other SDKs. Applications should use the Git commit approved
by Handrail's JavaScript bug reporter install contract, never a moving branch
such as `main`.

For local evaluation, build and pack this checkout, then install the resulting
tarball in a test application:

```sh
npm ci
npm run build
npm pack
npm install ./handrail-bug-reporter-*.tgz
```

React applications must already provide React 18 or newer. React is a peer
dependency so this package never installs a second React runtime.

## Entry points

The root entry point is browser-safe and has no Node built-in, `process`, or
filesystem dependency:

```ts
import { stampReport } from "@handrail/bug-reporter";

const report = stampReport({
  title: "Checkout button does not respond",
  description: "Clicking Continue has no visible effect.",
});
```

It also provides policy discovery and JSON submission against Handrail's
existing bug-report intake. The direct browser configuration below is retained
for already-deployed compatibility. New web integrations should use the
server-only same-origin forwarding pattern documented below; mobile integrations
continue to use their direct project/environment credential.

```ts
import { createBugReporter } from "@handrail/bug-reporter";

const reporter = createBugReporter({
  apiBaseUrl: "https://dashboard.handrail-daas.com/api",
  projectId: "your-immutable-project-id",
  environment: "staging",
  reportToken: "your-legacy-direct-report-token",
  applicationSessionTokenProvider: async () =>
    applicationAuth.currentSession?.rawToken ?? null,
});

// Best effort. A null result means the UI should show only vanilla reporting.
const policy = await reporter.discoverPolicy();

await reporter.submit(
  {
    title: "Checkout button does not respond",
    description: "Clicking Continue has no visible effect.",
    impact: "moderate",
    route: window.location.pathname,
    metadata: { viewport: `${window.innerWidth}x${window.innerHeight}` },
  },
  {
    // Render and select keys only from policy?.askOptions.
    automationRequests: policy?.askOptions.map((option) => option.key),
  },
);
```

### Impact and Handrail severity

All packaged and headless web integrations use the same four-level contract:

| UI label | SDK `impact` | Handrail severity |
| --- | --- | --- |
| Critical | `critical` | `sev1` |
| High | `high` | `sev2` |
| Moderate | `moderate` | `sev3` |
| Low | `low` | `sev4` |

New code should set `impact`. The SDK sends the canonical impact through the
existing `severity` intake field. Existing callers remain compatible:
`Critical`/`High`/`Medium`/`Moderate`/`Low` and
`sev1` through `sev4` are accepted and normalized before submission. The
packaged React form defaults to Moderate and uses these exact four labels.

### Report update notifications

Applications may offer an unchecked, report-scoped **Email me when this is
fixed** opt-in:

```ts
const result = await reporter.submit({
  title: "Checkout button does not respond",
  description: "Clicking Continue has no visible effect.",
  notification: {
    notifyOnResolution: true,
  },
});

if (result.status === "submitted" && result.notificationWarning) {
  showNotice(result.notificationWarning);
}
```

Only offer this control when policy discovery returns
`policy.reporterNotifications?.available === true`. Handrail derives the
recipient from the verified Known User session; callers do not collect or send
an address. `recipientHint` contains safe display copy for the consent UI.

The SDK saves the report first, then persists consent through the report's
`/subscription` child route. A subscription failure cannot turn an accepted
report into a submission error. On a subscription failure, the same-origin
proxy and Handrail API emit structured, privacy-safe diagnostics containing
the failing stage, HTTP status, bug/project/environment identifiers, and
boolean identity/ownership checkpoints. They never log the recipient address,
report token, application session token, or request body. Handrail sends one email only after release
evidence confirms the fix is available in the environment where the report
originated. Internal Fixed and Deployed transitions do not each produce mail.
The email includes a report-scoped unsubscribe link. Existing integrations remain compatible because
`notification` is optional and the deprecated `email` field is ignored for
recipient selection.

The direct browser provider example applies only when the application already
exposes a browser-readable session token. Use the same-origin forwarding
pattern below for HttpOnly cookies; never weaken an HttpOnly session to satisfy
this API.

`apiBaseUrl` accepts a Handrail origin such as
`https://dashboard.handrail-daas.com`, an API base ending in `/api`, a
same-origin `/api` path, or the complete `/api/mobile-bug-reports` endpoint.
All forms normalize to the existing intake and `/policy` routes without
duplicating `/api`.

Create an explicitly disabled, no-network reporter with
`createBugReporter({ enabled: false })`. Its configuration status is
`disabled`, policy discovery returns `null`, and submission returns
`{ status: "disabled" }`. An enabled reporter with incomplete or invalid
configuration has `configuration.status === "misconfigured"`; it makes no
request and submission throws a generic `BugReporterError`.

### Identity and policy safety

`applicationSessionTokenProvider` is invoked immediately before every policy
or submission request, including each retry. Its current non-blank result is
sent only in `x-handrail-application-session-token`. The SDK never adds it to a
payload, configuration snapshot, stored policy, retry body, error, log,
storage, or analytics event. If the provider is missing, returns no session,
or throws, ordinary bug reporting continues without verified attribution.

Policy discovery is best effort and never downloads Known Users. The SDK
accepts only a version-1 response for the configured project and environment
whose reporter identity is server-verified. The packaged UI shows a compact
**Your access** summary whenever verified policy discovery succeeds. It always
names the effective Requester, Contributor, or Maintainer role and, when
advertised, shows the maximum automatic repair risk and production threshold
for the selected impact. Changing Impact updates the personal summary without
exposing the full project policy matrix.
Bug reporters never receive staging or production controls. Deployment is
decided by Handrail after impact and change risk are verified.

Policy discovery falls back to vanilla reporting after five seconds by
default, so a stalled application-session resolver or policy endpoint cannot
leave optional-action controls loading indefinitely. Override the bounded
deadline with `policyDiscoveryTimeoutMs`; it applies only to policy discovery,
not report submission. If identity is still hydrating or a transient policy
request fails, discovery briefly re-resolves the current session within that
same deadline. Concurrent refreshes are latest-request-wins, so an older lookup
cannot erase a newer verified policy.

Submission always omits `automation_requests`, including when an older caller
passes the deprecated option. Handrail remains the authority that re-verifies
identity, classifies risk, and applies workflow and deployment gates.

### Redaction, screenshots, retries, and errors

The SDK recursively replaces values under sensitive keys such as tokens,
cookies, authorization, passwords, credentials, session data, private keys,
and payment-card fields with `[REDACTED]`. Add application-specific hooks with
`redactionHooks`; each hook receives an already-sanitized JSON report and must
return the complete report. Built-in redaction runs again after every hook so
a hook cannot accidentally reintroduce a sensitive-key value.

Screenshots are disabled unless `allowScreenshots: true` is configured. A
report can then include one `screenshot` as a `Blob`, `ArrayBuffer`, typed
array, base64 string, or data URL. The SDK accepts only signature-matching
`image/png` and `image/jpeg`, strips unsafe filename characters, and rejects
decoded data larger than Handrail intake's 20 MiB limit before making a
request:

```ts
await reporter.submit({
  title: "Layout overlaps",
  description: "The controls overlap at tablet width.",
  screenshot: {
    data: pastedImageFile,
    mimeType: "image/png",
    filename: "checkout-layout.png",
  },
});
```

#### Host CSP for screenshot previews

The packaged React UI renders selected, pasted, and dropped local screenshots
from browser `blob:` URLs. If the host application sends a Content Security
Policy, allow those previews in `img-src`; a typical same-origin directive is
`img-src 'self' data: blob:`. Add `blob:` only to `img-src`, not `script-src` or
a broad `default-src`. Test with the production-equivalent policy and verify
that the thumbnail actually decodes and renders—a filename or attachment card
alone does not prove the preview loaded.

Retries are opt-in through `retry.maxAttempts` (maximum 3). The SDK retries
network failures and transient HTTP statuses, re-resolves the application
session for every attempt, and reuses an intake `event_id` so a response-loss
retry remains idempotent. Retry bodies never contain the application session.
Trusted server adapters may provide `eventId` to retain that same idempotency
boundary across an outer tool retry; browser forms should let the SDK generate
it.
The primary `BugReporterError.message` remains generic and never includes
provider exceptions, response bodies, request data, tokens, or screenshots.
For a rejected HTTP submission, callers may also use `statusCode`,
`upstreamCode`, `upstreamMessage`, and `requestId`. The upstream message is a
bounded Handrail diagnostic with the report token and current application
session token redacted; it is intended for server-side logging or deliberate
application error mapping rather than automatic rendering. Non-JSON and
malformed response bodies are discarded.

Server code uses the isolated server entry point:

```ts
import { createRequestScopedBugReporter } from "@handrail/bug-reporter/server";

const requestReporters = createRequestScopedBugReporter<AppRequest>({
  apiBaseUrl: process.env.HANDRAIL_API_URL,
  projectId: process.env.HANDRAIL_PROJECT_ID,
  environment: process.env.APP_ENVIRONMENT,
  reportToken: process.env.HANDRAIL_BUG_REPORT_TOKEN,
  // Authenticate the request using the application's normal server code.
  // Return only the current Handrail application-session token.
  resolveApplicationSessionToken: async (request) =>
    (await authenticate(request))?.applicationSessionToken ?? null,
});

export async function reportServerIssue(request: AppRequest) {
  // Construct this client inside the request. No identity is cached globally.
  return requestReporters.forRequest(request).submit({
    title: "Invoice job failed",
    description: "The invoice worker stopped before delivery.",
    route: "/jobs/invoices",
  });
}
```

The resolver runs immediately before every Handrail policy/submission attempt.
The factory retains neither its result nor a prior request, so a long-lived
factory is safe while every returned reporter remains request-local. If the
resolver returns nothing or throws, submission continues as a vanilla report.

### HttpOnly sessions and same-origin forwarding

When the application session is held in an HttpOnly cookie, browser JavaScript
must not read or copy it. Mount a Web `Request`/`Response` forwarding handler
on the application server at `/api/mobile-bug-reports`; the same handler owns
its `/policy`, `/mine`, and `/bugs/:bugId` children:

```ts
import {
  createSameOriginBugReporterHandler,
} from "@handrail/bug-reporter/server";

export const handleBugReport = createSameOriginBugReporterHandler({
  apiBaseUrl: process.env.HANDRAIL_API_URL,
  projectId: process.env.HANDRAIL_PROJECT_ID,
  environment: process.env.APP_ENVIRONMENT,
  reportToken: process.env.HANDRAIL_BUG_REPORT_TOKEN,
  resolveApplicationSessionToken: async (request) =>
    (await authenticateHttpOnlyCookie(request))?.applicationSessionToken ?? null,
});
```

On Handrail-managed deployments, `HANDRAIL_BUG_REPORT_TOKEN` is a distinct
server-only credential bound to this exact service environment. It must not be
copied into browser configuration, client-prefixed environment variables,
rendered HTML, logs, or API responses. The Automation UI does not ask the owner
to select this service; Handrail provisions the binding from the deployed
runtime.

Adapt the framework's incoming request to a Web `Request` if necessary and
return the handler's Web `Response`. The handler ignores inbound cookies,
authorization, report-token, and application-session headers when contacting
Handrail. It resolves identity from that one request, adds server-owned headers
upstream, and returns only a narrow JSON response. Server errors are generic.

The corresponding browser configuration contains no report or session token:

```ts
const reporter = createBugReporter({
  apiBaseUrl: "/api",
  projectId: "your-immutable-project-id",
  environment: "staging",
  transport: "same-origin",
});
```

Same-origin mode accepts only an absolute-path `apiBaseUrl`, sends credentials
with same-origin semantics, and is deliberately misconfigured if a report
token or application-session provider is placed in browser configuration.

### Track the current user's bugs

Verified Known Users can list and inspect the canonical bugs created by their
own JavaScript reporter submissions. Anonymous and token-only submissions still
work, but they never grant history access.

```ts
const firstPage = await reporter.listBugs({ limit: 10 });

for (const bug of firstPage.bugs) {
  console.log(bug.title, bug.status_rollup.label);
  console.log(bug.resolution_journey?.headline);
}

const current = await reporter.getBug(firstPage.bugs[0].id);

if (firstPage.pagination.has_more) {
  const nextPage = await reporter.listBugs({
    limit: 10,
    cursor: firstPage.pagination.next_cursor!,
  });
}
```

History defaults to newest-first and uses opaque keyset cursors rather than
offsets. The default page size is 20 and Handrail caps pages at 50, so
applications should render the first page and continue only on demand. Repeated
crash occurrences collapse to one canonical bug; `occurrence_count` is the
global canonical count and `reporter_occurrence_count` is the current user's
count.

App-owned history screens can request a bounded literal search, one semantic
status group, and oldest/newest ordering:

```ts
const page = await reporter.listBugs({
  limit: 10,
  search: "insurance",
  statusGroup: "needs_attention",
  sort: "newest",
});

console.log(page.summary);
// { total, needs_attention, in_progress, closed, not_reproduced }

for (const bug of page.bugs) {
  console.log(
    bug.status_group,
    bug.reported_app_version,
    bug.reported_route,
    bug.reported_app_flavor,
  );
}
```

`summary` counts all bugs matching the current search before status-group
filtering. `pagination.filtered_count` counts the search plus the selected
group. Both are `null` only during a rolling deployment against an older
Handrail history endpoint. Search is a case-insensitive literal substring over
title and the current reporter's latest route, app version, and app flavor; it
is limited to 200 characters.

The four status groups partition the canonical rollups. `needs_attention` and
`not_reproduced` retain their corresponding stages, terminal rollups are
`closed`, and every other nonterminal stage is `in_progress`. Use
`status_group` for filters instead of reclassifying raw status or workflow
fields in application code.

The opaque cursor carries the normalized search, group, sort, visibility, and
snapshot.
Continuation calls may send only `cursor` (plus `limit`) or repeat the same
query. Conflicting query values are rejected. A UI may number sequential cursor
pages it has already visited, but it should not promise random page access or
synthesize offset pagination.

Completed PM status is authoritative: `closed` and `wont_fix` bugs remain in
the `closed` group even if an older automation run still contains attention or
not-reproduced evidence.

### Archive and restore app-owned history

Archive state is scoped to the current verified application user and affects
only their history presentation. It never deletes or changes the Handrail PM
bug or another user's list:

```ts
await reporter.archiveBug(bugId);
await reporter.restoreBug(bugId);

const archived = await reporter.listBugs({
  visibility: "archived",
  sort: "newest",
});
```

History visibility is `active` by default and also accepts `archived` or `all`.
Rows expose `archived` and `archived_at`. An archive records the latest owned
submission time, so a new report of the same canonical bug automatically makes
it active again. The packaged tracker offers individual **Archive** and
**Restore** actions and deliberately provides no bulk clear action.

`status_rollup.stage` is one of `submitted`, `verifying`, `verified`, `fixing`,
`fixed`, `deployed`, `closed`, `not_reproduced`, `wont_fix`, or
`needs_attention`. The rollup uses Handrail's canonical verification, fix, and
bug-run evidence. `deployed` requires an exact recorded delivery artifact and
prefers production evidence over staging; a completed fix is not mislabeled as
deployed.

Newer Handrail servers also return `resolution_journey`, a schema-versioned,
customer-safe projection of the append-only bug run. Its six milestones are
Reported, Confirmed, Corrected, Safety checked, Released, and Confirmed
resolved. Each milestone includes exact timestamps and a duration only when
the server has durable evidence for them; missing evidence remains `null` and
clients must not infer precise timing from `status_rollup.updated_at`.
`handling`, policy-authorization booleans, the verification label, and release
versions are sanitized receipts rather than raw run payloads. The SDK validates
and freezes a compatible projection and returns `null` for absent or malformed
optional journey data, preserving history against older rolling servers.

Each successful submission result also exposes `bugId`, allowing a caller to
retain the canonical identity and later pass it to `getBug`.

### Packaged React UI

The packaged UI is opt-in. Importing or upgrading the package never injects a
launcher, dialog, stylesheet, global listener, or portal. An application must
mount `HandrailBugReporterButton` or control
`HandrailBugReporterDialog` itself:

```tsx
import { useMemo } from "react";
import {
  HandrailBugReporterButton,
  HandrailBugReporterProvider,
} from "@handrail/bug-reporter/react";

export function App() {
  const config = useMemo(() => ({
    apiBaseUrl: "/api",
    projectId: "your-immutable-project-id",
    environment: "staging",
    transport: "same-origin" as const,
    allowScreenshots: true,
  }), []);

  return (
    <HandrailBugReporterProvider
      config={config}
      initialForm={{ route: window.location.pathname }}
    >
      <HandrailBugReporterButton
        label="Report a bug"
        appearance={{
          themeMode: "auto",
          tokens: {
            accent: "var(--app-accent)",
            accentText: "#fff",
            infoText: "var(--app-info)",
            radius: "8px",
          },
          // Direct scoped-variable overrides are type-safe too.
          style: { "--handrail-bug-warning-text": "var(--app-warning)" },
        }}
      />
    </HandrailBugReporterProvider>
  );
}
```

The dialog delegates all policy, validation, submission, notification, and
history operations to the same headless provider described below. Its compact,
wide desktop layout presents the bug form beside an **Attached context** panel
that reflects the route, app version, and environment supplied by the
application. Supply application-owned context through `initialForm`; the UI
never claims or displays context it did not receive. It includes one
validated PNG/JPEG screenshot by styled upload, direct
clipboard paste, or drag and drop, an immediate thumbnail with a visible View
affordance that opens a larger preview when clicked, with Replace/Remove
actions, policy-derived Ask controls,
an unchecked report-scoped update consent control when the verified user is
eligible, and an owned **My bugs** view with search, status/visibility/sort
filters, keyset pagination, and individual archive and restore actions.
The history list presents each report as a colored resolution journey with
honest complete, current, upcoming, and stopped states. Exact per-stage timing
appears only with server evidence. Expanded details provide a resolution
receipt with customer-safe verification, policy, checks, release, total-time,
environment, version, and support-reference facts. Older servers retain the
same visual progression without fabricated durations.
After Handrail accepts a report, the form is replaced by a dedicated thank-you
screen rather than leaving submitted fields editable. It confirms whether
email updates were enabled, keeps notification failure separate from report
success, and offers **Report another bug** and **Done** actions.
Successful submission also marks any previously loaded **My bugs** query stale;
opening the tab revalidates that query so the accepted report appears without a
page refresh or unrelated filter change. While **My bugs** remains open, the
packaged UI refreshes its current query every 15 seconds so server-side progress
changes appear without reopening the tab.

`appearance.themeMode` accepts `auto`, `light`, or `dark`. `auto` is the
default and follows the host color scheme while supplying a polished,
high-contrast SDK palette and system typography. Use `auto` when the host
publishes its active scheme through CSS `color-scheme` (including a scheme
inherited from the document root). If the application stores an account-level
theme that can differ from the operating-system preference, pass the current
`light` or `dark` value instead and provide the corresponding product tokens.
Changing `themeMode` or `tokens` on a later render immediately restyles the
built-in launcher and open dialog; the provider and headless client do not need
to be remounted. Override any of these typed tokens without changing reporter
behavior:

- `accent`, `accentText`
- `surface`, `surfaceMuted`, `text`, `mutedText`, `border`, `overlay`
- `dangerSurface`, `dangerText`, `successSurface`, `successText`
- `warningSurface`, `warningText`, `infoSurface`, `infoText`
- `radius`, `fontFamily`

Configuration tokens are mapped to scoped CSS custom properties. For host
theme systems that already work in variables, `appearance.style` also accepts
the typed `--handrail-bug-*` properties directly; direct values take precedence
over `appearance.tokens`. The built-in launcher installs the same configured
tokens on itself, so its default primary treatment matches the dialog.

The email-update opt-in resets host styles within that control, including broad
`input` and `label` rules using `!important`. Its native checkbox keeps a fixed
size, the copy wraps beside it, and helper text uses the SDK's normal weight.
Use appearance tokens for its font and colors; application form styles do not
need exceptions for this control. The reset does not affect host-page controls.

The opt-in browser regression suite runs with `npm run test:browser` after
`npx playwright install chromium`. It covers broad host CSS, late-loaded
`!important` rules, light/dark tokens, narrow screens, wrapping, and keyboard
interaction. An existing Chromium installation can be selected with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

The report form and **My bug reports** view share one compact desktop dialog
height so the shell does not resize when users switch views. In history, a
primary **Report a bug** header action returns to the form. Active and Archived
remain compact secondary tabs; search, status counts and filters, and sorting
share one toolbar. Every report keeps the complete six-stage resolution
timeline visible—Reported, Confirmed, Corrected, Safety checked, Released, and
Confirmed resolved—alongside its impact, reported time, and actions. Expanded
details provide the resolution receipt. The
description, reproduction, and screenshot areas expand to use the available
desktop form height. The dialog stays bounded by the available viewport, and
long forms or tracker tables scroll internally. Mobile
presentation remains full-screen. The configured appearance values are
installed as scoped `--handrail-bug-*` CSS variables on
the overlay. `appearance.className` targets the dialog and `appearance.style`
targets the overlay for application-specific integration. The dialog has an
accessible name and description, contains Tab focus, closes on Escape or an
overlay click, restores launcher focus, announces loading/errors/success in
text, and bounds itself to the available viewport.

The packaged history view uses the same appearance contract and provides a
dense desktop tracker table with a responsive mobile-card layout, semantic
status badges, active/archived visibility, status counts, search, sort,
archive/restore actions, bounded pagination, and expandable row details.
Applications can brand it with tokens, but do not need to rebuild those
controls to get the production-ready default presentation.

Use `HandrailBugReporterDialog` directly when the application owns its own
launcher. Its required `open` and `onClose` props make the mounting decision
explicit. Set `showHistory={false}` when only submission should be packaged.

### Headless React adoption

The same React entry point retains its renderless controller for applications
that own a larger bug-tracking experience. The provider itself renders no UI,
injects no global widget, and ships no shared CSS. The host application owns
its modal/page/drawer, launcher, theme, components, copy, responsive behavior,
and accessibility. Keep the configuration object stable so the provider
represents one reporter instance:

```tsx
import { useMemo } from "react";
import {
  HandrailBugReporterProvider,
  useHandrailBugReporter,
} from "@handrail/bug-reporter/react";

function BugReportForm() {
  const bugReport = useHandrailBugReporter();

  // Bind these headless values/actions to the application's own components:
  // bugReport.form / setForm / updateForm
  // bugReport.policyStatus / isVanilla / automationOptions
  // bugReport.setAutomationRequest
  // bugReport.replaceScreenshot / removeScreenshot / canAttachScreenshot
  // bugReport.submission / submit / resetSubmission
  // bugReport.tracking / refreshBugs({ search, statusGroup, sort, visibility })
  // bugReport.refreshCurrentBugs / loadMoreBugs
  // bugReport.archiveBug / restoreBug / archiveClosedBugs
  return null;
}

function App() {
  const bugReporterConfig = useMemo(() => ({
    apiBaseUrl: "/api",
    projectId: "your-immutable-project-id",
    environment: "staging",
    transport: "same-origin" as const,
    allowScreenshots: true,
  }), []);

  return (
    <HandrailBugReporterProvider
      config={bugReporterConfig}
      initialForm={{ route: window.location.pathname }}
    >
      <BugReportForm />
    </HandrailBugReporterProvider>
  );
}
```

Policy-derived automation controls are empty unless the current response is
verified and allowlisted. Screenshot replacement always holds at most one
attachment. When policy or identity is unavailable, `isVanilla` is true,
automation selections are cleared, and the same `submit` action still sends a
vanilla report. The provider installs no global event listeners and uses no
cookies, local storage, session storage, analytics, or background persistence.
Bug history is also opt-in: call `refreshBugs` when the application opens its
“My bugs” surface, then call `loadMoreBugs` while `tracking.hasMore` is true.
Set `historyPageSize` on the provider to request a page size from 1 through 50.
The tracking state exposes the server-normalized `summary` and `query` together
with the current rows and continuation cursor. `tracking.stale` becomes true
after a successful submission or history mutation and remains true after a
failed revalidation. Call `refreshCurrentBugs()` to preserve and revalidate the
last server-normalized query. Archive and restore success is kept separate from
a later refresh failure, which remains visible through tracking state.

The host should provide its own loading, empty, error/retry, pending, success,
and validation states. If the reporter is presented as a dialog, the host also
owns its accessible name, focus containment, Escape/close behavior, and focus
restoration. Status and submission changes should be announced without relying
on color alone. These are presentation requirements, not SDK-rendered UI, so
each product can follow its existing design system.

For fixed bugs, Handrail reports deployment by comparing the Work Request's
fixed application version with the current environment version. Equal and later
versions include the fix; missing or non-comparable version evidence is reported
as unavailable. Commit identities do not decide this customer-facing status.
The status rollup exposes `fixed_version` separately from `version`, which is
the current deployed version when the stage is deployed.

Every stamped report includes authoritative values for:

- `source` (`node_web_bug_reporter`)
- `platform` (`browser` or `node`)
- `reporter_sdk_runtime` (`browser`, `node`, or `react`)
- `reporter_sdk_package` (`@handrail/bug-reporter`)
- `reporter_sdk_version`
- `reporter_sdk_commit`
- `reporter_sdk_ref`

Caller-provided values cannot override these fields. Stamping returns a new
object and does not mutate the caller's report.

Both ESM (`import`) and CommonJS (`require`) consumers are supported. TypeScript
declarations are published for every entry point.

## Release stamping

`package.json` is the sole owner of the package name and version. The build
generates a source module containing literal release values and bundles those
literals into every runtime entry point. Runtime modules never inspect
`package.json`, Git, environment variables, `process`, or the filesystem.

For builds in a Git checkout, the commit is read automatically. Public Git
installs can build without `.git`; in that case the SDK stamps its stable version
tag while the consuming application's lockfile owns the exact commit. No
release-candidate or alternate version flow is used.

The release ref must be an immutable tag or commit reference, never a moving
branch such as `main`. `npm run check` verifies package and lockfile version
agreement, package exports, syntax, type contracts, browser safety, stamped
metadata, and packed contents. Publishing is intentionally outside this
repository task.
