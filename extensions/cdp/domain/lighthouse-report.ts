/**
 * Lighthouse report domain: parameter normalization, flag building, report
 * naming, and LHR summarization. Pure functions only — no filesystem, no
 * network, no `lighthouse` import — so the whole contract is unit-testable.
 */

/** Categories exposed by current Lighthouse versions (the `pwa` category was removed in v12). */
export const LIGHTHOUSE_CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;

export type LighthouseCategory = (typeof LIGHTHOUSE_CATEGORIES)[number];

export type LighthouseFormFactor = "mobile" | "desktop";

/** Tool-facing throttling names; `none` maps to Lighthouse's `provided`. */
export type LighthouseThrottling = "simulate" | "devtools" | "none";

export type LighthouseThrottlingMethod = "simulate" | "devtools" | "provided";

export type LighthouseParamsErrorCode = "invalid url" | "invalid category" | "invalid maxWaitForLoadMs";

export class LighthouseParamsError extends Error {
  readonly code: LighthouseParamsErrorCode;

  constructor(code: LighthouseParamsErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "LighthouseParamsError";
  }
}

/** Raw tool parameters, before defaults and validation. */
export interface LighthouseParamsInput {
  url?: string;
  device?: LighthouseFormFactor;
  categories?: readonly string[];
  throttling?: LighthouseThrottling;
  maxWaitForLoadMs?: number;
}

/** Validated parameters with every default applied. */
export interface LighthouseParams {
  url: string;
  formFactor: LighthouseFormFactor;
  categories: LighthouseCategory[];
  throttlingMethod: LighthouseThrottlingMethod;
  maxWaitForLoadMs: number;
}

export const DEFAULT_MAX_WAIT_FOR_LOAD_MS = 45_000;
const MIN_MAX_WAIT_FOR_LOAD_MS = 5_000;
const MAX_MAX_WAIT_FOR_LOAD_MS = 120_000;

const THROTTLING_METHODS: Record<LighthouseThrottling, LighthouseThrottlingMethod> = {
  simulate: "simulate",
  devtools: "devtools",
  none: "provided",
};

/** Desktop simulated-throttling profile used by Lighthouse's desktop preset. */
const DESKTOP_SIMULATED_THROTTLING = { rttMs: 40, throughputKbps: 10 * 1024, cpuSlowdownMultiplier: 1 } as const;

/**
 * Validate and normalize tool parameters. Throws {@link LighthouseParamsError}
 * on the first violation; never silently repairs a bad value.
 */
export function normalizeLighthouseParams(input: LighthouseParamsInput): LighthouseParams {
  const url = validateUrl(input.url);
  const categories = validateCategories(input.categories);
  const maxWaitForLoadMs = validateMaxWaitForLoad(input.maxWaitForLoadMs);

  return {
    url,
    formFactor: input.device ?? "mobile",
    categories,
    throttlingMethod: THROTTLING_METHODS[input.throttling ?? "simulate"],
    maxWaitForLoadMs,
  };
}

/** Accept only absolute http(s) URLs — Lighthouse cannot audit anything else. */
export function validateUrl(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    throw new LighthouseParamsError("invalid url", "No URL to audit. Pass `url` or open a page with cdp_goto first.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new LighthouseParamsError("invalid url", `Not an absolute URL: ${trimmed}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new LighthouseParamsError(
      "invalid url",
      `Lighthouse can only audit http(s) URLs, got ${parsed.protocol} (${trimmed})`,
    );
  }
  return parsed.href;
}

function validateCategories(raw: readonly string[] | undefined): LighthouseCategory[] {
  if (raw === undefined) return [...LIGHTHOUSE_CATEGORIES];
  if (raw.length === 0) {
    throw new LighthouseParamsError("invalid category", "At least one category is required");
  }

  const valid = new Set<string>(LIGHTHOUSE_CATEGORIES);
  const unknown = raw.filter((category) => !valid.has(category));
  if (unknown.length > 0) {
    throw new LighthouseParamsError(
      "invalid category",
      `Unknown Lighthouse category: ${unknown.join(", ")} (valid: ${LIGHTHOUSE_CATEGORIES.join(", ")})`,
    );
  }

  // De-duplicate while preserving the caller's order.
  return [...new Set(raw)] as LighthouseCategory[];
}

function validateMaxWaitForLoad(raw: number | undefined): number {
  if (raw === undefined) return DEFAULT_MAX_WAIT_FOR_LOAD_MS;
  if (!Number.isFinite(raw) || raw < MIN_MAX_WAIT_FOR_LOAD_MS || raw > MAX_MAX_WAIT_FOR_LOAD_MS) {
    throw new LighthouseParamsError(
      "invalid maxWaitForLoadMs",
      `Invalid maxWaitForLoadMs: ${raw} (must be ${MIN_MAX_WAIT_FOR_LOAD_MS}-${MAX_MAX_WAIT_FOR_LOAD_MS})`,
    );
  }
  return Math.round(raw);
}

/**
 * Build the flags object handed to `lighthouse(url, flags)`.
 *
 * `port` makes Lighthouse attach to the already-running Chrome instead of
 * launching its own. `screenEmulation.disabled` is set for desktop so the real
 * viewport (e.g. from `cdp_viewport`) is kept, while mobile keeps Lighthouse's
 * own device emulation.
 */
export function buildLighthouseFlags(
  params: LighthouseParams,
  port: number,
  includeHtml: boolean,
): Record<string, unknown> {
  const desktop = params.formFactor === "desktop";

  return {
    port,
    hostname: "127.0.0.1",
    output: includeHtml ? ["json", "html"] : ["json"],
    logLevel: "error",
    quiet: true,
    onlyCategories: params.categories,
    formFactor: params.formFactor,
    screenEmulation: desktop ? { disabled: true } : undefined,
    throttlingMethod: params.throttlingMethod,
    throttling: desktop && params.throttlingMethod === "simulate" ? { ...DESKTOP_SIMULATED_THROTTLING } : undefined,
    maxWaitForLoad: params.maxWaitForLoadMs,
  };
}

/** Timestamp for report names: `2026-11-04T10-32-00` (filesystem- and sort-safe). */
export function reportTimestamp(now: Date): string {
  return now
    .toISOString()
    .replace(/\.\d{3}Z$/u, "")
    .replace(/[:]/gu, "-");
}

/**
 * Default report basename: `<timestamp>-<host+path slug>-<formFactor>`, e.g.
 * `2026-11-04T10-32-00-example-com-docs-mobile`. The timestamp leads so a
 * directory listing sorts chronologically.
 */
export function defaultReportBasename(url: string, formFactor: LighthouseFormFactor, now: Date): string {
  const parsed = new URL(url);
  const path = parsed.pathname === "/" ? "" : parsed.pathname;
  const raw = `${parsed.hostname}${path}`.toLowerCase();
  const slug =
    raw
      .replace(/^www\./u, "")
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 60)
      .replace(/-+$/u, "") || "report";

  return `${reportTimestamp(now)}-${slug}-${formFactor}`;
}

export interface LighthouseMetrics {
  firstContentfulPaint?: number;
  largestContentfulPaint?: number;
  totalBlockingTime?: number;
  cumulativeLayoutShift?: number;
  speedIndex?: number;
  timeToInteractive?: number;
}

export interface LighthouseSummary {
  lighthouseVersion?: string;
  finalDisplayedUrl?: string;
  fetchTime?: string;
  /** Round percentages (0-100) keyed by category id that was actually run. */
  scores: Partial<Record<string, number>>;
  metrics: LighthouseMetrics;
  /** Audits that scored below 1 and were actually run. */
  failedAuditCount?: number;
  runWarnings: string[];
}

const METRIC_AUDITS: Record<keyof LighthouseMetrics, string> = {
  firstContentfulPaint: "first-contentful-paint",
  largestContentfulPaint: "largest-contentful-paint",
  totalBlockingTime: "total-blocking-time",
  cumulativeLayoutShift: "cumulative-layout-shift",
  speedIndex: "speed-index",
  timeToInteractive: "interactive",
};

const INFORMATIVE_SCORE_MODES = new Set(["informative", "notApplicable", "manual"]);

/**
 * Extract the debrief-relevant subset of a Lighthouse result. Every field is
 * read defensively: an LHR from a different major version degrades to missing
 * fields instead of throwing, and the raw JSON on disk stays the contract.
 */
export function summarizeLhr(lhr: unknown): LighthouseSummary {
  const root = asRecord(lhr);
  const metrics: LighthouseMetrics = {};
  const audits = asRecord(root?.audits);

  for (const [key, auditId] of Object.entries(METRIC_AUDITS) as Array<[keyof LighthouseMetrics, string]>) {
    const value = asRecord(audits?.[auditId])?.numericValue;
    if (typeof value === "number" && Number.isFinite(value)) metrics[key] = value;
  }

  const scores: Partial<Record<string, number>> = {};
  const categories = asRecord(root?.categories);
  for (const [id, category] of Object.entries(categories ?? {})) {
    const score = asRecord(category)?.score;
    if (typeof score === "number" && Number.isFinite(score)) scores[id] = Math.round(score * 100);
  }

  const runWarnings = Array.isArray(root?.runWarnings)
    ? root.runWarnings.filter((warning): warning is string => typeof warning === "string")
    : [];

  return {
    lighthouseVersion: asString(root?.lighthouseVersion),
    finalDisplayedUrl: asString(root?.finalDisplayedUrl),
    fetchTime: asString(root?.fetchTime),
    scores,
    metrics,
    failedAuditCount: countFailedAudits(audits),
    runWarnings,
  };
}

function countFailedAudits(audits: Record<string, unknown> | undefined): number | undefined {
  if (!audits) return undefined;
  let failed = 0;
  for (const audit of Object.values(audits)) {
    const record = asRecord(audit);
    if (!record) continue;
    const mode = asString(record.scoreDisplayMode);
    if (mode && INFORMATIVE_SCORE_MODES.has(mode)) continue;
    if (typeof record.score === "number" && record.score < 1) failed += 1;
  }
  return failed;
}

/**
 * Compact multi-line summary for the tool's `content`. Bounded on purpose: the
 * full report lives on disk, so nothing here should grow with audit count.
 */
export function formatSummaryText(summary: LighthouseSummary, reportPath: string, formFactor: string): string {
  const lines: string[] = [];
  lines.push(`Lighthouse report written to ${reportPath}`);

  const meta = [
    summary.lighthouseVersion ? `Lighthouse ${summary.lighthouseVersion}` : undefined,
    formFactor,
    summary.fetchTime,
    summary.finalDisplayedUrl,
  ].filter(Boolean);
  if (meta.length > 0) lines.push(meta.join(" · "));

  const scoreEntries = Object.entries(summary.scores);
  if (scoreEntries.length > 0) {
    lines.push(`Scores: ${scoreEntries.map(([id, score]) => `${id} ${score}`).join(" · ")}`);
  }

  const metricEntries: Array<[string, string | undefined]> = [
    ["LCP", formatSeconds(summary.metrics.largestContentfulPaint)],
    ["CLS", formatCls(summary.metrics.cumulativeLayoutShift)],
    ["TBT", formatMilliseconds(summary.metrics.totalBlockingTime)],
    ["FCP", formatSeconds(summary.metrics.firstContentfulPaint)],
    ["SI", formatSeconds(summary.metrics.speedIndex)],
    ["TTI", formatSeconds(summary.metrics.timeToInteractive)],
  ];
  const present = metricEntries.filter((entry): entry is [string, string] => entry[1] !== undefined);
  if (present.length > 0) {
    lines.push(`Lab metrics: ${present.map(([label, value]) => `${label} ${value}`).join(" · ")}`);
  }

  if (summary.failedAuditCount !== undefined) {
    lines.push(`Audits scoring below 100: ${summary.failedAuditCount}`);
  }
  if (summary.runWarnings.length > 0) {
    lines.push(`Run warnings: ${summary.runWarnings.join("; ").slice(0, 500)}`);
  }

  return lines.slice(0, 10).join("\n");
}

function formatSeconds(ms: number | undefined): string | undefined {
  return ms === undefined ? undefined : `${(ms / 1000).toFixed(1)}s`;
}

function formatMilliseconds(ms: number | undefined): string | undefined {
  return ms === undefined ? undefined : `${Math.round(ms)}ms`;
}

function formatCls(value: number | undefined): string | undefined {
  return value === undefined ? undefined : value.toFixed(3);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
