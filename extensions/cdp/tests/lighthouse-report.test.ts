/**
 * Tests for the Lighthouse report domain: parameter validation, flag mapping,
 * report naming, and LHR summarization.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildLighthouseFlags,
  DEFAULT_MAX_WAIT_FOR_LOAD_MS,
  defaultReportBasename,
  formatSummaryText,
  LIGHTHOUSE_CATEGORIES,
  LighthouseParamsError,
  normalizeLighthouseParams,
  reportTimestamp,
  summarizeLhr,
} from "../domain/lighthouse-report.ts";

function paramsErrorCode(run: () => unknown): string {
  try {
    run();
    return "(no error)";
  } catch (error) {
    return error instanceof LighthouseParamsError ? error.code : `unexpected: ${String(error)}`;
  }
}

/** Minimal LHR fixture shaped like real Lighthouse output. */
function fixtureLhr(): Record<string, unknown> {
  return {
    lighthouseVersion: "13.6.0",
    finalDisplayedUrl: "https://example.com/",
    fetchTime: "2026-11-04T10:32:00.000Z",
    runWarnings: ["The page loaded too slowly to finish within the time limit."],
    categories: {
      performance: { id: "performance", score: 0.62 },
      accessibility: { id: "accessibility", score: 1 },
      seo: { id: "seo", score: null },
    },
    audits: {
      "first-contentful-paint": { score: 0.9, numericValue: 1800, scoreDisplayMode: "numeric" },
      "largest-contentful-paint": { score: 0.4, numericValue: 3400, scoreDisplayMode: "numeric" },
      "total-blocking-time": { score: 0.5, numericValue: 310.4, scoreDisplayMode: "numeric" },
      "cumulative-layout-shift": { score: 1, numericValue: 0.0213, scoreDisplayMode: "numeric" },
      "speed-index": { score: 0.8, numericValue: 2900, scoreDisplayMode: "numeric" },
      interactive: { score: 0.7, numericValue: 3800, scoreDisplayMode: "numeric" },
      "is-on-https": { score: 0, scoreDisplayMode: "binary" },
      "uses-http2": { score: 1, scoreDisplayMode: "binary" },
      "unused-javascript": { score: 0, scoreDisplayMode: "informative" },
      "manual-check": { score: null, scoreDisplayMode: "manual" },
      "not-applicable": { score: null, scoreDisplayMode: "notApplicable" },
    },
  };
}

describe("normalizeLighthouseParams", () => {
  it("applies mobile + all categories + simulate + default load timeout", () => {
    const params = normalizeLighthouseParams({ url: "https://example.com" });
    assert.equal(params.url, "https://example.com/");
    assert.equal(params.formFactor, "mobile");
    assert.deepEqual(params.categories, [...LIGHTHOUSE_CATEGORIES]);
    assert.equal(params.throttlingMethod, "simulate");
    assert.equal(params.maxWaitForLoadMs, DEFAULT_MAX_WAIT_FOR_LOAD_MS);
  });

  it("maps throttling `none` to Lighthouse's `provided`", () => {
    assert.equal(normalizeLighthouseParams({ url: "https://a.test", throttling: "none" }).throttlingMethod, "provided");
    assert.equal(
      normalizeLighthouseParams({ url: "https://a.test", throttling: "devtools" }).throttlingMethod,
      "devtools",
    );
  });

  it("deduplicates categories while preserving caller order", () => {
    const params = normalizeLighthouseParams({
      url: "https://a.test",
      categories: ["seo", "performance", "seo"],
    });
    assert.deepEqual(params.categories, ["seo", "performance"]);
  });

  it("rejects a missing, relative, or non-http URL", () => {
    assert.equal(
      paramsErrorCode(() => normalizeLighthouseParams({})),
      "invalid url",
    );
    assert.equal(
      paramsErrorCode(() => normalizeLighthouseParams({ url: "   " })),
      "invalid url",
    );
    assert.equal(
      paramsErrorCode(() => normalizeLighthouseParams({ url: "/relative" })),
      "invalid url",
    );
    assert.equal(
      paramsErrorCode(() => normalizeLighthouseParams({ url: "ftp://a.test" })),
      "invalid url",
    );
  });

  it("rejects unknown categories, including the removed pwa category", () => {
    assert.equal(
      paramsErrorCode(() => normalizeLighthouseParams({ url: "https://a.test", categories: ["pwa"] })),
      "invalid category",
    );
    assert.equal(
      paramsErrorCode(() => normalizeLighthouseParams({ url: "https://a.test", categories: [] })),
      "invalid category",
    );
  });

  it("names the valid categories in the failure message", () => {
    assert.throws(
      () => normalizeLighthouseParams({ url: "https://a.test", categories: ["nope"] }),
      /valid: performance, accessibility, best-practices, seo/u,
    );
  });

  it("bounds maxWaitForLoadMs", () => {
    assert.equal(
      paramsErrorCode(() => normalizeLighthouseParams({ url: "https://a.test", maxWaitForLoadMs: 4_999 })),
      "invalid maxWaitForLoadMs",
    );
    assert.equal(
      paramsErrorCode(() => normalizeLighthouseParams({ url: "https://a.test", maxWaitForLoadMs: 120_001 })),
      "invalid maxWaitForLoadMs",
    );
    assert.equal(
      paramsErrorCode(() => normalizeLighthouseParams({ url: "https://a.test", maxWaitForLoadMs: Number.NaN })),
      "invalid maxWaitForLoadMs",
    );
    assert.equal(
      normalizeLighthouseParams({ url: "https://a.test", maxWaitForLoadMs: 30_000 }).maxWaitForLoadMs,
      30_000,
    );
  });
});

describe("buildLighthouseFlags", () => {
  it("attaches to the given port and asks for JSON only by default", () => {
    const flags = buildLighthouseFlags(normalizeLighthouseParams({ url: "https://a.test" }), 9333, false);
    assert.equal(flags.port, 9333);
    assert.equal(flags.hostname, "127.0.0.1");
    assert.deepEqual(flags.output, ["json"]);
    assert.deepEqual(flags.onlyCategories, [...LIGHTHOUSE_CATEGORIES]);
    assert.equal(flags.formFactor, "mobile");
    assert.equal(flags.maxWaitForLoad, DEFAULT_MAX_WAIT_FOR_LOAD_MS);
  });

  it("adds html output when requested", () => {
    const flags = buildLighthouseFlags(normalizeLighthouseParams({ url: "https://a.test" }), 9222, true);
    assert.deepEqual(flags.output, ["json", "html"]);
  });

  it("keeps the real viewport and applies the desktop throttling profile", () => {
    const mobileFlags = buildLighthouseFlags(normalizeLighthouseParams({ url: "https://a.test" }), 9222, false);
    assert.equal(mobileFlags.screenEmulation, undefined);
    assert.equal(mobileFlags.throttling, undefined);

    const desktopFlags = buildLighthouseFlags(
      normalizeLighthouseParams({ url: "https://a.test", device: "desktop" }),
      9222,
      false,
    );
    assert.deepEqual(desktopFlags.screenEmulation, { disabled: true });
    assert.deepEqual(desktopFlags.throttling, { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 });
  });

  it("does not inject desktop throttling when throttling is provided or devtools", () => {
    const flags = buildLighthouseFlags(
      normalizeLighthouseParams({ url: "https://a.test", device: "desktop", throttling: "none" }),
      9222,
      false,
    );
    assert.equal(flags.throttling, undefined);
    assert.equal(flags.throttlingMethod, "provided");
  });
});

describe("defaultReportBasename", () => {
  const now = new Date("2026-11-04T10:32:00.000Z");

  it("puts a filesystem-safe timestamp first", () => {
    assert.equal(reportTimestamp(now), "2026-11-04T10-32-00");
  });

  it("slugifies hostname and path and appends the form factor", () => {
    assert.equal(
      defaultReportBasename("https://example.com/", "mobile", now),
      "2026-11-04T10-32-00-example-com-mobile",
    );
    assert.equal(
      defaultReportBasename("https://www.example.com/docs/getting-started/?q=1", "desktop", now),
      "2026-11-04T10-32-00-example-com-docs-getting-started-desktop",
    );
  });

  it("caps the slug length and never ends it with a dash", () => {
    const longPath = `/${"segment/".repeat(20)}`;
    const name = defaultReportBasename(`https://example.com${longPath}`, "mobile", now);
    const slug = name.replace(/^2026-11-04T10-32-00-/u, "").replace(/-mobile$/u, "");
    assert.ok(slug.length <= 60, `slug too long: ${slug.length}`);
    assert.ok(!slug.endsWith("-"), `slug ends with dash: ${slug}`);
  });
});

describe("summarizeLhr", () => {
  it("extracts scores, lab metrics, warnings, and failed audits", () => {
    const summary = summarizeLhr(fixtureLhr());
    assert.equal(summary.lighthouseVersion, "13.6.0");
    assert.equal(summary.finalDisplayedUrl, "https://example.com/");
    assert.deepEqual(summary.scores, { performance: 62, accessibility: 100 });
    assert.deepEqual(summary.metrics, {
      firstContentfulPaint: 1800,
      largestContentfulPaint: 3400,
      totalBlockingTime: 310.4,
      cumulativeLayoutShift: 0.0213,
      speedIndex: 2900,
      timeToInteractive: 3800,
    });
    assert.deepEqual(summary.runWarnings, ["The page loaded too slowly to finish within the time limit."]);
    // Failing, scored audits: fcp, lcp, tbt, speed-index, interactive, is-on-https.
    // `informative`, `manual`, and `notApplicable` are excluded.
    assert.equal(summary.failedAuditCount, 6);
  });

  it("degrades to missing fields instead of throwing on schema drift", () => {
    for (const value of [undefined, null, "not an lhr", 42]) {
      const summary = summarizeLhr(value);
      assert.deepEqual(summary.scores, {});
      assert.deepEqual(summary.metrics, {});
      assert.deepEqual(summary.runWarnings, []);
    }
  });

  it("ignores non-numeric metrics and non-string warnings", () => {
    const lhr = fixtureLhr();
    (lhr.audits as Record<string, unknown>)["largest-contentful-paint"] = { numericValue: "3400" };
    lhr.runWarnings = [1, "kept", null];
    const summary = summarizeLhr(lhr);
    assert.equal(summary.metrics.largestContentfulPaint, undefined);
    assert.deepEqual(summary.runWarnings, ["kept"]);
  });
});

describe("formatSummaryText", () => {
  it("leads with the report path and stays within the line budget", () => {
    const text = formatSummaryText(summarizeLhr(fixtureLhr()), ".lighthouse/report.json", "mobile");
    const lines = text.split("\n");
    assert.equal(lines[0], "Lighthouse report written to .lighthouse/report.json");
    assert.ok(lines.length <= 10, `too many lines: ${lines.length}`);
    assert.match(text, /Scores: performance 62 · accessibility 100/u);
    assert.match(text, /Lab metrics: LCP 3\.4s · CLS 0\.021 · TBT 310ms/u);
    assert.match(text, /Audits scoring below 100: 6/u);
  });

  it("omits sections it has no data for", () => {
    const text = formatSummaryText(summarizeLhr(undefined), "report.json", "desktop");
    assert.equal(text.split("\n")[0], "Lighthouse report written to report.json");
    assert.match(text, /desktop/u);
    assert.doesNotMatch(text, /Lab metrics/u);
    assert.doesNotMatch(text, /Run warnings/u);
  });
});
