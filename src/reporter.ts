import type { ReporterSdkIdentity, StampedBugReport } from "./identity";
import {
  normalizeBugImpact,
  type BugImpact,
  type HandrailBugSeverity,
} from "./severity";

export const APPLICATION_SESSION_TOKEN_HEADER =
  "x-handrail-application-session-token" as const;
export const BUG_REPORT_TOKEN_HEADER = "x-handrail-bug-report-token" as const;
export const MAX_SCREENSHOT_BYTES = 20 * 1024 * 1024;
export const REDACTED_VALUE = "[REDACTED]" as const;
export const MAX_BUG_HISTORY_SEARCH_CHARACTERS = 200;

export const BUG_TRACKING_STATUS_GROUPS = Object.freeze([
  "needs_attention",
  "in_progress",
  "closed",
  "not_reproduced",
] as const);

export const BUG_TRACKING_SORTS = Object.freeze([
  "newest",
  "oldest",
] as const);

export const BUG_TRACKING_VISIBILITIES = Object.freeze([
  "active",
  "archived",
  "all",
] as const);

/** @deprecated Bug reporters no longer select automation or deployment. */
export type AutomationOptionKey =
  | "auto_verify"
  | "repair_proposal"
  | "fix"
  | "deploy_staging"
  | "deploy_production";
export const AUTOMATION_OPTIONS: readonly AutomationOption[] = Object.freeze([]);
export type ReporterAccessLevel = "default" | "user" | "full_access";
export type KnownUserAutomationRole = "requester" | "contributor" | "maintainer";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface BugReporterEndpoints {
  readonly reports: string;
  readonly policy: string;
  readonly history: string;
  readonly bugs: string;
}

export interface AutomationOption {
  readonly key: AutomationOptionKey;
  readonly label: string;
}

export type BugAutomationMaxRisk = "none" | "low" | "moderate" | "high";

export interface BugReporterAutomationPolicy {
  readonly schemaVersion: 3;
  readonly automaticFixMaxRisk: BugAutomationMaxRisk;
  readonly productionMaxRiskByImpact: Readonly<
    Record<BugImpact, BugAutomationMaxRisk>
  >;
}

export interface BugReporterPolicy {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly environment: string;
  readonly identityVerified: true;
  readonly allUsersHistory?: boolean;
  readonly accessLevel: ReporterAccessLevel;
  /** Canonical shared role on newer servers; accessLevel remains for compatibility. */
  readonly role?: KnownUserAutomationRole | null;
  readonly askOptions: readonly AutomationOption[];
  readonly automationPolicy?: BugReporterAutomationPolicy;
  /** Present when the policy endpoint advertises verified-user notification eligibility. */
  readonly reporterNotifications?: ReporterNotificationEligibility;
}

export interface ReporterNotificationEligibility {
  readonly available: boolean;
  readonly recipientHint: string | null;
  /** New Handrail servers advertise only fixed; deployed remains accepted for older servers. */
  readonly lifecycles: readonly ("fixed" | "deployed")[];
}

export interface ScreenshotAttachment {
  readonly data: string | Blob | ArrayBuffer | ArrayBufferView;
  readonly mimeType?: "image/png" | "image/jpeg";
  readonly filename?: string;
}

export interface BugReportInput {
  readonly title: string;
  readonly description: string;
  /** Canonical cross-SDK impact. New integrations should use this field. */
  readonly impact?: BugImpact;
  /** @deprecated Use impact. Legacy labels and sev1..sev4 remain accepted. */
  readonly severity?: BugImpact | HandrailBugSeverity | "medium" | (string & {});
  readonly route?: string;
  readonly appVersion?: string;
  readonly buildNumber?: string;
  readonly commitSha?: string;
  readonly appFlavor?: string;
  readonly reproducer?: string;
  readonly stepsToReproduce?: string;
  /** Stable identity for an exact trusted-server retry. The SDK generates one when omitted. */
  readonly eventId?: string;
  readonly profileKey?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly screenshot?: ScreenshotAttachment;
  /** Explicit report-scoped consent for one email after the fix reaches the report environment. */
  readonly notification?: ReporterNotificationPreference;
}

export interface ReporterNotificationPreference {
  readonly notifyOnResolution: true;
  readonly consentVersion?: "v1" | string;
  /** @deprecated The server derives the recipient from the verified Known User identity. */
  readonly email?: string;
}

export interface ReporterNotificationSubscription {
  readonly active: boolean;
  readonly created: boolean;
  readonly recipientHint: string | null;
  readonly subscribedAt: string | null;
}

export type RedactionHook = (
  report: Readonly<Record<string, JsonValue>>,
) =>
  | Readonly<Record<string, unknown>>
  | Promise<Readonly<Record<string, unknown>>>;

export interface ReporterRetryOptions {
  /** Total request attempts, including the first request. Maximum: 3. */
  readonly maxAttempts?: number;
  /** Base delay before retrying. Each subsequent delay doubles. */
  readonly delayMs?: number;
}

export type BugReporterTransport = "direct" | "same-origin";

export interface BugReporterConfig {
  /** Explicitly set false to create a no-network reporter. Defaults to true. */
  readonly enabled?: boolean;
  /** A Handrail origin, an `/api` base, or the complete intake endpoint. */
  readonly apiBaseUrl?: string;
  readonly projectId?: string;
  readonly environment?: string;
  readonly reportToken?: string;
  /**
   * Use `same-origin` when a server forwarding handler owns the report token
   * and resolves an HttpOnly application session. This mode accepts only an
   * absolute-path API URL and never sends either token from browser code.
   */
  readonly transport?: BugReporterTransport;
  readonly reportTokenHeader?: "authorization" | typeof BUG_REPORT_TOKEN_HEADER;
  readonly applicationSessionTokenProvider?: () =>
    | string
    | null
    | undefined
    | Promise<string | null | undefined>;
  readonly allowScreenshots?: boolean;
  readonly redactionHooks?: readonly RedactionHook[];
  readonly retry?: ReporterRetryOptions;
  /**
   * Maximum time to wait for best-effort optional-action policy discovery.
   * Defaults to 5 seconds. Report submission is not subject to this deadline.
   */
  readonly policyDiscoveryTimeoutMs?: number;
  readonly fetch?: typeof fetch;
}

export type BugReporterConfigurationStatus =
  | "ready"
  | "disabled"
  | "misconfigured";

export interface BugReporterConfigurationSnapshot {
  readonly status: BugReporterConfigurationStatus;
  readonly enabled: boolean;
  readonly transport: BugReporterTransport;
  readonly endpoint: string | null;
  readonly projectId: string | null;
  readonly environment: string | null;
  readonly hasReportToken: boolean;
  readonly hasApplicationSessionTokenProvider: boolean;
  readonly allowScreenshots: boolean;
  readonly redactionHookCount: number;
  readonly maxAttempts: number;
  readonly policyDiscoveryTimeoutMs: number;
}

export interface SubmissionOptions {
  /** @deprecated Automation and deployment are selected only by project policy. */
  readonly automationRequests?: readonly AutomationOptionKey[];
  readonly signal?: AbortSignal;
}

export type BugTrackingStage =
  | "submitted"
  | "verifying"
  | "verified"
  | "fixing"
  | "fixed"
  | "deployed"
  | "closed"
  | "not_reproduced"
  | "wont_fix"
  | "needs_attention";

export type BugTrackingStatusGroup =
  (typeof BUG_TRACKING_STATUS_GROUPS)[number];
export type BugTrackingSort = (typeof BUG_TRACKING_SORTS)[number];
export type BugTrackingVisibility =
  (typeof BUG_TRACKING_VISIBILITIES)[number];

export interface BugTrackingStatusRollup {
  readonly stage: BugTrackingStage;
  readonly label: string;
  readonly terminal: boolean;
  readonly raw_status: string;
  readonly workflow_state: string | null;
  readonly environment: string | null;
  /** Application version first known to contain the fix. */
  readonly fixed_version: string | null;
  /** Current deployed application version for deployed stages. */
  readonly version: string | null;
  readonly reverification_status?: "in_progress" | "passed" | "failed" | null;
  readonly updated_at: string | null;
}

export type BugResolutionMilestoneKey =
  | "reported"
  | "confirmed"
  | "corrected"
  | "checked"
  | "released"
  | "confirmed_resolved";

export type BugResolutionMilestoneState =
  | "complete"
  | "current"
  | "upcoming"
  | "stopped";

export interface BugResolutionMilestone {
  readonly key: BugResolutionMilestoneKey;
  readonly label: string;
  readonly state: BugResolutionMilestoneState;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly duration_ms: number | null;
}

export interface BugResolutionNextStep {
  readonly kind: "read_only_runtime_diagnosis" | "scoped_diagnosis" | "owner_decision";
  readonly label: string;
  readonly summary: string;
}

export interface BugResolutionJourney {
  readonly schema_version: 1;
  readonly headline: string;
  readonly outcome: "in_progress" | "resolved" | "needs_attention" | "not_reproduced" | "closed";
  readonly handling: "automatic" | "team_review" | "unknown";
  readonly next_step: BugResolutionNextStep | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly total_duration_ms: number | null;
  readonly verification_method: string | null;
  readonly verification_label: string | null;
  readonly release_environment: string | null;
  readonly fixed_version: string | null;
  readonly released_version: string | null;
  readonly automatic_fix_authorized: boolean;
  readonly automatic_delivery_authorized: boolean;
  readonly approval_required: boolean;
  readonly milestones: readonly BugResolutionMilestone[];
}

export interface TrackedBugRecord {
  readonly is_owner?: boolean;
  readonly id: string;
  readonly title: string;
  readonly severity: string;
  readonly impact: BugImpact;
  readonly environment: string;
  readonly status: string;
  /** Stable semantic group for app-owned filters and status styling. */
  readonly status_group: BugTrackingStatusGroup;
  readonly status_rollup: BugTrackingStatusRollup;
  /** Customer-safe lifecycle projection. Null against older Handrail servers. */
  readonly resolution_journey?: BugResolutionJourney | null;
  /** Metadata from this reporter's latest submission for the canonical bug. */
  readonly reported_app_version: string | null;
  readonly reported_route: string | null;
  readonly reported_app_flavor: string | null;
  /** Reporter-owned presentation state; it never changes the Handrail PM bug. */
  readonly archived: boolean;
  readonly archived_at: string | null;
  /** Canonical occurrences across all reporters for a grouped crash. */
  readonly occurrence_count: number;
  /** Occurrences submitted by the current verified application user. */
  readonly reporter_occurrence_count: number;
  readonly first_reported_at: string | null;
  readonly last_reported_at: string | null;
  readonly created_at: string | null;
  readonly updated_at: string | null;
  readonly fixed_at: string | null;
  readonly closed_at: string | null;
}

export interface BugTrackingSummary {
  /** All bugs matching the current search before status-group filtering. */
  readonly total: number;
  readonly needs_attention: number;
  readonly in_progress: number;
  readonly closed: number;
  readonly not_reproduced: number;
}

export interface BugTrackingQuery {
  readonly audience?: "mine" | "all";
  readonly search: string | null;
  readonly statusGroup: BugTrackingStatusGroup | null;
  readonly sort: BugTrackingSort;
  readonly visibility: BugTrackingVisibility;
}

export interface BugTrackingPage {
  readonly contract_version: "v1";
  readonly bugs: readonly TrackedBugRecord[];
  /** Null only when rolling against an older Handrail history endpoint. */
  readonly summary: BugTrackingSummary | null;
  /** The server-normalized discovery query, or null for an older endpoint. */
  readonly query: BugTrackingQuery | null;
  readonly pagination: {
    readonly limit: number;
    /** Matching search + status group count, or null for an older endpoint. */
    readonly filtered_count: number | null;
    readonly has_more: boolean;
    readonly next_cursor: string | null;
  };
}

export interface BugTrackingListOptions {
  readonly audience?: "mine" | "all";
  /** Defaults to 20 and is capped by Handrail at 50. */
  readonly limit?: number;
  /** Opaque keyset cursor returned by the previous page. */
  readonly cursor?: string;
  /** Case-insensitive literal search over title, route, version, and flavor. */
  readonly search?: string;
  readonly statusGroup?: BugTrackingStatusGroup;
  /** Defaults to newest reporter submission first. */
  readonly sort?: BugTrackingSort;
  /** Defaults to active; archived recurrences automatically become active. */
  readonly visibility?: BugTrackingVisibility;
  readonly signal?: AbortSignal;
}

export interface BugArchiveResult {
  readonly contract_version: "v1";
  readonly bugId: string;
  readonly archived: boolean;
  readonly archivedAt: string | null;
}

export interface BugArchiveClosedResult {
  readonly contract_version: "v1";
  readonly archivedCount: number;
}

export type BugReportSubmissionResult =
  | Readonly<{ status: "disabled" }>
  | Readonly<{
      status: "submitted";
      statusCode: number;
      bugId: string | null;
      response: JsonValue | null;
      notificationSubscription?: ReporterNotificationSubscription | null;
      notificationWarning?: string | null;
    }>;

export type BugReporterErrorCode =
  | "invalid_configuration"
  | "invalid_report"
  | "invalid_screenshot"
  | "redaction_failed"
  | "request_failed"
  | "submission_rejected"
  | "tracking_unavailable"
  | "tracking_rejected";

export interface BugReporterUpstreamError {
  /** Stable error code returned by Handrail, when one is available. */
  readonly code: string | null;
  /** Bounded Handrail diagnostic with request credentials redacted. */
  readonly message: string | null;
  /** Correlation ID returned by Handrail or its HTTP boundary. */
  readonly requestId: string | null;
}

/**
 * Error messages are intentionally generic and never include request data.
 * Rejected submissions may also expose bounded, credential-redacted Handrail
 * diagnostics through the upstream fields for server-side logging and mapping.
 */
export class BugReporterError extends Error {
  readonly code: BugReporterErrorCode;
  readonly statusCode: number | null;
  readonly upstreamCode: string | null;
  readonly upstreamMessage: string | null;
  readonly requestId: string | null;

  constructor(
    code: BugReporterErrorCode,
    message: string,
    statusCode: number | null = null,
    upstream: BugReporterUpstreamError | null = null,
  ) {
    super(message);
    this.name = "BugReporterError";
    this.code = code;
    this.statusCode = statusCode;
    this.upstreamCode = upstream?.code ?? null;
    this.upstreamMessage = upstream?.message ?? null;
    this.requestId = upstream?.requestId ?? null;
  }
}

interface ReporterIdentityAdapter {
  readonly identity: ReporterSdkIdentity;
  stamp<T extends Readonly<Record<string, unknown>>>(
    report: T,
  ): StampedBugReport<T, ReporterSdkIdentity>;
}

interface NormalizedScreenshot {
  readonly base64: string;
  readonly filename: string;
  readonly mimeType: "image/png" | "image/jpeg";
}

interface ReporterRequestResult {
  readonly response: Response | null;
  readonly sensitiveValues: readonly string[];
}

const AUTOMATION_OPTION_BY_KEY = new Map<AutomationOptionKey, AutomationOption>(
  AUTOMATION_OPTIONS.map((option) => [option.key, option]),
);
const ACCESS_LEVELS = new Set<ReporterAccessLevel>([
  "default",
  "user",
  "full_access",
]);
const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const CALLER_REPORT_FIELDS = Object.freeze([
  "title",
  "description",
  "severity",
  "route",
  "app_version",
  "build_number",
  "commit_sha",
  "app_flavor",
  "reproducer",
  "metadata",
] as const);
const OMIT = Symbol("omit");
const MAX_UPSTREAM_ERROR_BODY_CHARACTERS = 16_384;
const MAX_UPSTREAM_ERROR_MESSAGE_CHARACTERS = 500;
const MAX_UPSTREAM_ERROR_CODE_CHARACTERS = 120;
const MAX_REQUEST_ID_CHARACTERS = 200;
const DEFAULT_POLICY_DISCOVERY_TIMEOUT_MS = 5_000;
const MAX_POLICY_DISCOVERY_TIMEOUT_MS = 30_000;
const POLICY_IDENTITY_RETRY_DELAYS_MS = Object.freeze([100, 250]);
const POLICY_DISCOVERY_INTERRUPTED = Symbol("policy discovery interrupted");

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function boundedDiagnosticString(value: unknown, maximum: number): string | null {
  const cleaned = cleanString(value)?.replace(/[\u0000-\u001f\u007f]+/g, " ");
  return cleaned ? cleaned.slice(0, maximum) : null;
}

function redactDiagnosticSecrets(
  value: string | null,
  sensitiveValues: readonly string[],
): string | null {
  if (!value) return null;
  let redacted = value;
  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue) redacted = redacted.replaceAll(sensitiveValue, REDACTED_VALUE);
  }
  redacted = redacted.replace(/\bhbr_[A-Za-z0-9_-]+\b/g, REDACTED_VALUE);
  return redacted;
}

function safeUpstreamCode(value: unknown): string | null {
  const code = boundedDiagnosticString(value, MAX_UPSTREAM_ERROR_CODE_CHARACTERS);
  return code && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(code) ? code : null;
}

function safeRequestId(value: unknown): string | null {
  const requestId = boundedDiagnosticString(value, MAX_REQUEST_ID_CHARACTERS);
  return requestId && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(requestId)
    ? requestId
    : null;
}

async function parseUpstreamError(
  response: Response,
  sensitiveValues: readonly string[],
): Promise<BugReporterUpstreamError> {
  const headerRequestId =
    safeRequestId(response.headers.get("x-request-id")) ||
    safeRequestId(response.headers.get("x-handrail-request-id"));
  let body: Record<string, unknown> | null = null;
  try {
    const text = await response.text();
    if (text.length <= MAX_UPSTREAM_ERROR_BODY_CHARACTERS) {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    }
  } catch {
    body = null;
  }

  const errorValue = body?.error;
  const errorRecord =
    errorValue && typeof errorValue === "object" && !Array.isArray(errorValue)
      ? (errorValue as Record<string, unknown>)
      : null;
  const code = safeUpstreamCode(errorRecord?.code ?? body?.code);
  const rawMessage =
    errorRecord?.message ??
    (typeof errorValue === "string" ? errorValue : body?.message);
  const message = redactDiagnosticSecrets(
    boundedDiagnosticString(rawMessage, MAX_UPSTREAM_ERROR_MESSAGE_CHARACTERS),
    sensitiveValues,
  );
  const requestId =
    headerRequestId ||
    safeRequestId(errorRecord?.requestId ?? errorRecord?.request_id) ||
    safeRequestId(body?.requestId ?? body?.request_id);
  return Object.freeze({ code, message, requestId });
}

function endpointPath(pathname: string): string {
  const path = pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (path.endsWith("/api/mobile-bug-reports")) return path;
  if (path.endsWith("/api")) return `${path}/mobile-bug-reports`;
  return `${path}/api/mobile-bug-reports`.replace(/^\/\//, "/");
}

/** Normalize absolute Handrail origins and absolute-path `/api` bases. */
export function normalizeBugReporterEndpoints(
  apiBaseUrl: string,
): BugReporterEndpoints {
  const input = cleanString(apiBaseUrl);
  if (!input || /[?#]/.test(input)) {
    throw new BugReporterError(
      "invalid_configuration",
      "Bug reporting is not configured.",
    );
  }

  if (input.startsWith("/")) {
    if (input.startsWith("//")) {
      throw new BugReporterError(
        "invalid_configuration",
        "Bug reporting is not configured.",
      );
    }
    const reports = endpointPath(input);
    return Object.freeze({
      reports,
      policy: `${reports}/policy`,
      history: `${reports}/mine`,
      bugs: `${reports}/bugs`,
    });
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BugReporterError(
      "invalid_configuration",
      "Bug reporting is not configured.",
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new BugReporterError(
      "invalid_configuration",
      "Bug reporting is not configured.",
    );
  }
  url.pathname = endpointPath(url.pathname);
  const reports = url.toString();
  return Object.freeze({
    reports,
    policy: `${reports}/policy`,
    history: `${reports}/mine`,
    bugs: `${reports}/bugs`,
  });
}

function isSensitiveKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
  return (
    /(?:^|_)(?:authorization|proxy_authorization|bearer|cookie|set_cookie|password|passwd|passphrase|credential|credentials|secret|client_secret|private_key|api_key|access_key|profile_key|session|session_id|session_token|access_token|refresh_token|id_token|jwt|csrf|xsrf|verifier|card_number|credit_card|cvv|cvc)(?:_|$)/.test(
      normalized,
    ) ||
    /(?:token|secret|password|credential|private_key)$/.test(normalized) ||
    /(?:^|_)(?:private_message|direct_message|dm_content)(?:_|$)/.test(
      normalized,
    )
  );
}

function jsonValue(
  input: unknown,
  seen: WeakSet<object>,
  depth: number,
): JsonValue | typeof OMIT {
  if (input == null) return null;
  if (typeof input === "string" || typeof input === "boolean") return input;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input === "bigint") return input.toString();
  if (typeof input !== "object") return OMIT;
  if (input instanceof Date) {
    return Number.isFinite(input.getTime()) ? input.toISOString() : null;
  }
  if (depth >= 20 || seen.has(input)) return "[Circular]";
  seen.add(input);
  try {
    if (Array.isArray(input)) {
      const output: JsonValue[] = [];
      for (const value of input) {
        const normalized = jsonValue(value, seen, depth + 1);
        if (normalized !== OMIT) output.push(normalized);
      }
      return output;
    }
    const output: Record<string, JsonValue> = {};
    for (const [rawKey, value] of Object.entries(input)) {
      const key = rawKey.slice(0, 200);
      if (!key || ["__proto__", "prototype", "constructor"].includes(key)) {
        continue;
      }
      if (isSensitiveKey(key)) {
        output[key] = REDACTED_VALUE;
        continue;
      }
      const normalized = jsonValue(value, seen, depth + 1);
      if (normalized !== OMIT) output[key] = normalized;
    }
    return output;
  } finally {
    seen.delete(input);
  }
}

/** Clone a value into JSON while replacing values under sensitive keys. */
export function redactSensitiveValues(
  input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, JsonValue>> {
  const normalized = jsonValue(input, new WeakSet(), 0);
  if (!normalized || Array.isArray(normalized) || typeof normalized !== "object") {
    return Object.freeze({});
  }
  return normalized as JsonObject;
}

function base64Size(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function normalizeBase64(value: string): string | null {
  const cleaned = value.replace(/\s+/g, "");
  if (
    !cleaned ||
    cleaned.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) ||
    /=/.test(cleaned.slice(0, -2))
  ) {
    return null;
  }
  return cleaned.padEnd(Math.ceil(cleaned.length / 4) * 4, "=");
}

function base64Prefix(base64: string, byteLimit = 12): Uint8Array {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const output: number[] = [];
  let bits = 0;
  let bitCount = 0;
  for (const character of base64) {
    if (character === "=") break;
    const value = alphabet.indexOf(character);
    if (value < 0) break;
    bits = (bits << 6) | value;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      output.push((bits >> bitCount) & 0xff);
      if (output.length >= byteLimit) break;
      bits &= (1 << bitCount) - 1;
    }
  }
  return new Uint8Array(output);
}

function detectedImageMimeType(
  bytes: Uint8Array,
): "image/png" | "image/jpeg" | null {
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    )
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  return null;
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const chunks: string[] = [];
  const chunkSize = 12_288;
  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += chunkSize) {
    const end = Math.min(bytes.length, chunkStart + chunkSize);
    let chunk = "";
    for (let index = chunkStart; index < end; index += 3) {
      const first = bytes[index] ?? 0;
      const hasSecond = index + 1 < bytes.length;
      const hasThird = index + 2 < bytes.length;
      const second = bytes[index + 1] ?? 0;
      const third = bytes[index + 2] ?? 0;
      const value = (first << 16) | (second << 8) | third;
      chunk += alphabet[(value >> 18) & 63];
      chunk += alphabet[(value >> 12) & 63];
      chunk += hasSecond ? alphabet[(value >> 6) & 63] : "=";
      chunk += hasThird ? alphabet[value & 63] : "=";
    }
    chunks.push(chunk);
  }
  return chunks.join("");
}

function safeScreenshotFilename(
  value: unknown,
  mimeType: "image/png" | "image/jpeg",
): string {
  const fallback = mimeType === "image/png" ? "screenshot.png" : "screenshot.jpg";
  const cleaned = cleanString(value)
    ?.replace(/[\\/\u0000-\u001f\u007f]/g, "_")
    .slice(0, 200);
  return cleaned || fallback;
}

function screenshotError(): BugReporterError {
  return new BugReporterError(
    "invalid_screenshot",
    "The screenshot must be one PNG or JPEG image no larger than 20 MiB.",
  );
}

async function normalizeScreenshot(
  screenshot: ScreenshotAttachment,
): Promise<NormalizedScreenshot> {
  if (!screenshot || typeof screenshot !== "object" || Array.isArray(screenshot)) {
    throw screenshotError();
  }
  let declaredMimeType = cleanString(screenshot.mimeType);
  let bytes: Uint8Array | null = null;
  let base64: string | null = null;

  if (typeof screenshot.data === "string") {
    let encoded = screenshot.data;
    const dataUrl = encoded.match(/^data:([^;,]+);base64,([\s\S]*)$/i);
    if (dataUrl) {
      if (declaredMimeType && declaredMimeType !== dataUrl[1].toLowerCase()) {
        throw screenshotError();
      }
      declaredMimeType = dataUrl[1].toLowerCase();
      encoded = dataUrl[2];
    }
    base64 = normalizeBase64(encoded);
    if (!base64 || base64Size(base64) > MAX_SCREENSHOT_BYTES) {
      throw screenshotError();
    }
    bytes = base64Prefix(base64);
  } else if (
    typeof Blob !== "undefined" &&
    screenshot.data instanceof Blob
  ) {
    if (screenshot.data.size > MAX_SCREENSHOT_BYTES) throw screenshotError();
    if (declaredMimeType && screenshot.data.type && declaredMimeType !== screenshot.data.type) {
      throw screenshotError();
    }
    declaredMimeType = declaredMimeType || cleanString(screenshot.data.type);
    bytes = new Uint8Array(await screenshot.data.arrayBuffer());
  } else if (ArrayBuffer.isView(screenshot.data)) {
    bytes = new Uint8Array(
      screenshot.data.buffer,
      screenshot.data.byteOffset,
      screenshot.data.byteLength,
    );
  } else if (screenshot.data instanceof ArrayBuffer) {
    bytes = new Uint8Array(screenshot.data);
  } else {
    throw screenshotError();
  }

  const detectedMimeType = detectedImageMimeType(bytes);
  if (
    !detectedMimeType ||
    !["image/png", "image/jpeg"].includes(declaredMimeType || detectedMimeType) ||
    (declaredMimeType && declaredMimeType !== detectedMimeType) ||
    (!base64 && bytes.byteLength > MAX_SCREENSHOT_BYTES)
  ) {
    throw screenshotError();
  }
  base64 ||= encodeBase64(bytes);
  return Object.freeze({
    base64,
    filename: safeScreenshotFilename(screenshot.filename, detectedMimeType),
    mimeType: detectedMimeType,
  });
}

function randomEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `js-${globalThis.crypto.randomUUID()}`;
  }
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return `js-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
  }
  return `js-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizedAttempts(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value)
    ? Math.min(3, Math.max(1, value))
    : 1;
}

function normalizedDelay(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(30_000, Math.max(0, value))
    : 250;
}

function normalizedPolicyDiscoveryTimeout(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(MAX_POLICY_DISCOVERY_TIMEOUT_MS, Math.max(1, Math.round(value)))
    : DEFAULT_POLICY_DISCOVERY_TIMEOUT_MS;
}

function sleep(milliseconds: number): Promise<void> {
  return milliseconds <= 0
    ? Promise.resolve()
    : new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function jsonObjectOrNull(input: unknown): JsonValue | null {
  const value = jsonValue(input, new WeakSet(), 0);
  return value === OMIT ? null : value;
}

const BUG_TRACKING_STAGES = new Set<BugTrackingStage>([
  "submitted",
  "verifying",
  "verified",
  "fixing",
  "fixed",
  "deployed",
  "closed",
  "not_reproduced",
  "wont_fix",
  "needs_attention",
]);
const BUG_TRACKING_STATUS_GROUP_SET = new Set<BugTrackingStatusGroup>(
  BUG_TRACKING_STATUS_GROUPS,
);
const BUG_RESOLUTION_MILESTONE_KEY_SET = new Set<BugResolutionMilestoneKey>([
  "reported",
  "confirmed",
  "corrected",
  "checked",
  "released",
  "confirmed_resolved",
]);
const BUG_RESOLUTION_MILESTONE_STATE_SET = new Set<BugResolutionMilestoneState>([
  "complete",
  "current",
  "upcoming",
  "stopped",
]);
const BUG_TRACKING_SORT_SET = new Set<BugTrackingSort>(BUG_TRACKING_SORTS);
const BUG_TRACKING_VISIBILITY_SET = new Set<BugTrackingVisibility>(
  BUG_TRACKING_VISIBILITIES,
);

function plainRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : null;
}

function nullableString(input: unknown): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function notificationSubscriptionFromResponse(
  input: unknown,
): ReporterNotificationSubscription | null {
  const subscription = plainRecord(
    plainRecord(input)?.notification_subscription,
  );
  if (subscription?.active !== true) return null;
  return Object.freeze({
    active: true,
    created: subscription.created === true,
    recipientHint: nullableString(subscription.recipient_hint),
    subscribedAt: nullableString(subscription.subscribed_at),
  });
}

function nonNegativeNumber(input: unknown, fallback: number): number {
  const value = Number(input);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function nonNegativeInteger(input: unknown): number | null {
  const value = Number(input);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function statusGroupForRollup(
  stage: BugTrackingStage,
  terminal: boolean,
): BugTrackingStatusGroup {
  if (stage === "needs_attention") return "needs_attention";
  if (stage === "not_reproduced") return "not_reproduced";
  return terminal ? "closed" : "in_progress";
}

function bugResolutionJourney(input: unknown): BugResolutionJourney | null {
  const record = plainRecord(input);
  if (!record || record.schema_version !== 1) return null;
  const headline = nullableString(record.headline);
  const outcome = nullableString(record.outcome) as BugResolutionJourney["outcome"] | null;
  const handling = nullableString(record.handling) as BugResolutionJourney["handling"] | null;
  if (
    !headline
    || !outcome
    || !["in_progress", "resolved", "needs_attention", "not_reproduced", "closed"].includes(outcome)
    || !handling
    || !["automatic", "team_review", "unknown"].includes(handling)
    || typeof record.automatic_fix_authorized !== "boolean"
    || typeof record.automatic_delivery_authorized !== "boolean"
    || typeof record.approval_required !== "boolean"
    || !Array.isArray(record.milestones)
  ) return null;
  const milestones: BugResolutionMilestone[] = [];
  const seen = new Set<BugResolutionMilestoneKey>();
  for (const inputMilestone of record.milestones) {
    const milestone = plainRecord(inputMilestone);
    const key = nullableString(milestone?.key) as BugResolutionMilestoneKey | null;
    const label = nullableString(milestone?.label);
    const state = nullableString(milestone?.state) as BugResolutionMilestoneState | null;
    const duration = milestone?.duration_ms === null
      ? null
      : nonNegativeNumber(milestone?.duration_ms, Number.NaN);
    if (
      !milestone || !key || !BUG_RESOLUTION_MILESTONE_KEY_SET.has(key) || seen.has(key)
      || !label || !state || !BUG_RESOLUTION_MILESTONE_STATE_SET.has(state)
      || (duration !== null && !Number.isFinite(duration))
    ) return null;
    seen.add(key);
    milestones.push(Object.freeze({
      key,
      label,
      state,
      started_at: nullableString(milestone.started_at),
      completed_at: nullableString(milestone.completed_at),
      duration_ms: duration,
    }));
  }
  if (milestones.length !== BUG_RESOLUTION_MILESTONE_KEY_SET.size) return null;
  const totalDuration = record.total_duration_ms === null
    ? null
    : nonNegativeNumber(record.total_duration_ms, Number.NaN);
  if (totalDuration !== null && !Number.isFinite(totalDuration)) return null;
  const nextStepRecord = plainRecord(record.next_step);
  const nextStepKind = nullableString(nextStepRecord?.kind) as BugResolutionNextStep["kind"] | null;
  const nextStepLabel = nullableString(nextStepRecord?.label);
  const nextStepSummary = nullableString(nextStepRecord?.summary);
  const nextStep = nextStepRecord && nextStepKind && nextStepLabel && nextStepSummary
    && ["read_only_runtime_diagnosis", "scoped_diagnosis", "owner_decision"].includes(nextStepKind)
    ? Object.freeze({ kind: nextStepKind, label: nextStepLabel, summary: nextStepSummary })
    : null;
  return Object.freeze({
    schema_version: 1,
    headline,
    outcome,
    handling,
    next_step: nextStep,
    started_at: nullableString(record.started_at),
    completed_at: nullableString(record.completed_at),
    total_duration_ms: totalDuration,
    verification_method: nullableString(record.verification_method),
    verification_label: nullableString(record.verification_label),
    release_environment: nullableString(record.release_environment),
    fixed_version: nullableString(record.fixed_version),
    released_version: nullableString(record.released_version),
    automatic_fix_authorized: record.automatic_fix_authorized,
    automatic_delivery_authorized: record.automatic_delivery_authorized,
    approval_required: record.approval_required,
    milestones: Object.freeze(milestones),
  });
}

function trackedBugRecord(input: unknown): TrackedBugRecord | null {
  const record = plainRecord(input);
  const rollup = plainRecord(record?.status_rollup);
  const stage = nullableString(rollup?.stage) as BugTrackingStage | null;
  const id = nullableString(record?.id);
  const title = nullableString(record?.title);
  const severity = nullableString(record?.severity);
  const impact = normalizeBugImpact(record?.canonical_impact ?? severity);
  const environment = nullableString(record?.environment);
  const status = nullableString(record?.status);
  const label = nullableString(rollup?.label);
  const rawStatus = nullableString(rollup?.raw_status);
  if (
    !record || !id || !title || !severity || !impact || !environment || !status || !label
    || !rawStatus || !stage || !BUG_TRACKING_STAGES.has(stage)
    || typeof rollup?.terminal !== "boolean"
  ) {
    return null;
  }
  const statusGroup = statusGroupForRollup(stage, rollup.terminal);
  const providedStatusGroup = nullableString(record.status_group);
  if (
    providedStatusGroup
    && (
      !BUG_TRACKING_STATUS_GROUP_SET.has(
        providedStatusGroup as BugTrackingStatusGroup,
      )
      || providedStatusGroup !== statusGroup
    )
  ) return null;
  if (
    record.archived !== undefined
    && typeof record.archived !== "boolean"
  ) return null;
  const archived = record.archived === true;
  const archivedAt = nullableString(record.archived_at);
  if ((archived && !archivedAt) || (!archived && archivedAt)) return null;
  return Object.freeze({
    id,
    title,
    severity,
    impact,
    environment,
    status,
    status_group: statusGroup,
    status_rollup: Object.freeze({
      stage,
      label,
      terminal: rollup.terminal,
      raw_status: rawStatus,
      workflow_state: nullableString(rollup.workflow_state),
      environment: nullableString(rollup.environment),
      fixed_version: nullableString(rollup.fixed_version),
      version: nullableString(rollup.version),
      reverification_status: ["in_progress", "passed", "failed"].includes(
        nullableString(rollup.reverification_status) || "",
      )
        ? nullableString(rollup.reverification_status) as "in_progress" | "passed" | "failed"
        : null,
      updated_at: nullableString(rollup.updated_at),
    }),
    resolution_journey: bugResolutionJourney(record.resolution_journey),
    is_owner: record.is_owner !== false,
    reported_app_version: nullableString(record.reported_app_version),
    reported_route: nullableString(record.reported_route),
    reported_app_flavor: nullableString(record.reported_app_flavor),
    archived,
    archived_at: archivedAt,
    occurrence_count: nonNegativeNumber(record.occurrence_count, 1),
    reporter_occurrence_count: nonNegativeNumber(
      record.reporter_occurrence_count,
      1,
    ),
    first_reported_at: nullableString(record.first_reported_at),
    last_reported_at: nullableString(record.last_reported_at),
    created_at: nullableString(record.created_at),
    updated_at: nullableString(record.updated_at),
    fixed_at: nullableString(record.fixed_at),
    closed_at: nullableString(record.closed_at),
  });
}

function trackingSummary(input: unknown): BugTrackingSummary | null {
  const record = plainRecord(input);
  if (!record) return null;
  const summary = {
    total: nonNegativeInteger(record.total),
    needs_attention: nonNegativeInteger(record.needs_attention),
    in_progress: nonNegativeInteger(record.in_progress),
    closed: nonNegativeInteger(record.closed),
    not_reproduced: nonNegativeInteger(record.not_reproduced),
  };
  if (Object.values(summary).some((value) => value === null)) return null;
  const complete = summary as BugTrackingSummary;
  if (
    complete.total !== complete.needs_attention
      + complete.in_progress
      + complete.closed
      + complete.not_reproduced
  ) return null;
  return Object.freeze(complete);
}

function trackingQuery(input: unknown): BugTrackingQuery | null {
  const record = plainRecord(input);
  if (!record) return null;
  const search = record.search === null ? null : nullableString(record.search);
  if (
    record.search !== null
    && (
      !search
      || search.length > MAX_BUG_HISTORY_SEARCH_CHARACTERS
    )
  ) return null;
  const rawStatusGroup = record.status_group === null
    ? null
    : nullableString(record.status_group);
  if (
    rawStatusGroup
    && !BUG_TRACKING_STATUS_GROUP_SET.has(
      rawStatusGroup as BugTrackingStatusGroup,
    )
  ) return null;
  if (record.status_group !== null && !rawStatusGroup) return null;
  const sort = nullableString(record.sort) as BugTrackingSort | null;
  if (!sort || !BUG_TRACKING_SORT_SET.has(sort)) return null;
  const visibility = record.visibility === undefined
    ? "active"
    : nullableString(record.visibility) as BugTrackingVisibility | null;
  if (!visibility || !BUG_TRACKING_VISIBILITY_SET.has(visibility)) return null;
  return Object.freeze({
    search,
    ...(record.audience === "all" ? { audience: "all" as const } : {}),
    statusGroup: rawStatusGroup as BugTrackingStatusGroup | null,
    sort,
    visibility,
  });
}

function trackingPage(input: unknown): BugTrackingPage | null {
  const record = plainRecord(input);
  const pagination = plainRecord(record?.pagination);
  if (
    !record
    || record.contract_version !== "v1"
    || !Array.isArray(record.bugs)
    || !pagination
    || typeof pagination.has_more !== "boolean"
  ) return null;
  const bugs = record.bugs.map(trackedBugRecord);
  if (bugs.some((bug) => !bug)) return null;
  const limit = Number(pagination.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return null;
  const nextCursor = nullableString(pagination.next_cursor);
  if (pagination.has_more && !nextCursor) return null;
  const hasDiscovery = record.summary !== undefined || record.query !== undefined;
  const summary = hasDiscovery ? trackingSummary(record.summary) : null;
  const query = hasDiscovery ? trackingQuery(record.query) : null;
  const filteredCount = pagination.filtered_count === undefined
    ? null
    : nonNegativeInteger(pagination.filtered_count);
  if (
    hasDiscovery
    && (
      !summary
      || !query
      || filteredCount === null
      || filteredCount !== (
        query.statusGroup ? summary[query.statusGroup] : summary.total
      )
    )
  ) return null;
  return Object.freeze({
    contract_version: "v1",
    bugs: Object.freeze(bugs as TrackedBugRecord[]),
    summary,
    query,
    pagination: Object.freeze({
      limit,
      filtered_count: filteredCount,
      has_more: pagination.has_more,
      next_cursor: nextCursor,
    }),
  });
}

function bugArchiveResult(input: unknown): BugArchiveResult | null {
  const record = plainRecord(input);
  const bugId = nullableString(record?.bug_id);
  if (
    record?.contract_version !== "v1"
    || !bugId
    || typeof record.archived !== "boolean"
  ) return null;
  const archivedAt = nullableString(record.archived_at);
  if ((record.archived && !archivedAt) || (!record.archived && archivedAt)) {
    return null;
  }
  return Object.freeze({
    contract_version: "v1",
    bugId,
    archived: record.archived,
    archivedAt,
  });
}

function bugArchiveClosedResult(input: unknown): BugArchiveClosedResult | null {
  const record = plainRecord(input);
  const archivedCount = nonNegativeInteger(record?.archived_count);
  if (record?.contract_version !== "v1" || archivedCount === null) return null;
  return Object.freeze({
    contract_version: "v1",
    archivedCount,
  });
}

function urlWithQuery(
  input: string,
  values: Readonly<Record<string, string | number | null | undefined>>,
): string {
  const relative = input.startsWith("/");
  const url = new URL(input, relative ? "http://relative.invalid" : undefined);
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  }
  return relative ? `${url.pathname}${url.search}` : url.toString();
}

function invalidTrackingQuery(): BugReporterError {
  return new BugReporterError(
    "tracking_rejected",
    "Bug history could not be loaded. Please try again.",
  );
}

function normalizedTrackingSearch(input: unknown): string | null {
  if (input === undefined || input === null || input === "") return null;
  if (typeof input !== "string") throw invalidTrackingQuery();
  const search = input.trim();
  if (!search) return null;
  if (search.length > MAX_BUG_HISTORY_SEARCH_CHARACTERS) {
    throw invalidTrackingQuery();
  }
  return search;
}

export class HandrailBugReporterClient {
  readonly configuration: BugReporterConfigurationSnapshot;

  private readonly endpoints: BugReporterEndpoints | null;
  private readonly projectId: string | null;
  private readonly environment: string | null;
  private readonly reportToken: string | null;
  private readonly transport: BugReporterTransport;
  private readonly reportTokenHeader:
    | "authorization"
    | typeof BUG_REPORT_TOKEN_HEADER;
  private readonly sessionProvider: BugReporterConfig["applicationSessionTokenProvider"];
  private readonly allowScreenshots: boolean;
  private readonly redactionHooks: readonly RedactionHook[];
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly policyDiscoveryTimeoutMs: number;
  private readonly fetchImpl: typeof fetch | null;
  private readonly identityAdapter: ReporterIdentityAdapter;
  #policy: BugReporterPolicy | null = null;
  #policyDiscoveryGeneration = 0;

  constructor(config: BugReporterConfig, identityAdapter: ReporterIdentityAdapter) {
    const enabled = config.enabled !== false;
    this.identityAdapter = identityAdapter;
    this.projectId = cleanString(config.projectId);
    this.environment = cleanString(config.environment)?.toLowerCase() || null;
    this.reportToken = cleanString(config.reportToken);
    this.transport = config.transport === "same-origin" ? "same-origin" : "direct";
    this.reportTokenHeader =
      config.reportTokenHeader === BUG_REPORT_TOKEN_HEADER
        ? BUG_REPORT_TOKEN_HEADER
        : "authorization";
    this.sessionProvider = config.applicationSessionTokenProvider;
    this.allowScreenshots = config.allowScreenshots === true;
    this.redactionHooks = Object.freeze([...(config.redactionHooks || [])]);
    this.maxAttempts = normalizedAttempts(config.retry?.maxAttempts);
    this.retryDelayMs = normalizedDelay(config.retry?.delayMs);
    this.policyDiscoveryTimeoutMs = normalizedPolicyDiscoveryTimeout(
      config.policyDiscoveryTimeoutMs,
    );
    const availableFetch = config.fetch || globalThis.fetch;
    this.fetchImpl =
      typeof availableFetch === "function" ? availableFetch.bind(globalThis) : null;

    let endpoints: BugReporterEndpoints | null = null;
    try {
      if (config.apiBaseUrl) {
        endpoints = normalizeBugReporterEndpoints(config.apiBaseUrl);
      }
    } catch {
      endpoints = null;
    }
    this.endpoints = endpoints;
    const directReady = this.transport === "direct" && Boolean(this.reportToken);
    const forwardingReady =
      this.transport === "same-origin" &&
      Boolean(endpoints?.reports.startsWith("/")) &&
      !this.reportToken &&
      typeof this.sessionProvider !== "function";
    const ready = Boolean(
      endpoints &&
        this.projectId &&
        this.environment &&
        this.fetchImpl &&
        (directReady || forwardingReady),
    );
    const status: BugReporterConfigurationStatus = !enabled
      ? "disabled"
      : ready
        ? "ready"
        : "misconfigured";
    this.configuration = Object.freeze({
      status,
      enabled,
      transport: this.transport,
      endpoint: endpoints?.reports || null,
      projectId: this.projectId,
      environment: this.environment,
      hasReportToken: Boolean(this.reportToken),
      hasApplicationSessionTokenProvider:
        typeof this.sessionProvider === "function",
      allowScreenshots: this.allowScreenshots,
      redactionHookCount: this.redactionHooks.length,
      maxAttempts: this.maxAttempts,
      policyDiscoveryTimeoutMs: this.policyDiscoveryTimeoutMs,
    });
  }

  get currentPolicy(): BugReporterPolicy | null {
    return this.#policy;
  }

  async discoverPolicy(signal?: AbortSignal): Promise<BugReporterPolicy | null> {
    const generation = ++this.#policyDiscoveryGeneration;
    this.#policy = null;
    if (this.configuration.status !== "ready") return null;
    const endpoint = new URL(
      this.endpoints!.policy,
      this.endpoints!.policy.startsWith("/") ? "http://relative.invalid" : undefined,
    );
    endpoint.searchParams.set("project_id", this.projectId!);
    endpoint.searchParams.set("environment", this.environment!);
    const policyUrl = this.endpoints!.policy.startsWith("/")
      ? `${endpoint.pathname}${endpoint.search}`
      : endpoint.toString();

    const controller = new AbortController();
    let resolveInterrupted!: (
      value: typeof POLICY_DISCOVERY_INTERRUPTED,
    ) => void;
    const interrupted = new Promise<typeof POLICY_DISCOVERY_INTERRUPTED>(
      (resolve) => {
        resolveInterrupted = resolve;
      },
    );
    let interruptionHandled = false;
    const interrupt = () => {
      if (interruptionHandled) return;
      interruptionHandled = true;
      controller.abort();
      resolveInterrupted(POLICY_DISCOVERY_INTERRUPTED);
    };
    const timeout = globalThis.setTimeout(
      interrupt,
      this.policyDiscoveryTimeoutMs,
    );
    if (signal?.aborted) interrupt();
    else signal?.addEventListener("abort", interrupt, { once: true });

    const lookup = (async (): Promise<BugReporterPolicy | null> => {
      const identityMayStillBeHydrating =
        typeof this.sessionProvider === "function" ||
        this.transport === "same-origin";
      for (
        let policyAttempt = 0;
        policyAttempt <= POLICY_IDENTITY_RETRY_DELAYS_MS.length;
        policyAttempt += 1
      ) {
        if (policyAttempt > 0) {
          await sleep(POLICY_IDENTITY_RETRY_DELAYS_MS[policyAttempt - 1]);
          if (controller.signal.aborted) return null;
        }
        const request = await this.requestWithRetries(policyUrl, {
          method: "GET",
          signal: controller.signal,
        });
        const response = request.response;
        if (!response?.ok) {
          const retryableResponse =
            identityMayStillBeHydrating &&
            (!response || TRANSIENT_STATUS_CODES.has(response.status));
          if (
            !retryableResponse ||
            policyAttempt === POLICY_IDENTITY_RETRY_DELAYS_MS.length
          ) {
            return null;
          }
          continue;
        }
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return null;
        }
        const policy = this.parsePolicy(body);
        if (policy) return policy;
        if (
          !identityMayStillBeHydrating ||
          policyAttempt === POLICY_IDENTITY_RETRY_DELAYS_MS.length
        ) {
          return null;
        }
      }
      return null;
    })();

    try {
      const result = await Promise.race([lookup, interrupted]);
      if (result === POLICY_DISCOVERY_INTERRUPTED) return null;
      if (generation === this.#policyDiscoveryGeneration) {
        this.#policy = result;
      }
      return result;
    } catch {
      return null;
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", interrupt);
    }
  }

  loadPolicy(signal?: AbortSignal): Promise<BugReporterPolicy | null> {
    return this.discoverPolicy(signal);
  }

  async submit(
    input: BugReportInput,
    options: SubmissionOptions = {},
  ): Promise<BugReportSubmissionResult> {
    if (this.configuration.status === "disabled") {
      return Object.freeze({ status: "disabled" });
    }
    if (this.configuration.status !== "ready") {
      throw new BugReporterError(
        "invalid_configuration",
        "Bug reporting is not configured.",
      );
    }

    const payload = await this.buildPayload(input);
    const allowedAutomation = this.allowedAutomationRequests(
      options.automationRequests,
    );
    const vanillaBody = JSON.stringify(payload);
    const automationBody = allowedAutomation
      ? JSON.stringify({ ...payload, automation_requests: allowedAutomation })
      : null;
    const request = await this.requestWithRetries(this.endpoints!.reports, {
      method: "POST",
      signal: options.signal,
      vanillaBody,
      automationBody,
    });
    const response = request.response;
    if (!response) {
      throw new BugReporterError(
        "request_failed",
        "The bug report could not be sent. Please try again.",
      );
    }
    if (!response.ok) {
      const upstream = await parseUpstreamError(
        response,
        request.sensitiveValues,
      );
      throw new BugReporterError(
        "submission_rejected",
        "The bug report was not accepted.",
        response.status,
        upstream,
      );
    }
    let responseBody: JsonValue | null = null;
    try {
      const text = await response.text();
      responseBody = text ? jsonObjectOrNull(JSON.parse(text)) : null;
    } catch {
      responseBody = null;
    }
    const responseRecord = plainRecord(responseBody);
    const bugId = nullableString(responseRecord?.bug_id);
    let notificationSubscription: ReporterNotificationSubscription | null = null;
    let notificationWarning: string | null = null;
    if (input.notification?.notifyOnResolution === true) {
      const hasInlineSubscriptionResult = Boolean(
        responseRecord
        && Object.prototype.hasOwnProperty.call(
          responseRecord,
          "notification_subscription",
        ),
      );
      notificationSubscription = notificationSubscriptionFromResponse(
        responseRecord,
      );
      if (hasInlineSubscriptionResult && !notificationSubscription) {
        notificationWarning = "The report was sent, but update notifications could not be enabled.";
      } else if (!hasInlineSubscriptionResult && !bugId) {
        notificationWarning = "The report was sent, but update notifications could not be enabled.";
      } else if (!hasInlineSubscriptionResult && bugId) {
        try {
          notificationSubscription = await this.subscribeToUpdates(
            bugId,
            input.notification,
            { signal: options.signal },
          );
        } catch {
          // Report acceptance is the durable boundary. A subscription failure
          // is surfaced separately and never turns a saved report into a false
          // submission failure.
          notificationWarning = "The report was sent, but update notifications could not be enabled.";
        }
      }
    }
    return Object.freeze({
      status: "submitted",
      statusCode: response.status,
      bugId,
      response: responseBody,
      ...(input.notification?.notifyOnResolution === true
        ? { notificationSubscription, notificationWarning }
        : {}),
    });
  }

  async subscribeToUpdates(
    bugId: string,
    preference: ReporterNotificationPreference,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<ReporterNotificationSubscription> {
    if (this.configuration.status !== "ready" || !this.endpoints) {
      throw new BugReporterError(
        "invalid_configuration",
        "Bug reporting is not configured.",
      );
    }
    const normalizedBugId = cleanString(bugId);
    if (
      !normalizedBugId
      || preference?.notifyOnResolution !== true
    ) {
      throw new BugReporterError(
        "invalid_report",
        "A valid notification preference is required.",
      );
    }
    const url = urlWithQuery(
      `${this.endpoints.bugs}/${encodeURIComponent(normalizedBugId)}/subscription`,
      { project_id: this.projectId, environment: this.environment },
    );
    const body = JSON.stringify({
      reporter_notification: {
        notify_on_resolution: true,
        consent_version: cleanString(preference.consentVersion) || "v1",
      },
    });
    const request = await this.requestWithRetries(url, {
      method: "POST",
      signal: options.signal,
      vanillaBody: body,
      automationBody: body,
    });
    if (!request.response?.ok) {
      throw new BugReporterError(
        "submission_rejected",
        "Update notifications could not be enabled.",
        request.response?.status || null,
      );
    }
    let response: Record<string, unknown> | null = null;
    try {
      response = plainRecord(await request.response.json());
    } catch {
      response = null;
    }
    const subscription = notificationSubscriptionFromResponse(response);
    if (!subscription) {
      throw new BugReporterError(
        "submission_rejected",
        "Update notifications could not be enabled.",
      );
    }
    return subscription;
  }

  /**
   * List canonical bugs submitted by the current verified application user.
   * Pages use opaque keyset cursors so deep histories remain bounded.
   */
  async listBugs(
    options: BugTrackingListOptions = {},
  ): Promise<BugTrackingPage> {
    if (this.configuration.status !== "ready" || !this.endpoints) {
      throw new BugReporterError(
        "invalid_configuration",
        "Bug reporting is not configured.",
      );
    }
    const sessionBefore = options.audience === "all" ? await this.freshSessionToken() : null;
    if (options.audience === "all" && (await this.discoverPolicy(options.signal))?.allUsersHistory !== true) {
      throw new BugReporterError("tracking_rejected", "All users history is unavailable.");
    }
    const search = normalizedTrackingSearch(options.search);
    const statusGroup = options.statusGroup ?? null;
    if (statusGroup && !BUG_TRACKING_STATUS_GROUP_SET.has(statusGroup)) {
      throw invalidTrackingQuery();
    }
    const sort = options.sort ?? null;
    if (sort && !BUG_TRACKING_SORT_SET.has(sort)) {
      throw invalidTrackingQuery();
    }
    const visibility = options.visibility ?? null;
    if (visibility && !BUG_TRACKING_VISIBILITY_SET.has(visibility)) {
      throw invalidTrackingQuery();
    }
    const url = urlWithQuery(this.endpoints.history, {
      project_id: this.projectId,
      environment: this.environment,
      limit: options.limit,
      cursor: options.cursor,
      audience: options.audience,
      search,
      status_group: statusGroup,
      sort,
      visibility,
    });
    const body = await this.trackingRequest(url, options.signal);
    const page = trackingPage(body);
    if (!page) {
      throw new BugReporterError(
        "tracking_rejected",
        "Bug history returned an invalid response.",
      );
    }
    if (options.signal?.aborted || (options.audience === "all" && this.transport === "direct" && sessionBefore !== await this.freshSessionToken())) {
      this.#policy = null;
      throw new BugReporterError("tracking_rejected", "History session changed.");
    }
    return page;
  }

  /** Read an owned bug, or explicitly request freshly authorized shared history. */
  async getBug(
    bugId: string,
    options: { readonly audience?: "mine" | "all"; readonly signal?: AbortSignal } = {},
  ): Promise<TrackedBugRecord> {
    if (this.configuration.status !== "ready" || !this.endpoints) {
      throw new BugReporterError(
        "invalid_configuration",
        "Bug reporting is not configured.",
      );
    }
    const sessionBefore = options.audience === "all" ? await this.freshSessionToken() : null;
    if (options.audience === "all" && (await this.discoverPolicy(options.signal))?.allUsersHistory !== true) {
      throw new BugReporterError("tracking_rejected", "All users history is unavailable.");
    }
    const normalizedBugId = cleanString(bugId);
    if (!normalizedBugId) {
      throw new BugReporterError(
        "tracking_rejected",
        "A bug id is required.",
      );
    }
    const url = urlWithQuery(
      `${this.endpoints.bugs}/${encodeURIComponent(normalizedBugId)}`,
      {
        project_id: this.projectId,
        environment: this.environment,
        audience: options.audience,
      },
    );
    const body = plainRecord(await this.trackingRequest(url, options.signal));
    const bug = body?.contract_version === "v1"
      ? trackedBugRecord(body.bug)
      : null;
    if (!bug) {
      throw new BugReporterError(
        "tracking_rejected",
        "Bug history returned an invalid response.",
      );
    }
    if (options.signal?.aborted || (options.audience === "all" && this.transport === "direct" && sessionBefore !== await this.freshSessionToken())) {
      this.#policy = null;
      throw new BugReporterError("tracking_rejected", "History session changed.");
    }
    return bug;
  }

  /** Archive one owned bug without changing or deleting its Handrail PM record. */
  async archiveBug(
    bugId: string,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BugArchiveResult> {
    return this.changeBugArchiveState(bugId, true, options.signal);
  }

  /** Restore one reporter-owned archived bug to active history. */
  async restoreBug(
    bugId: string,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BugArchiveResult> {
    return this.changeBugArchiveState(bugId, false, options.signal);
  }

  /** Archive every currently closed bug owned by the verified reporter. */
  async archiveClosedBugs(
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<BugArchiveClosedResult> {
    if (this.configuration.status !== "ready" || !this.endpoints) {
      throw new BugReporterError(
        "invalid_configuration",
        "Bug reporting is not configured.",
      );
    }
    const url = urlWithQuery(`${this.endpoints.history}/archive-closed`, {
      project_id: this.projectId,
      environment: this.environment,
    });
    const result = bugArchiveClosedResult(
      await this.trackingRequest(url, options.signal, "POST"),
    );
    if (!result) {
      throw new BugReporterError(
        "tracking_rejected",
        "Bug history returned an invalid response.",
      );
    }
    return result;
  }

  private async changeBugArchiveState(
    bugId: string,
    archived: boolean,
    signal?: AbortSignal,
  ): Promise<BugArchiveResult> {
    if (this.configuration.status !== "ready" || !this.endpoints) {
      throw new BugReporterError(
        "invalid_configuration",
        "Bug reporting is not configured.",
      );
    }
    const normalizedBugId = cleanString(bugId);
    if (!normalizedBugId) throw invalidTrackingQuery();
    const url = urlWithQuery(
      `${this.endpoints.bugs}/${encodeURIComponent(normalizedBugId)}/archive`,
      {
        project_id: this.projectId,
        environment: this.environment,
      },
    );
    const result = bugArchiveResult(
      await this.trackingRequest(
        url,
        signal,
        archived ? "PUT" : "DELETE",
      ),
    );
    if (!result || result.bugId !== normalizedBugId || result.archived !== archived) {
      throw new BugReporterError(
        "tracking_rejected",
        "Bug history returned an invalid response.",
      );
    }
    return result;
  }

  private async trackingRequest(
    url: string,
    signal?: AbortSignal,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  ): Promise<unknown> {
    if (this.configuration.status !== "ready" || !url) {
      throw new BugReporterError(
        "invalid_configuration",
        "Bug reporting is not configured.",
      );
    }
    const request = await this.requestWithRetries(url, {
      method,
      signal,
    });
    if (!request.response) {
      throw new BugReporterError(
        "tracking_unavailable",
        "Bug history could not be loaded. Please try again.",
      );
    }
    if (!request.response.ok) {
      const upstream = await parseUpstreamError(
        request.response,
        request.sensitiveValues,
      );
      throw new BugReporterError(
        "tracking_rejected",
        "Bug history could not be loaded.",
        request.response.status,
        upstream,
      );
    }
    try {
      return await request.response.json();
    } catch {
      throw new BugReporterError(
        "tracking_rejected",
        "Bug history returned an invalid response.",
      );
    }
  }

  private async buildPayload(
    input: BugReportInput,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BugReporterError(
        "invalid_report",
        "A report title and description are required.",
      );
    }
    let callerFields: Readonly<Record<string, JsonValue>> =
      redactSensitiveValues({
        title: input.title,
        description: input.description,
        severity:
          normalizeBugImpact(input.impact)
          || normalizeBugImpact(input.severity)
          || undefined,
        route: input.route,
        app_version: input.appVersion,
        build_number: input.buildNumber,
        commit_sha: input.commitSha,
        app_flavor: input.appFlavor,
        reproducer: input.reproducer || input.stepsToReproduce,
        metadata: input.metadata,
      });
    try {
      for (const hook of this.redactionHooks) {
        callerFields = redactSensitiveValues(await hook(callerFields));
      }
    } catch {
      throw new BugReporterError(
        "redaction_failed",
        "The bug report could not be safely prepared.",
      );
    }
    const title = cleanString(callerFields.title);
    const description = cleanString(callerFields.description);
    if (!title || !description) {
      throw new BugReporterError(
        "invalid_report",
        "A report title and description are required.",
      );
    }
    const allowedCallerFields: Record<string, JsonValue> = {};
    for (const key of CALLER_REPORT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(callerFields, key)) {
        allowedCallerFields[key] = callerFields[key];
      }
    }
    const callerEventId = cleanString(input.eventId);
    const payload: Record<string, unknown> = {
      ...allowedCallerFields,
      title,
      description,
      project_id: this.projectId,
      environment: this.environment,
      event_id: callerEventId ? callerEventId.slice(0, 160) : randomEventId(),
    };
    const profileKey = cleanString(input.profileKey);
    if (profileKey) payload.profile_key = profileKey;
    if (input.notification?.notifyOnResolution === true) {
      payload.reporter_notification = {
        notify_on_resolution: true,
        consent_version:
          cleanString(input.notification.consentVersion) || "v1",
      };
    }
    if (input.screenshot) {
      if (!this.allowScreenshots) throw screenshotError();
      const screenshot = await normalizeScreenshot(input.screenshot);
      payload.screenshot_base64 = screenshot.base64;
      payload.screenshot_filename = screenshot.filename;
      payload.screenshot_mime_type = screenshot.mimeType;
    }
    return this.identityAdapter.stamp(payload);
  }

  private allowedAutomationRequests(
    requested: readonly AutomationOptionKey[] | undefined,
  ): Readonly<Record<string, true>> | null {
    void requested;
    return null;
  }

  private parsePolicy(input: unknown): BugReporterPolicy | null {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const body = input as Record<string, unknown>;
    const reporter = body.reporter;
    if (
      body.schema_version !== 1 ||
      body.project_id !== this.projectId ||
      cleanString(body.environment)?.toLowerCase() !== this.environment ||
      !reporter ||
      typeof reporter !== "object" ||
      Array.isArray(reporter)
    ) {
      return null;
    }
    const reporterRecord = reporter as Record<string, unknown>;
    const accessLevel = cleanString(reporterRecord.access_level) as
      | ReporterAccessLevel
      | null;
    const roleValue = cleanString(reporterRecord.role);
    const role = roleValue === "requester" || roleValue === "contributor" || roleValue === "maintainer"
      ? roleValue
      : null;
    if (
      reporterRecord.identity_verified !== true ||
      !accessLevel ||
      !ACCESS_LEVELS.has(accessLevel) ||
      !Array.isArray(body.ask_options)
    ) {
      return null;
    }
    const optionKeys = new Set<AutomationOptionKey>();
    for (const item of body.ask_options) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const key = (item as Record<string, unknown>).key;
      if (typeof key === "string" && AUTOMATION_OPTION_BY_KEY.has(key as AutomationOptionKey)) {
        optionKeys.add(key as AutomationOptionKey);
      }
    }
    const askOptions = Object.freeze(
      AUTOMATION_OPTIONS.filter((option) => optionKeys.has(option.key)),
    );
    const automationPolicyRecord = plainRecord(body.automation_policy);
    const automaticFixMaxRisk = cleanString(
      automationPolicyRecord?.automatic_fix_max_risk,
    ) as BugAutomationMaxRisk | null;
    const productionRiskRecord = plainRecord(
      automationPolicyRecord?.production_max_risk_by_impact,
    );
    const maxRisks = new Set<BugAutomationMaxRisk>([
      "none",
      "low",
      "moderate",
      "high",
    ]);
    const impactRisks = Object.fromEntries(
      (["critical", "high", "moderate", "low"] as const).map((impact) => [
        impact,
        cleanString(productionRiskRecord?.[impact]),
      ]),
    ) as Record<BugImpact, string | null>;
    const automationPolicy = automationPolicyRecord?.schema_version === 3
      && automaticFixMaxRisk
      && maxRisks.has(automaticFixMaxRisk)
      && Object.values(impactRisks).every((risk) => (
        risk != null && maxRisks.has(risk as BugAutomationMaxRisk)
      ))
      ? Object.freeze({
          schemaVersion: 3 as const,
          automaticFixMaxRisk,
          productionMaxRiskByImpact: Object.freeze(
            impactRisks as Record<BugImpact, BugAutomationMaxRisk>,
          ),
        })
      : undefined;
    const notificationRecord = plainRecord(body.reporter_notifications);
    const notificationAvailable = notificationRecord?.available === true;
    const recipientHint = notificationAvailable
      ? nullableString(notificationRecord?.recipient_hint)
      : null;
    const lifecycles = Array.isArray(notificationRecord?.lifecycles)
      ? notificationRecord.lifecycles.filter((value): value is "fixed" | "deployed" => (
          value === "fixed" || value === "deployed"
        ))
      : [];
    return Object.freeze({
      schemaVersion: 1,
      projectId: this.projectId!,
      environment: this.environment!,
      identityVerified: true,
      allUsersHistory: plainRecord(body.history)?.all_users === true,
      accessLevel,
      role,
      askOptions,
      automationPolicy,
      reporterNotifications: Object.freeze({
        available: notificationAvailable,
        recipientHint,
        lifecycles: Object.freeze([...lifecycles]),
      }),
    });
  }

  private async freshSessionToken(): Promise<string | null> {
    if (typeof this.sessionProvider !== "function") return null;
    try {
      return cleanString(await this.sessionProvider());
    } catch {
      return null;
    }
  }

  private async requestWithRetries(
    url: string,
    input: {
      readonly method: "GET" | "POST" | "PUT" | "DELETE";
      readonly signal?: AbortSignal;
      readonly vanillaBody?: string;
      readonly automationBody?: string | null;
    },
  ): Promise<ReporterRequestResult> {
    let lastResponse: Response | null = null;
    let lastSensitiveValues: readonly string[] = [];
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      if (input.signal?.aborted) {
        return Object.freeze({ response: null, sensitiveValues: [] });
      }
      if (attempt > 0) {
        await sleep(this.retryDelayMs * 2 ** (attempt - 1));
        if (input.signal?.aborted) {
          return Object.freeze({ response: null, sensitiveValues: [] });
        }
      }
      const applicationSessionToken = await this.freshSessionToken();
      if (input.signal?.aborted) {
        return Object.freeze({ response: null, sensitiveValues: [] });
      }
      lastSensitiveValues = [
        ...(this.transport === "direct" && this.reportToken
          ? [this.reportToken]
          : []),
        ...(applicationSessionToken ? [applicationSessionToken] : []),
      ];
      const headers: Record<string, string> = {
        accept: "application/json",
      };
      if (input.method === "POST") headers["content-type"] = "application/json";
      if (this.transport === "direct") {
        if (this.reportTokenHeader === BUG_REPORT_TOKEN_HEADER) {
          headers[BUG_REPORT_TOKEN_HEADER] = this.reportToken!;
        } else {
          headers.authorization = `Bearer ${this.reportToken}`;
        }
      }
      if (this.transport === "direct" && applicationSessionToken) {
        headers[APPLICATION_SESSION_TOKEN_HEADER] = applicationSessionToken;
      }
      try {
        lastResponse = await this.fetchImpl!(url, {
          method: input.method,
          headers,
          body:
            input.method === "POST"
              ? (applicationSessionToken || this.transport === "same-origin") &&
                input.automationBody
                ? input.automationBody
                : input.vanillaBody
              : undefined,
          credentials:
            this.transport === "same-origin" ? "same-origin" : undefined,
          signal: input.signal,
        });
      } catch {
        lastResponse = null;
      }
      if (input.signal?.aborted) {
        this.#policy = null;
        return Object.freeze({ response: null, sensitiveValues: [] });
      }
      if (
        lastResponse &&
        (!TRANSIENT_STATUS_CODES.has(lastResponse.status) ||
          attempt === this.maxAttempts - 1)
      ) {
        return Object.freeze({
          response: lastResponse,
          sensitiveValues: lastSensitiveValues,
        });
      }
      if (!lastResponse && attempt === this.maxAttempts - 1) {
        return Object.freeze({ response: null, sensitiveValues: [] });
      }
    }
    return Object.freeze({
      response: lastResponse,
      sensitiveValues: lastSensitiveValues,
    });
  }
}

export function createHandrailBugReporter(
  config: BugReporterConfig,
  identityAdapter: ReporterIdentityAdapter,
): HandrailBugReporterClient {
  return new HandrailBugReporterClient(config, identityAdapter);
}
