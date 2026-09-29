import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  Dispatch,
  PropsWithChildren,
  ReactElement,
  SetStateAction,
} from "react";
import {
  REACT_SDK_IDENTITY,
  stampReportWithIdentity,
} from "./identity";
import {
  BugReporterError,
  createHandrailBugReporter,
  type AutomationOption,
  type AutomationOptionKey,
  type BugArchiveClosedResult,
  type BugArchiveResult,
  type BugReportInput,
  type BugReporterConfig,
  type BugReporterPolicy,
  type BugReportSubmissionResult,
  type BugTrackingListOptions,
  type BugTrackingPage,
  type BugTrackingQuery,
  type BugTrackingSummary,
  type HandrailBugReporterClient,
  type ReporterNotificationPreference,
  type ScreenshotAttachment,
  type TrackedBugRecord,
} from "./reporter";
import {
  normalizeBugImpact,
  type BugImpact,
} from "./severity";

export {
  REPORT_SOURCE,
  SDK_COMMIT,
  SDK_NAME,
  SDK_RELEASE_REF,
  SDK_VERSION,
} from "./identity";
export type {
  ReporterPlatform,
  ReporterRuntime,
  ReporterSdkIdentity,
  StampedBugReport,
} from "./identity";
export {
  APPLICATION_SESSION_TOKEN_HEADER,
  AUTOMATION_OPTIONS,
  BUG_TRACKING_SORTS,
  BUG_TRACKING_STATUS_GROUPS,
  BUG_TRACKING_VISIBILITIES,
  BUG_REPORT_TOKEN_HEADER,
  BugReporterError,
  HandrailBugReporterClient,
  MAX_SCREENSHOT_BYTES,
  MAX_BUG_HISTORY_SEARCH_CHARACTERS,
  REDACTED_VALUE,
  normalizeBugReporterEndpoints,
  redactSensitiveValues,
} from "./reporter";
export type {
  AutomationOption,
  AutomationOptionKey,
  BugArchiveClosedResult,
  BugArchiveResult,
  BugReportInput,
  BugReporterConfig,
  BugReporterConfigurationSnapshot,
  BugReporterConfigurationStatus,
  BugReporterEndpoints,
  BugReporterErrorCode,
  BugReporterUpstreamError,
  BugReporterPolicy,
  BugReportSubmissionResult,
  BugTrackingListOptions,
  BugTrackingPage,
  BugTrackingQuery,
  BugTrackingSort,
  BugTrackingStage,
  BugTrackingStatusGroup,
  BugTrackingStatusRollup,
  BugTrackingSummary,
  BugTrackingVisibility,
  BugReporterTransport,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  RedactionHook,
  ReporterAccessLevel,
  ReporterRetryOptions,
  ReporterNotificationPreference,
  ReporterNotificationSubscription,
  ScreenshotAttachment,
  SubmissionOptions,
  TrackedBugRecord,
} from "./reporter";

export const SDK_RUNTIME = "react" as const;
export const SDK_PLATFORM = "browser" as const;
export const SDK_IDENTITY = REACT_SDK_IDENTITY;

const HandrailBugReporterIdentityContext = createContext(SDK_IDENTITY);

export function HandrailBugReporterIdentityProvider({
  children,
}: PropsWithChildren): ReactElement {
  return createElement(
    HandrailBugReporterIdentityContext.Provider,
    { value: SDK_IDENTITY },
    children,
  );
}

export function useHandrailBugReporterIdentity() {
  return useContext(HandrailBugReporterIdentityContext);
}

export function stampReport<T extends Readonly<Record<string, unknown>>>(
  report: T,
) {
  return stampReportWithIdentity(report, SDK_IDENTITY);
}

export function createBugReporter(config: BugReporterConfig) {
  return createHandrailBugReporter(config, {
    identity: SDK_IDENTITY,
    stamp: stampReport,
  });
}

export interface BugReporterFormState {
  readonly title: string;
  readonly description: string;
  readonly impact: BugImpact;
  /** @deprecated Use impact. */
  readonly severity?: string;
  readonly route?: string;
  readonly appVersion?: string;
  readonly buildNumber?: string;
  readonly commitSha?: string;
  readonly appFlavor?: string;
  readonly reproducer?: string;
  readonly profileKey?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly screenshot: ScreenshotAttachment | null;
  readonly automationRequests: readonly AutomationOptionKey[];
  readonly notifyOnResolution: boolean;
}

export type BugReporterPolicyStatus =
  | "idle"
  | "loading"
  | "ready"
  | "unavailable";
export type BugReporterSubmissionStatus =
  | "idle"
  | "submitting"
  | "submitted"
  | "disabled"
  | "error";

export interface BugReporterSubmissionState {
  readonly status: BugReporterSubmissionStatus;
  readonly result: BugReportSubmissionResult | null;
  readonly error: BugReporterError | null;
}

export type BugReporterTrackingStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export interface BugReporterTrackingState {
  readonly status: BugReporterTrackingStatus;
  /** True when a successful mutation means the current rows should be revalidated. */
  readonly stale: boolean;
  readonly bugs: readonly TrackedBugRecord[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly summary: BugTrackingSummary | null;
  readonly query: BugTrackingQuery | null;
  readonly error: BugReporterError | null;
}

export type BugReporterTrackingQueryOptions = Pick<
  BugTrackingListOptions,
  "audience" | "search" | "statusGroup" | "sort" | "visibility"
>;

export interface HandrailBugReporterContextValue {
  readonly reporter: HandrailBugReporterClient;
  readonly policy: BugReporterPolicy | null;
  readonly policyStatus: BugReporterPolicyStatus;
  /** True whenever no verified policy-derived controls are available. */
  readonly isVanilla: boolean;
  readonly automationOptions: readonly AutomationOption[];
  readonly canAttachScreenshot: boolean;
  readonly form: BugReporterFormState;
  readonly setForm: Dispatch<SetStateAction<BugReporterFormState>>;
  updateForm(patch: Partial<BugReporterFormState>): void;
  replaceScreenshot(screenshot: ScreenshotAttachment): void;
  removeScreenshot(): void;
  setAutomationRequest(key: AutomationOptionKey, selected: boolean): void;
  refreshPolicy(): Promise<BugReporterPolicy | null>;
  submit(
    overrides?: Partial<BugReportInput>,
  ): Promise<BugReportSubmissionResult>;
  readonly submission: BugReporterSubmissionState;
  resetSubmission(): void;
  readonly tracking: BugReporterTrackingState;
  refreshBugs(
    options?: BugReporterTrackingQueryOptions,
  ): Promise<BugTrackingPage>;
  /** Revalidate the last server-normalized query, or the default query before first load. */
  refreshCurrentBugs(): Promise<BugTrackingPage>;
  loadMoreBugs(): Promise<BugTrackingPage | null>;
  archiveBug(bugId: string): Promise<BugArchiveResult>;
  restoreBug(bugId: string): Promise<BugArchiveResult>;
  archiveClosedBugs(): Promise<BugArchiveClosedResult>;
}

export interface HandrailBugReporterProviderProps extends PropsWithChildren {
  readonly config: BugReporterConfig;
  readonly initialForm?: Partial<BugReporterFormState>;
  /** Policy discovery is best effort and enabled by default. */
  readonly loadPolicyOnMount?: boolean;
  /** Number of bugs requested per keyset page. Defaults to 20; maximum 50. */
  readonly historyPageSize?: number;
  /** Non-secret account/session revision. Change on sign-out, account or tenant switch. */
  readonly sessionKey?: string | number;
}

const EMPTY_SUBMISSION: BugReporterSubmissionState = Object.freeze({
  status: "idle",
  result: null,
  error: null,
});

const EMPTY_TRACKING: BugReporterTrackingState = Object.freeze({
  status: "idle",
  stale: true,
  bugs: Object.freeze([]),
  hasMore: false,
  nextCursor: null,
  summary: null,
  query: null,
  error: null,
});

function initialFormState(
  initial: Partial<BugReporterFormState> | undefined,
): BugReporterFormState {
  return {
    title: initial?.title || "",
    description: initial?.description || "",
    impact:
      normalizeBugImpact(initial?.impact)
      || normalizeBugImpact(initial?.severity)
      || "moderate",
    severity: initial?.severity,
    route: initial?.route,
    appVersion: initial?.appVersion,
    buildNumber: initial?.buildNumber,
    commitSha: initial?.commitSha,
    appFlavor: initial?.appFlavor,
    reproducer: initial?.reproducer,
    profileKey: initial?.profileKey,
    metadata: initial?.metadata,
    screenshot: initial?.screenshot || null,
    automationRequests: Object.freeze([...(initial?.automationRequests || [])]),
    notifyOnResolution: initial?.notifyOnResolution === true,
  };
}

const HandrailBugReporterContext =
  createContext<HandrailBugReporterContextValue | null>(null);

/**
 * Renderless controller for policy, form, screenshot, and submission state.
 * It registers no global listeners and reads or writes no browser storage.
 */
export function HandrailBugReporterProvider(props: HandrailBugReporterProviderProps): ReactElement {
  return createElement(BugReporterSessionProvider, { ...props, key: `${props.sessionKey ?? ""}:${props.config.projectId}:${props.config.environment}:${props.config.apiBaseUrl}` });
}

function BugReporterSessionProvider({
  children,
  config,
  initialForm,
  loadPolicyOnMount = true,
  historyPageSize = 20,
}: HandrailBugReporterProviderProps): ReactElement {
  const reporter = useMemo(() => createBugReporter(config), [config]);
  const [policy, setPolicy] = useState<BugReporterPolicy | null>(null);
  const [policyStatus, setPolicyStatus] =
    useState<BugReporterPolicyStatus>("idle");
  const [form, setForm] = useState<BugReporterFormState>(() =>
    initialFormState(initialForm),
  );
  const [submission, setSubmission] =
    useState<BugReporterSubmissionState>(EMPTY_SUBMISSION);
  const [tracking, setTracking] =
    useState<BugReporterTrackingState>(EMPTY_TRACKING);
  const policyDiscoveryGeneration = useRef(0);
  const trackingGeneration = useRef(0);
  const trackingAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { trackingGeneration.current += 1; trackingAbort.current?.abort(); }, []);
  const previousReporterRef = useRef(reporter);

  useEffect(() => {
    if (previousReporterRef.current === reporter) return;
    previousReporterRef.current = reporter;
    trackingGeneration.current += 1;
    setTracking(EMPTY_TRACKING);
  }, [reporter]);

  const applyPolicy = useCallback((nextPolicy: BugReporterPolicy | null) => {
    setPolicy(nextPolicy);
    setPolicyStatus(nextPolicy ? "ready" : "unavailable");
    const allowed = new Set(nextPolicy?.askOptions.map((option) => option.key));
    setForm((current) => ({
      ...current,
      automationRequests: nextPolicy
        ? current.automationRequests.filter((key) => allowed.has(key))
        : [],
    }));
  }, []);

  const refreshPolicy = useCallback(async () => {
    const generation = ++policyDiscoveryGeneration.current;
    setPolicy(null);
    setPolicyStatus("loading");
    try {
      const nextPolicy = await reporter.discoverPolicy();
      if (generation === policyDiscoveryGeneration.current) {
        applyPolicy(nextPolicy);
      }
      return nextPolicy;
    } catch {
      if (generation === policyDiscoveryGeneration.current) {
        applyPolicy(null);
      }
      return null;
    }
  }, [applyPolicy, reporter]);

  useEffect(() => {
    let active = true;
    const generation = ++policyDiscoveryGeneration.current;
    if (!loadPolicyOnMount) {
      setPolicy(null);
      setPolicyStatus("idle");
      return () => {
        active = false;
      };
    }
    const controller = new AbortController();
    setPolicy(null);
    setPolicyStatus("loading");
    void reporter.discoverPolicy(controller.signal).then(
      (nextPolicy) => {
        if (active && generation === policyDiscoveryGeneration.current) {
          applyPolicy(nextPolicy);
        }
      },
      () => {
        if (active && generation === policyDiscoveryGeneration.current) {
          applyPolicy(null);
        }
      },
    );
    return () => {
      active = false;
      policyDiscoveryGeneration.current += 1;
      controller.abort();
    };
  }, [applyPolicy, loadPolicyOnMount, reporter]);

  const updateForm = useCallback((patch: Partial<BugReporterFormState>) => {
    setForm((current) => {
      const normalizedImpact =
        normalizeBugImpact(patch.impact)
        || normalizeBugImpact(patch.severity);
      return {
        ...current,
        ...patch,
        ...(normalizedImpact ? { impact: normalizedImpact } : {}),
      };
    });
  }, []);

  const replaceScreenshot = useCallback((screenshot: ScreenshotAttachment) => {
    setForm((current) => ({ ...current, screenshot }));
  }, []);

  const removeScreenshot = useCallback(() => {
    setForm((current) => ({ ...current, screenshot: null }));
  }, []);

  const setAutomationRequest = useCallback(
    (key: AutomationOptionKey, selected: boolean) => {
      setForm((current) => {
        const currentPolicy = policy;
        const allowed = currentPolicy?.askOptions.some(
          (option) => option.key === key,
        );
        if (!allowed || !currentPolicy) return current;
        const selectedKeys = new Set(current.automationRequests);
        if (selected) selectedKeys.add(key);
        else selectedKeys.delete(key);
        return {
          ...current,
          automationRequests: currentPolicy.askOptions
            .map((option) => option.key)
            .filter((optionKey) => selectedKeys.has(optionKey)),
        };
      });
    },
    [policy],
  );

  const submit = useCallback(
    async (overrides: Partial<BugReportInput> = {}) => {
      setSubmission({ status: "submitting", result: null, error: null });
      const input: BugReportInput = {
        title: form.title,
        description: form.description,
        severity: form.severity,
        route: form.route,
        appVersion: form.appVersion,
        buildNumber: form.buildNumber,
        commitSha: form.commitSha,
        appFlavor: form.appFlavor,
        reproducer: form.reproducer,
        profileKey: form.profileKey,
        metadata: form.metadata,
        screenshot: form.screenshot || undefined,
        ...(form.notifyOnResolution
          ? {
              notification: {
                notifyOnResolution: true,
              } satisfies ReporterNotificationPreference,
            }
          : {}),
        ...overrides,
        impact:
          normalizeBugImpact(overrides.impact)
          || normalizeBugImpact(overrides.severity)
          || form.impact,
      };
      try {
        const result = await reporter.submit(input, {
          automationRequests: form.automationRequests,
        });
        setSubmission({
          status: result.status === "disabled" ? "disabled" : "submitted",
          result,
          error: null,
        });
        if (result.status === "submitted") {
          setTracking((current) => ({ ...current, stale: true }));
        }
        return result;
      } catch (error) {
        const safeError =
          error instanceof BugReporterError
            ? error
            : new BugReporterError(
                "request_failed",
                "The bug report could not be sent. Please try again.",
              );
        setSubmission({ status: "error", result: null, error: safeError });
        throw safeError;
      }
    },
    [form, reporter],
  );

  const resetSubmission = useCallback(() => {
    setSubmission(EMPTY_SUBMISSION);
  }, []);

  const refreshBugs = useCallback(async (
    options: BugReporterTrackingQueryOptions = {},
  ) => {
    trackingAbort.current?.abort();
    const controller = new AbortController();
    trackingAbort.current = controller;
    const generation = ++trackingGeneration.current;
    setTracking((current) => ({ ...current, bugs: [], summary: null, status: "loading", error: null }));
    try {
      const page = await reporter.listBugs({
        limit: historyPageSize,
        ...options,
        signal: controller.signal,
      });
      if (generation === trackingGeneration.current) {
        if (options.audience === "all") applyPolicy(reporter.currentPolicy);
        setTracking({
          status: "ready",
          stale: false,
          bugs: page.bugs,
          hasMore: page.pagination.has_more,
          nextCursor: page.pagination.next_cursor,
          summary: page.summary,
          query: page.query,
          error: null,
        });
      }
      return page;
    } catch (error) {
      const safeError = error instanceof BugReporterError
        ? error
        : new BugReporterError(
            "tracking_unavailable",
            "Bug history could not be loaded. Please try again.",
          );
      if (generation === trackingGeneration.current) {
        applyPolicy(null);
        setTracking(() => ({
          ...EMPTY_TRACKING,
          status: "error",
          stale: true,
          error: safeError,
        }));
      }
      throw safeError;
    }
  }, [applyPolicy, historyPageSize, reporter]);

  const loadMoreBugs = useCallback(async () => {
    if (!tracking.hasMore || !tracking.nextCursor || tracking.status === "loading") {
      return null;
    }
    trackingAbort.current?.abort();
    const controller = new AbortController();
    trackingAbort.current = controller;
    const generation = ++trackingGeneration.current;
    setTracking((current) => ({ ...current, status: "loading", error: null }));
    try {
      const page = await reporter.listBugs({
        limit: historyPageSize,
        cursor: tracking.nextCursor,
        audience: tracking.query?.audience,
        signal: controller.signal,
      });
      if (generation === trackingGeneration.current) {
        setTracking((current) => ({
          status: "ready",
          stale: false,
          bugs: [
            ...current.bugs,
            ...page.bugs.filter((bug) => (
              !current.bugs.some((existing) => existing.id === bug.id)
            )),
          ],
          hasMore: page.pagination.has_more,
          nextCursor: page.pagination.next_cursor,
          summary: page.summary,
          query: page.query,
          error: null,
        }));
      }
      return page;
    } catch (error) {
      const safeError = error instanceof BugReporterError
        ? error
        : new BugReporterError(
            "tracking_unavailable",
            "Bug history could not be loaded. Please try again.",
          );
      if (generation === trackingGeneration.current) {
        applyPolicy(null);
        setTracking(() => ({
          ...EMPTY_TRACKING,
          status: "error",
          stale: true,
          error: safeError,
        }));
      }
      throw safeError;
    }
  }, [applyPolicy, historyPageSize, reporter, tracking.hasMore, tracking.nextCursor, tracking.status, tracking.query]);

  const refreshCurrentBugs = useCallback(async () => {
    const query = tracking.query;
    return refreshBugs(query ? {
      audience: query.audience,
      search: query.search || undefined,
      statusGroup: query.statusGroup || undefined,
      sort: query.sort,
      visibility: query.visibility,
    } : {});
  }, [refreshBugs, tracking.query]);

  const archiveBug = useCallback(async (bugId: string) => {
    const result = await reporter.archiveBug(bugId);
    setTracking((current) => ({ ...current, stale: true }));
    try {
      await refreshCurrentBugs();
    } catch {
      // The archive succeeded. The tracking state separately exposes refresh failure.
    }
    return result;
  }, [refreshCurrentBugs, reporter]);

  const restoreBug = useCallback(async (bugId: string) => {
    const result = await reporter.restoreBug(bugId);
    setTracking((current) => ({ ...current, stale: true }));
    try {
      await refreshCurrentBugs();
    } catch {
      // The restore succeeded. The tracking state separately exposes refresh failure.
    }
    return result;
  }, [refreshCurrentBugs, reporter]);

  const archiveClosedBugs = useCallback(async () => {
    const result = await reporter.archiveClosedBugs();
    setTracking((current) => ({ ...current, stale: true }));
    try {
      await refreshCurrentBugs();
    } catch {
      // The archive succeeded. The tracking state separately exposes refresh failure.
    }
    return result;
  }, [refreshCurrentBugs, reporter]);

  const value = useMemo<HandrailBugReporterContextValue>(
    () => ({
      reporter,
      policy,
      policyStatus,
      isVanilla: policyStatus !== "loading" && policy === null,
      automationOptions: policy?.askOptions || [],
      canAttachScreenshot: reporter.configuration.allowScreenshots,
      form,
      setForm,
      updateForm,
      replaceScreenshot,
      removeScreenshot,
      setAutomationRequest,
      refreshPolicy,
      submit,
      submission,
      resetSubmission,
      tracking,
      refreshBugs,
      refreshCurrentBugs,
      loadMoreBugs,
      archiveBug,
      restoreBug,
      archiveClosedBugs,
    }),
    [
      form,
      archiveBug,
      archiveClosedBugs,
      policy,
      policyStatus,
      refreshPolicy,
      refreshBugs,
      refreshCurrentBugs,
      loadMoreBugs,
      removeScreenshot,
      replaceScreenshot,
      reporter,
      resetSubmission,
      restoreBug,
      setAutomationRequest,
      submission,
      submit,
      tracking,
      updateForm,
    ],
  );

  return createElement(
    HandrailBugReporterIdentityContext.Provider,
    { value: SDK_IDENTITY },
    createElement(HandrailBugReporterContext.Provider, { value }, children),
  );
}

export function useHandrailBugReporter(): HandrailBugReporterContextValue {
  const context = useContext(HandrailBugReporterContext);
  if (!context) {
    throw new Error(
      "useHandrailBugReporter must be used inside HandrailBugReporterProvider.",
    );
  }
  return context;
}
