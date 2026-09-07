import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import {
  useHandrailBugReporter,
  type BugReporterTrackingQueryOptions,
} from "./react";
import {
  MAX_SCREENSHOT_BYTES,
  type BugResolutionJourney,
  type BugResolutionMilestone,
  type BugTrackingStatusGroup,
  type BugTrackingVisibility,
  type ScreenshotAttachment,
  type TrackedBugRecord,
} from "./reporter";
import {
  BUG_SEVERITY_OPTIONS,
  bugImpactLabel,
  type BugImpact,
} from "./severity";

export type HandrailBugReporterThemeMode = "auto" | "light" | "dark";

export interface HandrailBugReporterThemeTokens {
  readonly accent: string;
  readonly accentText: string;
  readonly surface: string;
  readonly surfaceMuted: string;
  readonly text: string;
  readonly mutedText: string;
  readonly border: string;
  readonly overlay: string;
  readonly dangerSurface: string;
  readonly dangerText: string;
  readonly successSurface: string;
  readonly successText: string;
  readonly warningSurface: string;
  readonly warningText: string;
  readonly infoSurface: string;
  readonly infoText: string;
  readonly radius: string;
  readonly fontFamily: string;
}

export type HandrailBugReporterCssVariable =
  | "--handrail-bug-accent"
  | "--handrail-bug-accent-text"
  | "--handrail-bug-surface"
  | "--handrail-bug-surface-muted"
  | "--handrail-bug-text"
  | "--handrail-bug-muted-text"
  | "--handrail-bug-border"
  | "--handrail-bug-overlay"
  | "--handrail-bug-danger-surface"
  | "--handrail-bug-danger-text"
  | "--handrail-bug-success-surface"
  | "--handrail-bug-success-text"
  | "--handrail-bug-warning-surface"
  | "--handrail-bug-warning-text"
  | "--handrail-bug-info-surface"
  | "--handrail-bug-info-text"
  | "--handrail-bug-radius"
  | "--handrail-bug-font-family";

export type HandrailBugReporterStyle = CSSProperties
  & Partial<Record<HandrailBugReporterCssVariable, string | number>>;

export interface HandrailBugReporterAppearance {
  /**
   * Defaults to auto, following the host CSS color scheme with polished SDK defaults.
   * Apps with their own saved theme should pass the current light/dark value and
   * re-render when it changes.
   */
  readonly themeMode?: HandrailBugReporterThemeMode;
  /** Overrides individual packaged-UI design tokens without changing behavior. */
  readonly tokens?: Partial<HandrailBugReporterThemeTokens>;
  readonly className?: string;
  /** Overlay styles may also override any scoped --handrail-bug-* variable. */
  readonly style?: HandrailBugReporterStyle;
}

export interface HandrailBugReporterDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly heading?: string;
  readonly appearance?: HandrailBugReporterAppearance;
  /** Set false to offer only submission. Defaults true. */
  readonly showHistory?: boolean;
}

export interface HandrailBugReporterButtonProps
  extends Omit<HandrailBugReporterDialogProps, "open" | "onClose"> {
  readonly label?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

type UiVariables = HandrailBugReporterStyle;
type DialogTab = "report" | "history";

const NOTIFICATION_OPT_IN_SELECTOR = '[data-handrail-bug-reporter-dialog="true"] [data-handrail-bug-notification-opt-in="true"]';

const RESPONSIVE_DIALOG_CSS = `
/* Host form resets must not turn this native checkbox into a full-width field.
   Keep the reset local, restore SDK typography, and retain native input behavior.
   Important declarations also cover broad host rules using !important. */
${NOTIFICATION_OPT_IN_SELECTOR},
${NOTIFICATION_OPT_IN_SELECTOR} :is(input, span, strong) {
  all: revert !important;
  box-sizing: border-box !important;
  font-family: var(--handrail-bug-font-family) !important;
  font-size: 13px !important;
  font-weight: 400 !important;
  line-height: 1.4 !important;
  color: var(--handrail-bug-text) !important;
  text-align: start !important;
  text-transform: none !important;
  letter-spacing: normal !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  cursor: pointer !important;
}
${NOTIFICATION_OPT_IN_SELECTOR} {
  display: flex !important;
  flex-flow: row nowrap !important;
  align-items: flex-start !important;
  gap: 9px !important;
  width: 100% !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}
${NOTIFICATION_OPT_IN_SELECTOR} > input {
  appearance: auto !important;
  -webkit-appearance: auto !important;
  flex: 0 0 14px !important;
  width: 14px !important;
  min-width: 14px !important;
  max-width: 14px !important;
  height: 14px !important;
  min-height: 14px !important;
  max-height: 14px !important;
  margin: 2px 0 0 !important;
  padding: 0 !important;
  accent-color: var(--handrail-bug-accent) !important;
}
${NOTIFICATION_OPT_IN_SELECTOR} > span {
  display: block !important;
  flex: 1 1 0% !important;
  min-width: 0 !important;
}
${NOTIFICATION_OPT_IN_SELECTOR} strong {
  display: block !important;
  font-weight: 700 !important;
}
${NOTIFICATION_OPT_IN_SELECTOR} > span > span {
  display: block !important;
  margin-top: 2px !important;
  color: var(--handrail-bug-muted-text) !important;
  font-size: 11px !important;
}
${NOTIFICATION_OPT_IN_SELECTOR}::before,
${NOTIFICATION_OPT_IN_SELECTOR}::after,
${NOTIFICATION_OPT_IN_SELECTOR} :is(input, span, strong)::before,
${NOTIFICATION_OPT_IN_SELECTOR} :is(input, span, strong)::after {
  content: none !important;
}
[data-handrail-bug-reporter-dialog="true"] button {
  appearance: none;
  -webkit-appearance: none;
}
[data-handrail-bug-reporter-dialog="true"] :is(button, input, select, textarea):focus-visible {
  outline: 2px solid var(--handrail-bug-accent) !important;
  outline-offset: 2px;
}
@media (max-width: 1100px) {
  [data-handrail-bug-history-header="true"] {
    display: none !important;
  }
  [data-handrail-bug-history-row="true"] {
    grid-template-columns: minmax(0, 1fr) auto !important;
    gap: 8px 14px !important;
    padding: 14px !important;
  }
  [data-handrail-bug-history-cell="issue"] {
    grid-column: 1;
    grid-row: 1;
  }
  [data-handrail-bug-history-cell="secondary"] {
    display: none !important;
  }
  [data-handrail-bug-history-cell="status"] {
    grid-column: 1;
    grid-row: 2;
  }
  [data-handrail-bug-history-cell="journey"] {
    grid-column: 1 / -1;
    grid-row: 3;
  }
  [data-handrail-bug-history-cell="action"] {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
  [data-handrail-bug-history-detail="true"] {
    grid-column: 1 / -1;
  }
}
@media (max-width: 860px) {
  [data-handrail-bug-report-panel="true"],
  [data-handrail-bug-report-form="true"] {
    display: block !important;
    flex: none !important;
    min-height: auto !important;
  }
  [data-handrail-bug-report-layout="true"] {
    flex: none !important;
    min-height: auto !important;
    grid-template-columns: minmax(0, 1fr) !important;
  }
  [data-handrail-bug-report-details="true"] {
    display: block !important;
    min-height: auto !important;
  }
  [data-handrail-bug-expanding-field="true"] textarea {
    height: auto !important;
  }
  [data-handrail-bug-context="true"] {
    order: -1;
  }
  [data-handrail-bug-resolution-receipt="true"] {
    grid-template-columns: minmax(0, 1fr) !important;
  }
}
@media (max-width: 560px) {
  [data-handrail-bug-reporter="overlay"] {
    padding: 0 !important;
  }
  [data-handrail-bug-reporter-dialog="true"] {
    width: 100vw !important;
    height: 100dvh !important;
    max-height: none !important;
    border: 0 !important;
    border-radius: 0 !important;
  }
  [data-handrail-bug-reporter-header="true"] {
    padding: 16px 18px 14px !important;
  }
  [data-handrail-bug-reporter-content="report"] {
    padding: 12px 14px !important;
  }
  [data-handrail-bug-reporter-content="history"] {
    padding: 12px 14px 0 !important;
  }
  [data-handrail-bug-history-toolbar="true"] {
    align-items: stretch !important;
  }
}
`;

const LIGHT_TOKENS: HandrailBugReporterThemeTokens = Object.freeze({
  accent: "#2563eb",
  accentText: "#ffffff",
  surface: "#ffffff",
  surfaceMuted: "#f7f9fc",
  text: "#172033",
  mutedText: "#667085",
  border: "#dbe2ec",
  overlay: "rgba(15, 23, 42, 0.62)",
  dangerSurface: "#fff1f0",
  dangerText: "#b42318",
  successSurface: "#ecfdf3",
  successText: "#027a48",
  warningSurface: "#fff8eb",
  warningText: "#b54708",
  infoSurface: "#eff6ff",
  infoText: "#175cd3",
  radius: "12px",
  fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
});

const DARK_TOKENS: HandrailBugReporterThemeTokens = Object.freeze({
  accent: "#78a9ff",
  accentText: "#071426",
  surface: "#151a23",
  surfaceMuted: "#1e2633",
  text: "#f5f7fa",
  mutedText: "#aeb8c8",
  border: "#394455",
  overlay: "rgba(2, 6, 23, 0.76)",
  dangerSurface: "#3a1d23",
  dangerText: "#ffb4b8",
  successSurface: "#173326",
  successText: "#95ddb7",
  warningSurface: "#3b2d16",
  warningText: "#fbc46d",
  infoSurface: "#172d4d",
  infoText: "#a7c7ff",
  radius: "12px",
  fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
});

const AUTO_TOKENS: HandrailBugReporterThemeTokens = Object.freeze({
  accent: "light-dark(#2563eb, #78a9ff)",
  accentText: "light-dark(#ffffff, #071426)",
  surface: "light-dark(#ffffff, #151a23)",
  surfaceMuted: "light-dark(#f7f9fc, #1e2633)",
  text: "light-dark(#172033, #f5f7fa)",
  mutedText: "light-dark(#667085, #aeb8c8)",
  border: "light-dark(#dbe2ec, #394455)",
  overlay: "rgba(2, 6, 23, 0.66)",
  dangerSurface: "light-dark(#fff1f0, #3a1d23)",
  dangerText: "light-dark(#b42318, #ffb4b8)",
  successSurface: "light-dark(#ecfdf3, #173326)",
  successText: "light-dark(#027a48, #95ddb7)",
  warningSurface: "light-dark(#fff8eb, #3b2d16)",
  warningText: "light-dark(#b54708, #fbc46d)",
  infoSurface: "light-dark(#eff6ff, #172d4d)",
  infoText: "light-dark(#175cd3, #a7c7ff)",
  radius: "12px",
  fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
});

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function appearanceVariables(
  appearance: HandrailBugReporterAppearance | undefined,
  includeIntegrationStyle = true,
): UiVariables {
  const mode = appearance?.themeMode || "auto";
  const base = mode === "dark"
    ? DARK_TOKENS
    : mode === "light"
      ? LIGHT_TOKENS
      : AUTO_TOKENS;
  const tokens = { ...base, ...appearance?.tokens };
  return {
    "--handrail-bug-accent": tokens.accent,
    "--handrail-bug-accent-text": tokens.accentText,
    "--handrail-bug-surface": tokens.surface,
    "--handrail-bug-surface-muted": tokens.surfaceMuted,
    "--handrail-bug-text": tokens.text,
    "--handrail-bug-muted-text": tokens.mutedText,
    "--handrail-bug-border": tokens.border,
    "--handrail-bug-overlay": tokens.overlay,
    "--handrail-bug-danger-surface": tokens.dangerSurface,
    "--handrail-bug-danger-text": tokens.dangerText,
    "--handrail-bug-success-surface": tokens.successSurface,
    "--handrail-bug-success-text": tokens.successText,
    "--handrail-bug-warning-surface": tokens.warningSurface,
    "--handrail-bug-warning-text": tokens.warningText,
    "--handrail-bug-info-surface": tokens.infoSurface,
    "--handrail-bug-info-text": tokens.infoText,
    "--handrail-bug-radius": tokens.radius,
    "--handrail-bug-font-family": tokens.fontFamily,
    colorScheme: mode === "auto" ? "inherit" : mode,
    ...(includeIntegrationStyle ? appearance?.style : undefined),
  };
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 2147483000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    background: "var(--handrail-bug-overlay)",
    backdropFilter: "blur(3px)",
  },
  dialog: {
    display: "flex",
    flexDirection: "column",
    width: "min(1560px, calc(100vw - 24px))",
    height: "min(720px, calc(100dvh - 16px))",
    maxHeight: "calc(100vh - 16px)",
    boxSizing: "border-box",
    overflow: "hidden",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: "var(--handrail-bug-radius)",
    background: "var(--handrail-bug-surface)",
    color: "var(--handrail-bug-text)",
    boxShadow: "0 30px 90px rgba(0, 0, 0, 0.34)",
    fontFamily: "var(--handrail-bug-font-family)",
    fontSize: 13,
    lineHeight: 1.4,
    isolation: "isolate",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    padding: "14px 24px 12px",
    borderBottom: "1px solid var(--handrail-bug-border)",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: "12px 20px",
    background: "var(--handrail-bug-surface)",
  },
  historyContent: {
    gap: 8,
    overflow: "hidden",
    padding: "10px 20px 12px",
  },
  tab: {
    flex: 1,
    appearance: "none",
    WebkitAppearance: "none",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 8,
    padding: "7px 12px",
    cursor: "pointer",
    color: "var(--handrail-bug-muted-text)",
    background: "var(--handrail-bug-surface)",
    font: "inherit",
    fontWeight: 700,
    minHeight: 36,
    outlineOffset: 2,
  },
  selectedControl: {
    borderColor: "color-mix(in srgb, var(--handrail-bug-accent) 32%, var(--handrail-bug-border))",
    color: "var(--handrail-bug-accent)",
    background: "color-mix(in srgb, var(--handrail-bug-accent) 8%, var(--handrail-bug-surface))",
  },
  label: {
    display: "grid",
    gap: 5,
    marginBottom: 9,
    color: "inherit",
    fontSize: 13,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 8,
    padding: "7px 10px",
    color: "inherit",
    background: "var(--handrail-bug-surface)",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: 400,
    lineHeight: "inherit",
    minHeight: 36,
    outlineOffset: 2,
  },
  fieldset: {
    margin: "9px 0 0",
    padding: 10,
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 9,
  },
  screenshotDropzone: {
    display: "grid",
    placeItems: "center",
    minHeight: 104,
    padding: 10,
    border: "1px dashed var(--handrail-bug-border)",
    borderRadius: 10,
    background: "var(--handrail-bug-surface-muted)",
    textAlign: "center",
  },
  screenshotPreview: {
    display: "flex",
    flex: 1,
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    padding: 8,
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 10,
    background: "var(--handrail-bug-surface)",
  },
  screenshotThumbnail: {
    width: 144,
    height: 90,
    flex: "0 0 144px",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 8,
    objectFit: "cover",
    background: "var(--handrail-bug-surface-muted)",
  },
  screenshotPreviewButton: {
    position: "relative",
    flex: "0 0 144px",
    margin: 0,
    padding: 0,
    border: 0,
    borderRadius: 8,
    overflow: "hidden",
    background: "transparent",
    cursor: "zoom-in",
    font: "inherit",
  },
  screenshotLightbox: {
    position: "fixed",
    inset: 0,
    zIndex: 20,
    display: "grid",
    placeItems: "center",
    boxSizing: "border-box",
    padding: 56,
    background: "var(--handrail-bug-overlay)",
    backdropFilter: "blur(3px)",
  },
  screenshotLightboxImage: {
    display: "block",
    maxWidth: "min(1200px, calc(100vw - 48px))",
    maxHeight: "calc(100dvh - 96px)",
    border: "1px solid var(--handrail-bug-border)",
    borderRadius: 10,
    objectFit: "contain",
    background: "var(--handrail-bug-surface)",
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.4)",
  },
  formActions: {
    position: "sticky",
    bottom: -20,
    zIndex: 2,
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    margin: "12px -20px -12px",
    padding: "9px 20px",
    borderTop: "1px solid var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface)",
  },
  button: {
    appearance: "none",
    WebkitAppearance: "none",
    border: "1px solid transparent",
    borderRadius: 8,
    padding: "6px 12px",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 700,
    minHeight: 34,
    outlineOffset: 2,
  },
  primaryButton: {
    background: "var(--handrail-bug-accent)",
    color: "var(--handrail-bug-accent-text)",
  },
  secondaryButton: {
    borderColor: "var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface)",
    color: "var(--handrail-bug-text)",
  },
  historyActionButton: {
    appearance: "none",
    WebkitAppearance: "none",
    minHeight: 28,
    padding: "4px 3px",
    border: 0,
    borderRadius: 6,
    color: "var(--handrail-bug-accent)",
    background: "transparent",
    cursor: "pointer",
    font: "inherit",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.2,
    outlineOffset: 2,
  },
  status: { marginBottom: 10, borderRadius: 8, padding: "9px 12px", fontSize: 12 },
  historyControls: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    marginBottom: 0,
  },
  historyItem: {
    display: "grid",
    gridTemplateColumns: "minmax(200px, 1.4fr) minmax(540px, 3.7fr) minmax(90px, .65fr) minmax(130px, .9fr) 124px",
    alignItems: "center",
    gap: 14,
    padding: "12px 14px",
    borderBottom: "1px solid var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface)",
  },
  historyList: {
    minHeight: 0,
    overflow: "hidden auto",
    borderTop: "1px solid var(--handrail-bug-border)",
    borderBottom: "1px solid var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface)",
  },
  historyListHeader: {
    position: "sticky",
    top: 0,
    zIndex: 2,
    display: "grid",
    gridTemplateColumns: "minmax(200px, 1.4fr) minmax(540px, 3.7fr) minmax(90px, .65fr) minmax(130px, .9fr) 124px",
    gap: 14,
    padding: "9px 14px",
    borderBottom: "1px solid var(--handrail-bug-border)",
    color: "var(--handrail-bug-muted-text)",
    background: "var(--handrail-bug-surface-muted)",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  historyPills: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
    margin: 0,
  },
};

function buttonStyle(kind: "primary" | "secondary"): CSSProperties {
  return {
    ...styles.button,
    ...(kind === "primary" ? styles.primaryButton : styles.secondaryButton),
  };
}

function submissionMessage(
  status: ReturnType<typeof useHandrailBugReporter>["submission"],
): { role: "alert" | "status"; text: string; style: CSSProperties } | null {
  if (status.status === "submitting") {
    return { role: "status", text: "Sending bug report…", style: {} };
  }
  if (status.status === "submitted") {
    const warning = status.result?.status === "submitted"
      ? status.result.notificationWarning
      : null;
    return {
      role: warning ? "alert" : "status",
      text: warning || "Bug report submitted successfully.",
      style: warning
        ? { background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }
        : { background: "var(--handrail-bug-success-surface)", color: "var(--handrail-bug-success-text)" },
    };
  }
  if (status.status === "disabled") {
    return {
      role: "alert",
      text: "Bug reporting is disabled.",
      style: { background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" },
    };
  }
  if (status.status === "error") {
    return {
      role: "alert",
      text: status.error?.message || "The bug report could not be sent. Please try again.",
      style: { background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" },
    };
  }
  return null;
}

function screenshotPreviewUrl(
  screenshot: ScreenshotAttachment,
): { readonly url: string | null; readonly revoke: boolean } {
  if (typeof screenshot.data === "string") {
    if (/^data:image\/(?:png|jpeg);base64,/iu.test(screenshot.data)) {
      return { url: screenshot.data, revoke: false };
    }
    if (screenshot.mimeType && screenshot.data.trim()) {
      return {
        url: `data:${screenshot.mimeType};base64,${screenshot.data.replace(/\s+/gu, "")}`,
        revoke: false,
      };
    }
  }
  if (
    typeof Blob !== "undefined"
    && screenshot.data instanceof Blob
    && typeof URL !== "undefined"
    && typeof URL.createObjectURL === "function"
  ) {
    return { url: URL.createObjectURL(screenshot.data), revoke: true };
  }
  return { url: null, revoke: false };
}

function screenshotDetails(screenshot: ScreenshotAttachment): string {
  const type = screenshot.mimeType === "image/jpeg" ? "JPEG" : "PNG";
  const size = typeof Blob !== "undefined" && screenshot.data instanceof Blob
    ? screenshot.data.size
    : null;
  if (size === null) return `${type} · up to 20 MiB`;
  const formatted = size < 1024
    ? `${size} B`
    : size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KiB`
      : `${(size / (1024 * 1024)).toFixed(1)} MiB`;
  return `${type} · ${formatted}`;
}

function bugDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function bugRelativeAge(value: string | null): string {
  if (!value) return "Unknown age";
  const timestamp = new Date(value).valueOf();
  if (Number.isNaN(timestamp)) return "Unknown age";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Updated just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `Updated ${months} month${months === 1 ? "" : "s"} ago`;
}

function bugSeverityLabel(value: string): string {
  return bugImpactLabel(value) || value.toUpperCase();
}

function bugStatusGroup(bug: TrackedBugRecord): BugTrackingStatusGroup {
  if (bug.status_group) return bug.status_group;
  if (bug.status_rollup.stage === "not_reproduced") return "not_reproduced";
  if (bug.status_rollup.terminal) return "closed";
  return "in_progress";
}

function statusBadgeStyle(
  group: BugTrackingStatusGroup,
  label: string,
  resolved: boolean,
): CSSProperties {
  if (resolved) {
    return {
      color: "var(--handrail-bug-success-text)",
      borderColor: "color-mix(in srgb, var(--handrail-bug-success-text) 28%, transparent)",
      background: "var(--handrail-bug-success-surface)",
    };
  }
  if (group === "needs_attention") {
    return {
      color: "var(--handrail-bug-warning-text)",
      borderColor: "color-mix(in srgb, var(--handrail-bug-warning-text) 28%, transparent)",
      background: "var(--handrail-bug-warning-surface)",
    };
  }
  if (group === "in_progress") {
    if (/fix|deploy|verif/iu.test(label)) {
      return {
        color: "var(--handrail-bug-warning-text)",
        borderColor: "color-mix(in srgb, var(--handrail-bug-warning-text) 28%, transparent)",
        background: "var(--handrail-bug-warning-surface)",
      };
    }
    return {
      color: "var(--handrail-bug-info-text)",
      borderColor: "color-mix(in srgb, var(--handrail-bug-info-text) 28%, transparent)",
      background: "var(--handrail-bug-info-surface)",
    };
  }
  return {
    color: "var(--handrail-bug-muted-text)",
    borderColor: "var(--handrail-bug-border)",
    background: "var(--handrail-bug-surface-muted)",
  };
}

function severityColor(severity: string): string {
  if (/critical|high|urgent/iu.test(severity)) return "var(--handrail-bug-danger-text)";
  if (/low|minor/iu.test(severity)) return "var(--handrail-bug-info-text)";
  return "var(--handrail-bug-warning-text)";
}

const HISTORY_FILTERS: readonly {
  readonly value: BugTrackingStatusGroup | "";
  readonly label: string;
}[] = Object.freeze([
  { value: "", label: "All" },
  { value: "needs_attention", label: "Needs team review" },
  { value: "in_progress", label: "Working" },
  { value: "closed", label: "Finished" },
  { value: "not_reproduced", label: "Could not confirm" },
]);

const HISTORY_REFRESH_INTERVAL_MS = 15_000;

const FALLBACK_JOURNEY_STAGES = Object.freeze([
  { key: "reported", label: "Reported" },
  { key: "confirmed", label: "Confirmed" },
  { key: "corrected", label: "Corrected" },
  { key: "checked", label: "Safety checked" },
  { key: "released", label: "Released" },
  { key: "confirmed_resolved", label: "Confirmed resolved" },
] as const);

function fallbackJourney(bug: TrackedBugRecord): BugResolutionJourney {
  const stageIndex: Record<TrackedBugRecord["status_rollup"]["stage"], number> = {
    submitted: 0,
    verifying: 1,
    verified: 1,
    fixing: 2,
    fixed: 3,
    deployed: bug.status_rollup.reverification_status === "passed" ? 5 : 4,
    closed: 5,
    not_reproduced: 1,
    wont_fix: 1,
    needs_attention: 1,
  };
  const resolved = (
    bug.status_rollup.stage === "deployed"
    && bug.status_rollup.reverification_status !== "in_progress"
    && bug.status_rollup.reverification_status !== "failed"
  ) || (bug.status_rollup.stage === "closed" && Boolean(bug.fixed_at));
  const currentIndex = bug.status_rollup.stage === "closed" && !resolved
    ? 0
    : stageIndex[bug.status_rollup.stage];
  const stopped = ["needs_attention", "not_reproduced", "wont_fix"].includes(
    bug.status_rollup.stage,
  ) || (bug.status_rollup.stage === "closed" && !resolved);
  return {
    schema_version: 1,
    headline: bug.status_rollup.stage === "not_reproduced"
      ? "Could not confirm the issue"
      : bug.status_rollup.stage === "closed" ? "Closed"
        : stopped ? "Needs team review"
        : resolved ? "Confirmed resolved" : bug.status_rollup.label,
    outcome: bug.status_rollup.stage === "not_reproduced" ? "not_reproduced"
      : bug.status_rollup.stage === "closed" && !resolved ? "closed"
        : stopped ? "needs_attention" : resolved ? "resolved" : "in_progress",
    handling: "unknown",
    next_step: null,
    started_at: bug.first_reported_at,
    completed_at: resolved ? bug.status_rollup.updated_at : null,
    total_duration_ms: null,
    verification_method: null,
    verification_label: null,
    release_environment: bug.status_rollup.environment,
    fixed_version: bug.status_rollup.fixed_version,
    released_version: bug.status_rollup.version,
    automatic_fix_authorized: false,
    automatic_delivery_authorized: false,
    approval_required: false,
    milestones: FALLBACK_JOURNEY_STAGES.map((definition, index) => ({
      ...definition,
      label: stopped && index === currentIndex
        ? bug.status_rollup.stage === "not_reproduced" ? "Could not confirm"
          : bug.status_rollup.stage === "closed" ? "Closed" : "Needs team review"
        : definition.label,
      state: index < currentIndex || (resolved && index <= currentIndex)
        ? "complete"
        : index === currentIndex ? stopped ? "stopped" : "current" : "upcoming",
      started_at: index === 0 ? bug.first_reported_at : null,
      completed_at: index === 0 ? bug.first_reported_at : null,
      duration_ms: index === 0 ? 0 : null,
    })),
  };
}

function journeyForBug(bug: TrackedBugRecord): BugResolutionJourney {
  return bug.resolution_journey || fallbackJourney(bug);
}

function bugDuration(milliseconds: number | null): string {
  if (milliseconds === null) return "—";
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function milestoneTone(
  milestone: BugResolutionMilestone,
  journey: BugResolutionJourney,
): { color: string; surface: string } {
  if (milestone.state === "complete") {
    return journey.outcome === "resolved"
      ? { color: "var(--handrail-bug-success-text)", surface: "var(--handrail-bug-success-surface)" }
      : { color: "var(--handrail-bug-accent)", surface: "var(--handrail-bug-info-surface)" };
  }
  if (milestone.state === "stopped") {
    return journey.outcome === "not_reproduced"
      ? { color: "var(--handrail-bug-muted-text)", surface: "var(--handrail-bug-surface-muted)" }
      : { color: "var(--handrail-bug-warning-text)", surface: "var(--handrail-bug-warning-surface)" };
  }
  if (milestone.state === "current") {
    return { color: "var(--handrail-bug-info-text)", surface: "var(--handrail-bug-info-surface)" };
  }
  return { color: "var(--handrail-bug-border)", surface: "var(--handrail-bug-surface-muted)" };
}

function BugResolutionProgress({ bug }: { readonly bug: TrackedBugRecord }): ReactElement {
  const journey = journeyForBug(bug);
  return <ol
    aria-label={`Resolution progress for ${bug.title}`}
    data-handrail-bug-resolution-progress="true"
    style={{ display: "grid", gridTemplateColumns: `repeat(${journey.milestones.length}, minmax(72px, 1fr))`, minWidth: 0, margin: 0, padding: 0, listStyle: "none" }}
  >
    {journey.milestones.map((milestone, index) => {
      const tone = milestoneTone(milestone, journey);
      const prior = index > 0 ? journey.milestones[index - 1] : null;
      const connectorComplete = milestone.state === "complete" && prior?.state === "complete";
      return <li key={milestone.key} data-handrail-bug-journey-milestone={milestone.key} style={{ position: "relative", minWidth: 0, padding: "0 4px", color: milestone.state === "upcoming" ? "var(--handrail-bug-muted-text)" : tone.color, textAlign: "center" }}>
        {index > 0 && <span aria-hidden="true" style={{ position: "absolute", top: 8, right: "50%", left: "-50%", height: 2, background: connectorComplete ? journey.outcome === "resolved" ? "var(--handrail-bug-success-text)" : "var(--handrail-bug-accent)" : milestone.state === "current" ? "var(--handrail-bug-info-text)" : "var(--handrail-bug-border)" }} />}
        <span aria-hidden="true" style={{ position: "relative", zIndex: 1, display: "grid", placeItems: "center", width: 18, height: 18, margin: "0 auto 5px", boxSizing: "border-box", border: `2px solid ${tone.color}`, borderRadius: 999, color: tone.color, background: tone.surface, boxShadow: milestone.state === "current" ? `0 0 0 4px ${tone.surface}` : undefined, fontSize: 10, fontWeight: 900 }}>
          {milestone.state === "complete" ? "✓" : milestone.state === "stopped" ? "!" : ""}
        </span>
        <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10, lineHeight: 1.25 }}>{milestone.label}</strong>
        <span style={{ display: "block", marginTop: 2, color: milestone.state === "upcoming" ? "var(--handrail-bug-muted-text)" : tone.color, fontSize: 9, lineHeight: 1.2 }}>
          {milestone.state === "current" ? "In progress" : milestone.state === "stopped" ? "Paused" : milestone.duration_ms === null ? "" : bugDuration(milestone.duration_ms)}
        </span>
      </li>;
    })}
  </ol>;
}

function BugResolutionReceipt({ bug }: { readonly bug: TrackedBugRecord }): ReactElement {
  const journey = journeyForBug(bug);
  const completed = journey.milestones.filter((milestone) => milestone.state === "complete");
  const completedTone = journey.outcome === "resolved"
    ? "var(--handrail-bug-success-text)"
    : "var(--handrail-bug-accent)";
  const facts = [
    journey.verification_label && `Confirmed with ${journey.verification_label.toLocaleLowerCase()}`,
    journey.automatic_fix_authorized && "Automation policy allowed the correction",
    completed.some((milestone) => milestone.key === "checked") && "Required safety checks completed",
    journey.automatic_delivery_authorized && "Release policy allowed delivery",
    completed.some((milestone) => milestone.key === "released") && `Released${journey.release_environment ? ` to ${journey.release_environment}` : ""}`,
    completed.some((milestone) => milestone.key === "confirmed_resolved") && "Confirmed the issue was gone",
  ].filter(Boolean) as string[];
  return <section aria-label={`Resolution receipt for ${bug.title}`} data-handrail-bug-resolution-receipt="true" style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "minmax(260px, 1.35fr) minmax(220px, .65fr)", gap: 14, marginTop: 2, padding: 14, border: "1px solid color-mix(in srgb, var(--handrail-bug-accent) 18%, var(--handrail-bug-border))", borderRadius: 11, background: "linear-gradient(135deg, color-mix(in srgb, var(--handrail-bug-accent) 5%, var(--handrail-bug-surface)), var(--handrail-bug-surface))" }}>
    <div>
      <div style={{ color: "var(--handrail-bug-muted-text)", fontSize: 10, fontWeight: 900, letterSpacing: ".08em", textTransform: "uppercase" }}>How Handrail handled it</div>
      <h4 style={{ margin: "5px 0 7px", fontSize: 17 }}>{journey.headline}</h4>
      {journey.next_step && <div data-handrail-bug-next-step="true" style={{ margin: "0 0 9px", padding: "9px 10px", border: "1px solid var(--handrail-bug-warning-text)", borderRadius: 8, background: "var(--handrail-bug-warning-surface)", color: "var(--handrail-bug-warning-text)", fontSize: 11, lineHeight: 1.45 }}>
        <strong style={{ display: "block", marginBottom: 2 }}>Next step: {journey.next_step.label}</strong>
        <span>{journey.next_step.summary}</span>
      </div>}
      {facts.length > 0
        ? <ul style={{ display: "grid", gap: 5, margin: 0, padding: 0, listStyle: "none", color: "var(--handrail-bug-muted-text)", fontSize: 11 }}>{facts.map((fact) => <li key={fact}><span aria-hidden="true" style={{ marginRight: 7, color: completedTone, fontWeight: 900 }}>✓</span>{fact}</li>)}</ul>
        : <p style={{ margin: 0, color: "var(--handrail-bug-muted-text)", fontSize: 11 }}>Handrail will add verification, safety, and release receipts as this report progresses.</p>}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, padding: 10, border: "1px solid var(--handrail-bug-border)", borderRadius: 9, background: "var(--handrail-bug-surface)", fontSize: 10 }}>
      <span><strong style={{ display: "block", color: "var(--handrail-bug-muted-text)" }}>Total time</strong><b style={{ fontSize: 14 }}>{bugDuration(journey.total_duration_ms)}</b></span>
      <span><strong style={{ display: "block", color: "var(--handrail-bug-muted-text)" }}>Handling</strong><b>{journey.handling === "automatic" ? "Automatic" : journey.handling === "team_review" ? "Team review" : "Policy managed"}</b></span>
      <span><strong style={{ display: "block", color: "var(--handrail-bug-muted-text)" }}>Environment</strong><b>{journey.release_environment || bug.environment}</b></span>
      <span><strong style={{ display: "block", color: "var(--handrail-bug-muted-text)" }}>Released version</strong><b>{journey.released_version || journey.fixed_version || "Pending"}</b></span>
      <span style={{ gridColumn: "1 / -1" }}><strong style={{ display: "block", color: "var(--handrail-bug-muted-text)" }}>Reference</strong><b>{bug.id}</b></span>
    </div>
  </section>;
}

function BugHistoryRow({
  bug,
  busy,
  expanded,
  onToggle,
  onArchive,
  onRestore,
}: {
  readonly bug: TrackedBugRecord;
  readonly busy: boolean;
  readonly expanded: boolean;
  readonly onToggle: (bugId: string) => void;
  readonly onArchive: (bugId: string) => Promise<void>;
  readonly onRestore: (bugId: string) => Promise<void>;
}): ReactElement {
  const group = bugStatusGroup(bug);
  const statusTimestamp = bug.status_rollup.updated_at || bug.updated_at;
  const journey = journeyForBug(bug);
  const resolved = journey.outcome === "resolved";
  return <article role="row" data-handrail-bug-history-row="true" style={styles.historyItem}>
    <div role="cell" data-handrail-bug-history-cell="issue" style={{ minWidth: 0 }}>
      <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, lineHeight: 1.35 }}>{bug.title}</strong>
      <span title={bug.reported_route || undefined} style={{ display: "block", overflow: "hidden", marginTop: 3, color: "var(--handrail-bug-muted-text)", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10 }}>{bug.reported_route || "Page unavailable"}{bug.reported_app_version ? ` · v${bug.reported_app_version.replace(/^v/iu, "")}` : ""}</span>
      {bug.reporter_occurrence_count > 1 && <span style={{ display: "block", marginTop: 3, color: "var(--handrail-bug-muted-text)", fontSize: 10 }}>{bug.reporter_occurrence_count} reports</span>}
    </div>
    <div role="cell" data-handrail-bug-history-cell="journey" style={{ minWidth: 0, overflowX: "auto", padding: "3px 0" }}>
      <BugResolutionProgress bug={bug} />
    </div>
    <div role="cell" data-handrail-bug-history-cell="secondary" style={{ minWidth: 0, color: "var(--handrail-bug-muted-text)", fontSize: 11 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 7 }}><span aria-hidden="true" style={{ width: 7, height: 7, flex: "0 0 7px", borderRadius: 999, background: severityColor(bug.severity) }} />{bugSeverityLabel(bug.severity)}</span>
      {journey.handling === "automatic" && <strong style={{ display: "block", marginTop: 5, color: "var(--handrail-bug-success-text)", fontSize: 9 }}>Handled automatically</strong>}
      {journey.handling === "team_review" && <strong style={{ display: "block", marginTop: 5, color: "var(--handrail-bug-warning-text)", fontSize: 9 }}>Team review</strong>}
    </div>
    <div role="cell" data-handrail-bug-history-cell="status" style={{ display: "grid", gap: 5, minWidth: 0 }}>
      <span title={bugDate(bug.last_reported_at)} style={{ color: "var(--handrail-bug-muted-text)", fontSize: 10 }}>{bugRelativeAge(bug.last_reported_at)}</span>
      <span style={{ overflow: "hidden", maxWidth: "100%", padding: "3px 7px", border: "1px solid", borderRadius: 6, textAlign: "center", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 9, fontWeight: 800, ...statusBadgeStyle(group, bug.status_rollup.label, resolved) }}>{journey.headline}</span>
      {journey.total_duration_ms !== null && <strong title={bugDate(statusTimestamp)} style={{ color: resolved ? "var(--handrail-bug-success-text)" : "var(--handrail-bug-muted-text)", fontSize: 9 }}>in {bugDuration(journey.total_duration_ms)}</strong>}
    </div>
    <div role="cell" data-handrail-bug-history-cell="action" style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
      <button type="button" aria-expanded={expanded} aria-label={`View ${bug.title}`} onClick={() => onToggle(bug.id)} style={styles.historyActionButton}>{expanded ? "Hide" : "View"}</button>
      <button
        type="button"
        disabled={busy}
        aria-label={`${bug.archived ? "Restore" : "Archive"} ${bug.title}`}
        onClick={() => void (bug.archived ? onRestore(bug.id) : onArchive(bug.id))}
        style={{
          ...styles.historyActionButton,
          color: "var(--handrail-bug-muted-text)",
          background: "transparent",
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.65 : 1,
        }}
      >
        {busy ? "Updating…" : bug.archived ? "Restore" : "Archive"}
      </button>
    </div>
    {expanded && <div role="cell" data-handrail-bug-history-detail="true" style={{ display: "contents" }}><BugResolutionReceipt bug={bug} /></div>}
  </article>;
}

function BugHistory(): ReactElement {
  const reporter = useHandrailBugReporter();
  const [search, setSearch] = useState(() => reporter.tracking.query?.search || "");
  const [statusGroup, setStatusGroup] = useState<BugTrackingStatusGroup | "">(
    () => reporter.tracking.query?.statusGroup || "",
  );
  const [visibility, setVisibility] = useState<BugTrackingVisibility>(
    () => reporter.tracking.query?.visibility || "active",
  );
  const [sort, setSort] = useState<"newest" | "oldest">(
    () => reporter.tracking.query?.sort || "newest",
  );
  const [busyBugId, setBusyBugId] = useState<string | null>(null);
  const [expandedBugId, setExpandedBugId] = useState<string | null>(null);
  const [historyActionError, setHistoryActionError] = useState<string | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackingStatusRef = useRef(reporter.tracking.status);
  trackingStatusRef.current = reporter.tracking.status;

  useEffect(() => () => {
    if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current);
  }, []);

  const query = (
    overrides: Partial<BugReporterTrackingQueryOptions> = {},
  ): BugReporterTrackingQueryOptions => ({
    search: search.trim() || undefined,
    statusGroup: statusGroup || undefined,
    visibility,
    sort,
    ...overrides,
  });

  const refresh = async (
    overrides: Partial<BugReporterTrackingQueryOptions> = {},
  ) => {
    setHistoryActionError(null);
    try {
      await reporter.refreshBugs(query(overrides));
    } catch (error) {
      setHistoryActionError(error instanceof Error ? error.message : "Bug history could not be loaded.");
    }
  };

  useEffect(() => {
    const refreshBugs = reporter.refreshBugs;
    const currentQuery: BugReporterTrackingQueryOptions = {
      search: search.trim() || undefined,
      statusGroup: statusGroup || undefined,
      visibility,
      sort,
    };
    const interval = setInterval(() => {
      if (trackingStatusRef.current === "loading") return;
      setHistoryActionError(null);
      void refreshBugs(currentQuery).catch((error) => {
        setHistoryActionError(
          error instanceof Error ? error.message : "Bug history could not be loaded.",
        );
      });
    }, HISTORY_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [reporter.refreshBugs, search, sort, statusGroup, visibility]);

  const changeArchive = async (bugId: string, archived: boolean) => {
    setBusyBugId(bugId);
    setHistoryActionError(null);
    try {
      if (archived) await reporter.archiveBug(bugId);
      else await reporter.restoreBug(bugId);
    } catch (error) {
      setHistoryActionError(error instanceof Error ? error.message : "Bug history could not be updated.");
    } finally {
      setBusyBugId(null);
    }
  };

  const loadMore = async () => {
    setHistoryActionError(null);
    try {
      await reporter.loadMoreBugs();
    } catch (error) {
      setHistoryActionError(error instanceof Error ? error.message : "More bugs could not be loaded.");
    }
  };

  const summary = reporter.tracking.summary;
  const total = summary?.total ?? reporter.tracking.bugs.length;
  const showHistoryResults = reporter.tracking.status === "ready"
    || reporter.tracking.bugs.length > 0;
  const countFor = (value: BugTrackingStatusGroup | ""): number => {
    if (!value) return total;
    if (summary) return summary[value];
    return reporter.tracking.bugs.filter((bug) => bugStatusGroup(bug) === value).length;
  };

  const chooseVisibility = (next: BugTrackingVisibility) => {
    setVisibility(next);
    setStatusGroup("");
    void refresh({ visibility: next, statusGroup: undefined });
  };

  const chooseStatus = (next: BugTrackingStatusGroup | "") => {
    setStatusGroup(next);
    void refresh({ statusGroup: next || undefined });
  };

  const searchBugs = (next: string) => {
    setSearch(next);
    if (searchTimerRef.current !== null) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      searchTimerRef.current = null;
      void refresh({ search: next.trim() || undefined });
    }, 300);
  };

  return <section aria-label="My bug reports" aria-busy={reporter.tracking.status === "loading"} data-handrail-bug-history="true" style={{ display: "flex", width: "100%", minHeight: 0, flex: "1 1 auto", flexDirection: "column", gap: 8, boxSizing: "border-box" }}>
    <form
      data-handrail-bug-history-toolbar="true"
      style={{ ...styles.historyControls, width: "100%" }}
      onSubmit={(event) => {
        event.preventDefault();
        void refresh();
      }}
    >
      <div role="tablist" aria-label="Bug history visibility" style={{ display: "flex", flex: "0 0 auto", gap: 2, padding: 2, borderRadius: 8, background: "var(--handrail-bug-surface-muted)" }}>
        {(["active", "archived"] as const).map((option) => <button
          key={option}
          type="button"
          role="tab"
          aria-selected={visibility === option}
          disabled={busyBugId !== null}
          onClick={() => chooseVisibility(option)}
          style={{
            ...styles.tab,
            flex: "0 0 auto",
            minHeight: 30,
            padding: "4px 10px",
            borderColor: "transparent",
            ...(visibility === option ? styles.selectedControl : {}),
          }}
        >{option[0].toUpperCase() + option.slice(1)}</button>)}
      </div>
      <input
        aria-label="Search my bugs"
        autoComplete="off"
        maxLength={200}
        type="search"
        value={search}
        onChange={(event) => searchBugs(event.target.value)}
        placeholder="Search reports…"
        style={{ ...styles.input, flex: "1 1 220px", minWidth: 170, minHeight: 34, background: "var(--handrail-bug-surface)" }}
      />
      <div role="group" aria-label="Filter bugs by status" data-handrail-bug-history-overview="true" style={styles.historyPills}>
        {HISTORY_FILTERS.map((filter) => <button
          key={filter.label}
          type="button"
          aria-pressed={statusGroup === filter.value}
          onClick={() => chooseStatus(filter.value)}
          style={{
            ...buttonStyle("secondary"),
            minHeight: 30,
            padding: "4px 9px",
            borderColor: "transparent",
            borderRadius: 999,
            color: "var(--handrail-bug-muted-text)",
            background: "var(--handrail-bug-surface-muted)",
            ...(statusGroup === filter.value ? {
              color: "var(--handrail-bug-accent-text)",
              background: "var(--handrail-bug-accent)",
            } : {}),
          }}
        >{filter.label} <span aria-label={`${countFor(filter.value)} reports`} style={{ opacity: 0.72 }}>{countFor(filter.value)}</span></button>)}
      </div>
      <select
        aria-label="Bug sort order"
        value={sort}
        onChange={(event) => {
          const next = event.target.value as "newest" | "oldest";
          setSort(next);
          void refresh({ sort: next });
        }}
        style={{ ...styles.input, width: 128, flex: "0 1 128px", minHeight: 34, background: "var(--handrail-bug-surface)" }}
      >
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
      </select>
    </form>

    {historyActionError && <div role="alert" style={{ ...styles.status, background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }}>{historyActionError}</div>}
    {reporter.tracking.status === "loading" && reporter.tracking.bugs.length === 0 && <div role="status" style={{ ...styles.status, background: "var(--handrail-bug-surface-muted)", color: "var(--handrail-bug-muted-text)" }}>Loading your bugs…</div>}
    {reporter.tracking.status === "error" && !historyActionError && <div role="alert" style={{ ...styles.status, background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }}>{reporter.tracking.error?.message || "Bug history could not be loaded."}</div>}
    {showHistoryResults && <div role="table" aria-label="Reported bugs" data-handrail-bug-history-list="true" style={{ ...styles.historyList, flex: "1 1 auto", opacity: reporter.tracking.status === "loading" ? 0.68 : 1 }}>
      <div role="row" data-handrail-bug-history-header="true" style={styles.historyListHeader}>
        <span role="columnheader">Issue</span><span role="columnheader">Resolution progress</span><span role="columnheader">Impact</span><span role="columnheader">Reported</span><span role="columnheader">Action</span>
      </div>
      {reporter.tracking.bugs.length === 0
        ? <div role="status" style={{ padding: "24px 12px", color: "var(--handrail-bug-muted-text)", textAlign: "center" }}>
            {search || statusGroup ? "No bugs match your search and filters." : visibility === "archived" ? "You don’t have any archived bugs." : "You haven’t reported any bugs yet."}
          </div>
        : reporter.tracking.bugs.map((bug) => <BugHistoryRow
            key={bug.id}
            bug={bug}
            busy={busyBugId === bug.id}
            expanded={expandedBugId === bug.id}
            onToggle={(bugId) => setExpandedBugId((current) => current === bugId ? null : bugId)}
            onArchive={(bugId) => changeArchive(bugId, true)}
            onRestore={(bugId) => changeArchive(bugId, false)}
          />)}
      {reporter.tracking.hasMore && <div style={{ display: "grid", placeItems: "center", padding: 10, borderBottom: "1px solid var(--handrail-bug-border)" }}>
        <button type="button" disabled={reporter.tracking.status === "loading"} onClick={() => void loadMore()} style={buttonStyle("secondary")}>
          {reporter.tracking.status === "loading" ? "Loading…" : `Show more (${reporter.tracking.bugs.length} of ${total})`}
        </button>
      </div>}
    </div>}
  </section>;
}

function BugReportForm({ onCancel }: { readonly onCancel: () => void }): ReactElement {
  const reporter = useHandrailBugReporter();
  const successHeadingId = useId();
  const [localError, setLocalError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [screenshotPreviewOpen, setScreenshotPreviewOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const screenshotPreviewButtonRef = useRef<HTMLButtonElement | null>(null);
  const message = submissionMessage(reporter.submission);
  const notificationEligibility = reporter.policy?.reporterNotifications;
  const notificationsAvailable = notificationEligibility?.available === true;
  const automationPolicy = reporter.policy?.automationPolicy;
  const automationRole = reporter.policy?.role === "maintainer"
    ? "Maintainer"
    : reporter.policy?.role === "contributor"
      ? "Contributor"
      : reporter.policy?.role === "requester"
        ? "Requester"
        : reporter.policy?.accessLevel === "full_access"
          ? "Maintainer"
          : reporter.policy?.accessLevel === "user"
            ? "Contributor"
            : "Requester";
  const productionMaxRisk = automationPolicy
    ?.productionMaxRiskByImpact[reporter.form.impact];
  const riskLabel = (risk: string | undefined): string => risk === "none"
    ? "not automatic"
    : risk ? `up to ${risk} change risk` : "not available";

  useEffect(() => {
    if (!notificationsAvailable && reporter.form.notifyOnResolution) {
      reporter.updateForm({ notifyOnResolution: false });
    }
  }, [notificationsAvailable, reporter.form.notifyOnResolution, reporter.updateForm]);

  useEffect(() => {
    const screenshot = reporter.form.screenshot;
    if (!screenshot) {
      setPreviewUrl(null);
      setScreenshotPreviewOpen(false);
      return undefined;
    }
    const preview = screenshotPreviewUrl(screenshot);
    setPreviewUrl(preview.url);
    return () => {
      if (
        preview.revoke
        && preview.url
        && typeof URL !== "undefined"
        && typeof URL.revokeObjectURL === "function"
      ) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [reporter.form.screenshot]);

  const closeScreenshotPreview = () => {
    setScreenshotPreviewOpen(false);
    screenshotPreviewButtonRef.current?.focus();
  };

  const attachScreenshot = (file: File): boolean => {
    setLocalError(null);
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setLocalError("Choose a PNG or JPEG screenshot.");
      return false;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setLocalError("Choose a PNG or JPEG screenshot no larger than 20 MiB.");
      return false;
    }
    reporter.replaceScreenshot({
      data: file,
      mimeType: file.type,
      filename: file.name || (file.type === "image/png"
        ? "clipboard-screenshot.png"
        : "clipboard-screenshot.jpg"),
    });
    return true;
  };

  const onScreenshot = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    attachScreenshot(file);
  };

  const onPaste = (event: ReactClipboardEvent<HTMLFormElement>) => {
    if (!reporter.canAttachScreenshot) return;
    const file = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file")
      ?.getAsFile();
    if (!file) return;
    event.preventDefault();
    attachScreenshot(file);
  };

  const onScreenshotDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!reporter.canAttachScreenshot || !Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  };

  const onScreenshotDrop = (event: ReactDragEvent<HTMLElement>) => {
    if (!reporter.canAttachScreenshot) return;
    const file = Array.from(event.dataTransfer.files)[0];
    if (!file) return;
    event.preventDefault();
    setDragActive(false);
    attachScreenshot(file);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    if (!reporter.form.title.trim() || !reporter.form.description.trim()) {
      setLocalError("Add a title and description before submitting.");
      return;
    }
    try {
      await reporter.submit();
    } catch {
      // The provider exposes a redacted, presentation-safe error state.
    }
  };

  const startAnotherReport = () => {
    reporter.resetSubmission();
    reporter.updateForm({
      title: "",
      description: "",
      impact: "moderate",
      severity: undefined,
      reproducer: undefined,
      screenshot: null,
      automationRequests: [],
      notifyOnResolution: false,
    });
  };

  if (reporter.submission.status === "submitted") {
    const result = reporter.submission.result?.status === "submitted"
      ? reporter.submission.result
      : null;
    const warning = result?.notificationWarning || null;
    const subscription = result?.notificationSubscription || null;
    return <section
      data-handrail-bug-submission-success="true"
      aria-labelledby={successHeadingId}
      style={{
        display: "grid",
        alignContent: "center",
        justifyItems: "center",
        minHeight: "min(520px, 60vh)",
        padding: "32px 18px",
        textAlign: "center",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          display: "grid",
          placeItems: "center",
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--handrail-bug-success-surface)",
          color: "var(--handrail-bug-success-text)",
          fontSize: 30,
          fontWeight: 800,
        }}
      >✓</div>
      <h3 id={successHeadingId} style={{ margin: "18px 0 8px", fontSize: 24 }}>
        Thanks for submitting this bug
      </h3>
      <p role="status" aria-live="polite" style={{ maxWidth: 560, margin: 0, color: "var(--handrail-bug-muted-text)", lineHeight: 1.55 }}>
        Your report was sent to the product team. You can follow its progress from My bugs.
      </p>
      {subscription?.active === true && <div style={{ ...styles.status, maxWidth: 560, marginTop: 18, marginBottom: 0, background: "var(--handrail-bug-success-surface)", color: "var(--handrail-bug-success-text)" }}>
        Email updates are enabled{subscription.recipientHint ? ` for ${subscription.recipientHint}` : ""}.
      </div>}
      {warning && <div role="alert" style={{ ...styles.status, maxWidth: 560, marginTop: 18, marginBottom: 0, background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }}>
        Your bug is saved, but email updates could not be enabled.
      </div>}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
        <button type="button" onClick={startAnotherReport} style={buttonStyle("secondary")}>Report another bug</button>
        <button type="button" onClick={onCancel} style={buttonStyle("primary")}>Done</button>
      </div>
    </section>;
  }

  return <form
    data-handrail-bug-report-form="true"
    onSubmit={(event) => void onSubmit(event)}
    onPaste={onPaste}
    style={{ display: "flex", width: "100%", minHeight: 0, flex: "1 1 auto", flexDirection: "column" }}
  >
    {localError && <div role="alert" style={{ ...styles.status, background: "var(--handrail-bug-danger-surface)", color: "var(--handrail-bug-danger-text)" }}>{localError}</div>}
    {message && <div role={message.role} aria-live="polite" style={{ ...styles.status, ...message.style }}>{message.text}</div>}

    <div data-handrail-bug-report-layout="true" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) minmax(280px, .72fr)", gap: 16, minHeight: 0, flex: "1 1 auto", alignItems: "stretch" }}>
      <section
        data-handrail-bug-report-details="true"
        aria-label="Bug details"
        style={{
          display: "grid",
          gridTemplateRows: reporter.canAttachScreenshot
            ? "auto minmax(126px, 1.35fr) minmax(92px, .85fr) minmax(104px, .8fr)"
            : "auto minmax(150px, 1.5fr) minmax(110px, 1fr)",
          minHeight: 0,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(150px, .3fr)", gap: 12 }}>
          <label style={styles.label}>
            Brief summary
            <input required maxLength={500} value={reporter.form.title} onChange={(event) => reporter.updateForm({ title: event.target.value })} placeholder="What is broken?" style={styles.input} />
          </label>
          <label style={styles.label}>
            Severity
            <select aria-label="Bug severity" value={reporter.form.impact} onChange={(event) => reporter.updateForm({ impact: event.target.value as BugImpact, severity: undefined })} style={styles.input}>
              {BUG_SEVERITY_OPTIONS.map((option) => <option key={option.impact} value={option.impact}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <label data-handrail-bug-expanding-field="true" style={{ ...styles.label, gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0 }}>
          What happened?
          <textarea required maxLength={20_000} value={reporter.form.description} onChange={(event) => reporter.updateForm({ description: event.target.value })} placeholder="Describe what you expected and what happened instead. You can paste a screenshot here." style={{ ...styles.input, height: "100%", minHeight: 96, resize: "vertical" }} />
        </label>
        <label data-handrail-bug-expanding-field="true" style={{ ...styles.label, gridTemplateRows: "auto minmax(0, 1fr)", minHeight: 0 }}>
          <span>Steps to reproduce <span style={{ marginLeft: 6, color: "var(--handrail-bug-muted-text)", fontSize: 11, fontWeight: 500 }}>Optional</span></span>
          <textarea maxLength={20_000} value={reporter.form.reproducer || ""} onChange={(event) => reporter.updateForm({ reproducer: event.target.value || undefined })} placeholder="1. Open…  2. Click…  3. See…" style={{ ...styles.input, height: "100%", minHeight: 64, resize: "vertical" }} />
        </label>

        {reporter.canAttachScreenshot && <div
      data-handrail-bug-screenshot-dropzone="true"
      onDragEnter={onScreenshotDragOver}
      onDragOver={onScreenshotDragOver}
      onDragLeave={() => setDragActive(false)}
      onDrop={onScreenshotDrop}
      style={{ display: "flex", minHeight: 104 }}
    >
      <input
        ref={fileInputRef}
        aria-label="Attach screenshot"
        type="file"
        accept="image/png,image/jpeg"
        hidden
        tabIndex={-1}
        onChange={onScreenshot}
      />
      {reporter.form.screenshot ? <div style={styles.screenshotPreview}>
        {previewUrl
          ? <button
              ref={screenshotPreviewButtonRef}
              type="button"
              aria-label="View attached screenshot larger"
              aria-haspopup="dialog"
              aria-expanded={screenshotPreviewOpen}
              onClick={() => setScreenshotPreviewOpen(true)}
              style={styles.screenshotPreviewButton}
            >
              <img src={previewUrl} alt="Bug report screenshot preview" style={{ ...styles.screenshotThumbnail, display: "block" }} />
              <span
                data-handrail-bug-image-expand-affordance="true"
                aria-hidden="true"
                style={{ position: "absolute", right: 6, bottom: 6, display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 6px", borderRadius: 999, color: "var(--handrail-bug-accent-text)", background: "var(--handrail-bug-accent)", boxShadow: "0 1px 4px rgba(0, 0, 0, 0.28)", fontSize: 9, fontWeight: 800, lineHeight: 1 }}
              ><span style={{ fontSize: 12 }}>↗</span> View</span>
            </button>
          : <div role="img" aria-label="Screenshot preview unavailable" style={{ ...styles.screenshotThumbnail, display: "grid", placeItems: "center", color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>Preview unavailable</div>}
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reporter.form.screenshot.filename || "Attached screenshot"}</strong>
          <div style={{ marginTop: 4, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>{screenshotDetails(reporter.form.screenshot)}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
            <button type="button" onClick={() => fileInputRef.current?.click()} style={{ border: 0, padding: 0, color: "var(--handrail-bug-accent)", background: "transparent", cursor: "pointer", font: "inherit", fontWeight: 700 }}>Replace</button>
            <button type="button" onClick={reporter.removeScreenshot} style={{ border: 0, padding: 0, color: "var(--handrail-bug-danger-text)", background: "transparent", cursor: "pointer", font: "inherit", fontWeight: 700 }}>Remove</button>
          </div>
        </div>
      </div> : <button type="button" aria-label="Add or paste a screenshot" onClick={() => fileInputRef.current?.click()} style={{
        ...styles.screenshotDropzone,
        width: "100%",
        color: dragActive ? "var(--handrail-bug-accent)" : "var(--handrail-bug-muted-text)",
        borderColor: dragActive ? "var(--handrail-bug-accent)" : "var(--handrail-bug-border)",
        cursor: "pointer",
        font: "inherit",
        fontWeight: 700,
      }}><span aria-hidden="true" style={{ marginRight: 8, fontSize: 20 }}>+</span>Add or paste a screenshot</button>}
        </div>}
      </section>

      {screenshotPreviewOpen && previewUrl && <section
        data-handrail-bug-screenshot-lightbox="true"
        role="dialog"
        aria-modal="true"
        aria-label="Attached screenshot preview"
        tabIndex={-1}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeScreenshotPreview();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeScreenshotPreview();
            return;
          }
          if (event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.querySelector<HTMLElement>(focusableSelector)?.focus();
          }
        }}
        style={styles.screenshotLightbox}
      >
        <button
          type="button"
          aria-label="Close screenshot preview"
          autoFocus
          onClick={closeScreenshotPreview}
          style={{ ...buttonStyle("secondary"), position: "absolute", top: 16, right: 16, width: 40, height: 40, padding: 0, fontSize: 22, lineHeight: 1 }}
        >×</button>
        <img src={previewUrl} alt="Attached screenshot enlarged" style={styles.screenshotLightboxImage} />
      </section>}

      <aside data-handrail-bug-context="true" aria-label="Attached context and options" style={{ display: "grid", alignSelf: "start", gap: 10 }}>
        <section style={{ overflow: "hidden", border: "1px solid var(--handrail-bug-border)", borderRadius: 9, background: "var(--handrail-bug-surface)" }}>
          <h3 style={{ margin: 0, padding: "9px 12px", borderBottom: "1px solid var(--handrail-bug-border)", fontSize: 12 }}>Attached context</h3>
          {([
            ["Current page", reporter.form.route || "Not provided"],
            ["App version", reporter.form.appVersion || "Not provided"],
            ["Environment", reporter.reporter.configuration.environment || "Not provided"],
          ] as const).map(([label, value]) => <div key={label} style={{ display: "grid", gridTemplateColumns: "100px minmax(0, 1fr)", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--handrail-bug-border)", fontSize: 11 }}>
            <span style={{ color: "var(--handrail-bug-muted-text)" }}>{label}</span>
            <strong title={value} style={{ overflow: "hidden", textAlign: "right", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</strong>
          </div>)}
          <p style={{ margin: 0, padding: "8px 12px", color: "var(--handrail-bug-muted-text)", background: "var(--handrail-bug-surface-muted)", fontSize: 10 }}>This context is included with this report.</p>
        </section>

        {reporter.policyStatus === "loading" && <div role="status" style={{ color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>Loading access policy…</div>}
        {reporter.policy && <section data-handrail-bug-access-summary="true" data-handrail-bug-automation-policy="true" style={{ overflow: "hidden", border: "1px solid var(--handrail-bug-border)", borderRadius: 9, background: "var(--handrail-bug-surface)" }}>
          <h3 style={{ margin: 0, padding: "9px 12px", borderBottom: "1px solid var(--handrail-bug-border)", fontSize: 12 }}>Your access</h3>
          <div style={{ padding: "8px 12px", fontSize: 11 }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}><span style={{ color: "var(--handrail-bug-muted-text)" }}>Role</span><strong>{automationRole}</strong></span>
            {automationPolicy && <span style={{ display: "block", marginTop: 5, color: "var(--handrail-bug-muted-text)" }}>Automatic repair: {riskLabel(automationPolicy.automaticFixMaxRisk)}</span>}
            {productionMaxRisk && <span style={{ display: "block", marginTop: 2, color: "var(--handrail-bug-muted-text)" }}>Production eligibility for verified {bugSeverityLabel(reporter.form.impact)} impact: {riskLabel(productionMaxRisk)}</span>}
          </div>
          <p style={{ margin: 0, padding: "8px 12px", color: "var(--handrail-bug-muted-text)", background: "var(--handrail-bug-surface-muted)", fontSize: 10 }}>Final deployment is evaluated separately under the project deployment policy.</p>
        </section>}

        {notificationsAvailable && <fieldset style={{ ...styles.fieldset, margin: 0 }}>
          <legend style={{ padding: "0 5px", fontWeight: 700 }}>Updates</legend>
          <label data-handrail-bug-notification-opt-in="true">
            <input aria-label="Email me when this bug is fixed" type="checkbox" checked={reporter.form.notifyOnResolution} onChange={(event) => reporter.updateForm({ notifyOnResolution: event.target.checked })} />
            <span><strong>Email me when this bug is fixed</strong><span>One email after the fix reaches this environment{notificationEligibility?.recipientHint ? `, to ${notificationEligibility.recipientHint}` : ""}.</span></span>
          </label>
        </fieldset>}
      </aside>
    </div>

    <div style={styles.formActions}>
      <button type="button" onClick={onCancel} disabled={reporter.submission.status === "submitting"} style={buttonStyle("secondary")}>Cancel</button>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, flexWrap: "wrap" }}>
        <button type="submit" disabled={reporter.submission.status === "submitting"} style={{ ...buttonStyle("primary"), opacity: reporter.submission.status === "submitting" ? 0.65 : 1 }}>
          {reporter.submission.status === "submitting" ? "Sending…" : "Send report"}
        </button>
      </div>
    </div>
  </form>;
}

export function HandrailBugReporterDialog({
  open,
  onClose,
  heading = "Report a bug",
  appearance,
  showHistory = true,
}: HandrailBugReporterDialogProps): ReactElement | null {
  const reporter = useHandrailBugReporter();
  const [tab, setTab] = useState<DialogTab>("report");
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const policyRefreshAttemptedForOpenRef = useRef(false);
  const historyPreloadedForOpenRef = useRef(false);
  const headingId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(() => {
          const first = dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
          first?.focus();
        })
      : null;
    return () => {
      if (frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      policyRefreshAttemptedForOpenRef.current = false;
      return;
    }
    if (
      policyRefreshAttemptedForOpenRef.current
      || reporter.policyStatus !== "unavailable"
    ) return;
    policyRefreshAttemptedForOpenRef.current = true;
    void reporter.refreshPolicy().catch(() => undefined);
  }, [open, reporter.policyStatus, reporter.refreshPolicy]);

  useEffect(() => {
    if (!open) {
      historyPreloadedForOpenRef.current = false;
      return;
    }
    if (!showHistory || historyPreloadedForOpenRef.current) return;
    historyPreloadedForOpenRef.current = true;
    void reporter.refreshCurrentBugs().catch(() => undefined);
  }, [open, reporter, showHistory]);

  if (!open) return null;

  const selectTab = (next: DialogTab) => {
    setTab(next);
    if (
      next === "history"
      && reporter.tracking.status !== "loading"
      && (reporter.tracking.status === "idle" || reporter.tracking.stale)
    ) {
      void reporter.refreshCurrentBugs().catch(() => undefined);
    }
  };

  const closeDialog = () => {
    if (reporter.submission.status === "submitting") return;
    if (reporter.submission.status === "submitted") {
      reporter.resetSubmission();
      reporter.updateForm({
        title: "",
        description: "",
        impact: "moderate",
        severity: undefined,
        reproducer: undefined,
        screenshot: null,
        automationRequests: [],
        notifyOnResolution: false,
      });
    }
    onClose();
  };

  const onDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) || [],
    ).filter((element) => element.getAttribute("aria-hidden") !== "true");
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const variables = appearanceVariables(appearance);
  const historyCount = reporter.tracking.summary?.total
    ?? (reporter.tracking.status === "ready" ? reporter.tracking.bugs.length : null);
  const dialogHeading = tab === "history" ? "My bug reports" : heading;
  const dialogDescription = tab === "history"
    ? "Scan current status, progress, impact, and the next step for every report."
    : "Describe the issue and review the attached context before sending.";
  return <div
    data-handrail-bug-reporter="overlay"
    data-theme={appearance?.themeMode || "auto"}
    style={{ ...styles.overlay, ...variables }}
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) closeDialog();
    }}
  >
    <style>{RESPONSIVE_DIALOG_CSS}</style>
    <section
      ref={dialogRef}
      className={appearance?.className}
      data-handrail-bug-reporter-dialog="true"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      style={styles.dialog}
      onKeyDown={onDialogKeyDown}
    >
      <header data-handrail-bug-reporter-header="true" style={styles.header}>
        <div style={{ minWidth: 0 }}>
          {tab === "report" && <div style={{ marginBottom: 4, color: "var(--handrail-bug-accent)", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em" }}>HELP US FIX IT</div>}
          <h2 id={headingId} style={{ margin: 0, fontSize: 20, lineHeight: 1.2, letterSpacing: "-0.02em" }}>{dialogHeading}</h2>
          <div id={descriptionId} style={{ marginTop: 4, color: "var(--handrail-bug-muted-text)", fontSize: 12 }}>{dialogDescription}</div>
        </div>
        <div style={{ display: "flex", flex: "0 0 auto", alignItems: "center", gap: 8 }}>
          {showHistory && <button
            type="button"
            data-handrail-bug-view-switch={tab === "history" ? "report" : "history"}
            aria-label={tab === "history" ? "Report a bug" : "View my bug reports"}
            onClick={() => selectTab(tab === "history" ? "report" : "history")}
            style={tab === "history" ? buttonStyle("primary") : buttonStyle("secondary")}
          >
            {tab === "history" ? "Report a bug" : "My bug reports"}
            {tab === "report" && historyCount !== null && <span aria-label={`${historyCount} total`} style={{ display: "inline-grid", placeItems: "center", minWidth: 20, height: 20, marginLeft: 7, padding: "0 5px", borderRadius: 999, color: "var(--handrail-bug-muted-text)", background: "var(--handrail-bug-surface-muted)", fontSize: 10 }}>{historyCount}</span>}
          </button>}
          <button type="button" aria-label="Close bug reporter" disabled={reporter.submission.status === "submitting"} onClick={closeDialog} style={{ ...buttonStyle("secondary"), width: 38, minWidth: 38, height: 38, padding: 0, fontSize: 20, lineHeight: 1, opacity: reporter.submission.status === "submitting" ? 0.65 : 1 }}>×</button>
        </div>
      </header>
      <div data-handrail-bug-reporter-content={tab} style={{ ...styles.content, ...(tab === "history" ? styles.historyContent : {}) }}>
        {tab === "report"
          ? <div data-handrail-bug-report-panel="true" style={{ display: "flex", minHeight: 0, flex: "1 1 auto", flexDirection: "column" }}><BugReportForm onCancel={closeDialog} /></div>
          : <div style={{ display: "flex", width: "100%", minHeight: 0, flex: "1 1 auto" }}><BugHistory /></div>}
      </div>
    </section>
  </div>;
}

export function HandrailBugReporterButton({
  label = "Report a bug",
  className,
  style,
  ...dialogProps
}: HandrailBugReporterButtonProps): ReactElement {
  const [open, setOpen] = useState(false);
  return <>
    <button
      type="button"
      className={className}
      style={style || { ...appearanceVariables(dialogProps.appearance, false), ...buttonStyle("primary") }}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      {label}
    </button>
    <HandrailBugReporterDialog {...dialogProps} open={open} onClose={() => setOpen(false)} />
  </>;
}
