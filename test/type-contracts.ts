import {
  SDK_IDENTITY as browserIdentity,
  BugReporterError,
  createBugReporter,
  stampReport as stampBrowserReport,
  type BugReporterPolicy,
  type BugImpact,
  type HandrailBugSeverity,
  type BugArchiveClosedResult,
  type BugArchiveResult,
  type BugInformationRequest,
  type BugInformationRequestAnswerInput,
  type BugInformationRequestAnswerResult,
  MAX_INFORMATION_REQUEST_ANSWER_CHARACTERS,
  type BugTrackingPage,
  type BugTrackingQuery,
  type BugTrackingStatusGroup,
  type BugTrackingSummary,
  type BugTrackingVisibility,
  type ReporterSdkIdentity,
  type TrackedBugRecord,
} from "@handrail/bug-reporter";
import {
  SDK_IDENTITY as serverIdentity,
  createRequestScopedBugReporter,
  createSameOriginBugReporterHandler,
  stampReport as stampServerReport,
} from "@handrail/bug-reporter/server";
import {
  HandrailBugReporterButton,
  HandrailBugReporterDialog,
  HandrailBugReporterProvider,
  HandrailBugReporterIdentityProvider,
  SDK_IDENTITY as reactIdentity,
  stampReport as stampReactReport,
  useHandrailBugReporter,
  useHandrailBugReporterIdentity,
  type HandrailBugReporterAppearance,
  type HandrailBugReporterStyle,
  type HandrailBugReporterButtonProps,
  type HandrailBugReporterContextValue,
  type HandrailBugReporterDialogProps,
  type BugReporterFormState,
} from "@handrail/bug-reporter/react";

const browserReport = stampBrowserReport({ title: "Browser issue" } as const);
const serverReport = stampServerReport({ title: "Server issue" } as const);
const reactReport = stampReactReport({ title: "React issue" } as const);

const browserRuntime: "browser" = browserReport.reporter_sdk_runtime;
const nodeRuntime: "node" = serverReport.reporter_sdk_runtime;
const reactRuntime: "react" = reactReport.reporter_sdk_runtime;
const browserPlatform: "browser" = browserReport.platform;
const serverPlatform: "node" = serverReport.platform;
const packageName: "@handrail/bug-reporter" = reactReport.reporter_sdk_package;
const identities: readonly ReporterSdkIdentity[] = [
  browserIdentity,
  serverIdentity,
  reactIdentity,
];

void browserRuntime;
void nodeRuntime;
void reactRuntime;
void browserPlatform;
void serverPlatform;
void packageName;
void identities;
void HandrailBugReporterIdentityProvider;
void useHandrailBugReporterIdentity;
void HandrailBugReporterProvider;
void useHandrailBugReporter;
void HandrailBugReporterButton;
void HandrailBugReporterDialog;

declare const headlessReporter: HandrailBugReporterContextValue;
const trackingIsStale: boolean = headlessReporter.tracking.stale;
const currentHistoryRefresh: Promise<BugTrackingPage> =
  headlessReporter.refreshCurrentBugs();
void trackingIsStale;
void currentHistoryRefresh;
const headlessAnswer: Promise<BugInformationRequestAnswerResult> =
  headlessReporter.answerInformationRequest("bug-123", "rfi-1", { option: "A" });
void headlessAnswer;

const packagedAppearance: HandrailBugReporterAppearance = {
  themeMode: "auto",
  tokens: { accent: "#175cd3", warningText: "#b54708", infoText: "#175cd3", radius: "8px" },
  style: { "--handrail-bug-accent": "#b93815" } satisfies HandrailBugReporterStyle,
};
const packagedButtonProps: HandrailBugReporterButtonProps = {
  label: "Report a bug",
  appearance: packagedAppearance,
};
const packagedDialogProps: HandrailBugReporterDialogProps = {
  open: true,
  onClose: () => undefined,
  appearance: { themeMode: "dark" },
  showHistory: true,
};
void packagedButtonProps;
void packagedDialogProps;

const canonicalImpact: BugImpact = "moderate";
const storedSeverity: HandrailBugSeverity = "sev3";
void canonicalImpact;
void storedSeverity;

const legacyHeadlessInitialForm: Partial<BugReporterFormState> = {
  notifyOnResolution: true,
};
const packagedContextInitialForm: Partial<BugReporterFormState> = {
  route: "/invoices/42",
  appVersion: "1.2.3",
  buildNumber: "456",
};
void legacyHeadlessInitialForm;
void packagedContextInitialForm;

type AppRequest = { readonly applicationSessionToken?: string };
const requestReporters = createRequestScopedBugReporter<AppRequest>({
  apiBaseUrl: "https://handrail.example/api",
  projectId: "project-123",
  environment: "staging",
  reportToken: "server-only-token",
  resolveApplicationSessionToken: (request) =>
    request.applicationSessionToken,
});
const requestReporter = requestReporters.forRequest({
  applicationSessionToken: "fresh-request-session",
});
void requestReporter;

const sameOriginHandler = createSameOriginBugReporterHandler({
  apiBaseUrl: "https://handrail.example/api",
  projectId: "project-123",
  environment: "staging",
  reportToken: "server-only-token",
  resolveApplicationSessionToken: (request) =>
    request.headers.get("x-app-session"),
});
const forwardedResponse: Promise<Response> = sameOriginHandler(
  new Request("https://app.example/api/mobile-bug-reports/policy"),
);
void forwardedResponse;

const reporter = createBugReporter({
  apiBaseUrl: "/api",
  projectId: "project-123",
  environment: "staging",
  reportToken: "public-token",
  applicationSessionTokenProvider: async () => "current-session",
  allowScreenshots: true,
});
const policyPromise: Promise<BugReporterPolicy | null> = reporter.loadPolicy();
const submissionPromise = reporter.submit(
  {
    title: "Browser issue",
    description: "The button did not respond.",
    screenshot: {
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      mimeType: "image/png",
    },
  },
  { automationRequests: ["auto_verify", "fix"] },
);
void policyPromise;
void submissionPromise;
const statusGroup: BugTrackingStatusGroup = "needs_attention";
const visibility: BugTrackingVisibility = "active";
const bugPagePromise: Promise<BugTrackingPage> = reporter.listBugs({
  limit: 10,
  search: "checkout",
  statusGroup,
  sort: "newest",
  visibility,
});
const trackedBugPromise: Promise<TrackedBugRecord> = reporter.getBug("bug-123");
const archivePromise: Promise<BugArchiveResult> = reporter.archiveBug("bug-123");
const restorePromise: Promise<BugArchiveResult> = reporter.restoreBug("bug-123");
const archiveClosedPromise: Promise<BugArchiveClosedResult> =
  reporter.archiveClosedBugs();
const queryPromise: Promise<BugTrackingQuery | null> = bugPagePromise.then(
  (page) => page.query,
);
const summaryPromise: Promise<BugTrackingSummary | null> = bugPagePromise.then(
  (page) => page.summary,
);
void bugPagePromise;
void trackedBugPromise;
void archivePromise;
void restorePromise;
void archiveClosedPromise;
const answerInput: BugInformationRequestAnswerInput = { option: "A", answer: "Written" };
const answerPromise: Promise<BugInformationRequestAnswerResult> =
  reporter.answerInformationRequest("bug-123", "rfi-1", answerInput);
const openQuestionPromise: Promise<BugInformationRequest | null | undefined> =
  trackedBugPromise.then((bug) => bug.information_request);
const resumed: Promise<boolean | null> = answerPromise.then((result) => result.analysisResumed);
const answerLimit: number = MAX_INFORMATION_REQUEST_ANSWER_CHARACTERS;
void openQuestionPromise;
void resumed;
void answerLimit;
// @ts-expect-error Suggested options are read-only.
openQuestionPromise.then((question) => question?.options.push("E"));
void queryPromise;
void summaryPromise;

const rejection = new BugReporterError(
  "submission_rejected",
  "The bug report was not accepted.",
  403,
  {
    code: "reporter_policy_rejected",
    message: "The reporter policy rejected this request.",
    requestId: "request-123",
  },
);
const upstreamCode: string | null = rejection.upstreamCode;
const upstreamMessage: string | null = rejection.upstreamMessage;
const requestId: string | null = rejection.requestId;
void upstreamCode;
void upstreamMessage;
void requestId;

const sameOriginReporter = createBugReporter({
  apiBaseUrl: "/api",
  projectId: "project-123",
  environment: "staging",
  transport: "same-origin",
});
void sameOriginReporter;

// @ts-expect-error SDK identity is immutable to consumers.
browserIdentity.reporter_sdk_version = "overridden";
// @ts-expect-error Server reports have a Node platform literal.
const invalidServerPlatform: "browser" = serverReport.platform;
void invalidServerPlatform;
// @ts-expect-error GIF screenshots are not accepted by the SDK contract.
reporter.submit({ title: "x", description: "y", screenshot: { data: "", mimeType: "image/gif" } });
