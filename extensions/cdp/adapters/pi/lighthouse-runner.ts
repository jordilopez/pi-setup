/**
 * Production adapter: `LighthouseRunner` over the `lighthouse` npm package.
 *
 * The module is imported dynamically (not statically) on purpose: the CDP
 * extension must keep loading for users who never call `cdp_lighthouse`, and a
 * missing optional install has to surface as an actionable tool error instead of
 * a startup crash.
 */

import { resolve } from "node:path";

import { buildLighthouseFlags } from "../../domain/lighthouse-report.ts";
import type { LighthouseReport, LighthouseRequest, LighthouseRunner } from "../../ports/lighthouse.ts";

/** Non-literal specifier keeps TypeScript from requiring Lighthouse's own types. */
const LIGHTHOUSE_SPECIFIER = "lighthouse";

/** Extra wall-clock headroom granted on top of Lighthouse's own load timeout. */
const HARD_TIMEOUT_PAD_MS = 90_000;

type LighthouseFn = (url: string, flags: Record<string, unknown>) => Promise<LighthouseResult>;

interface LighthouseResult {
  lhr?: unknown;
  report?: string | string[];
}

interface NodeLighthouseRunnerOptions {
  /** Test seam: replaces the dynamic import. */
  loadLighthouse?: () => Promise<LighthouseFn>;
}

export class NodeLighthouseRunner implements LighthouseRunner {
  readonly #loadLighthouse: () => Promise<LighthouseFn>;
  #lighthouse: Promise<LighthouseFn> | undefined;

  constructor(options: NodeLighthouseRunnerOptions = {}) {
    this.#loadLighthouse = options.loadLighthouse ?? loadInstalledLighthouse;
  }

  async run(request: LighthouseRequest): Promise<LighthouseReport> {
    const { params, port, includeHtml } = request;
    const lighthouse = await this.#resolveLighthouse();
    const flags = buildLighthouseFlags(params, port, includeHtml);

    const result = await this.#withHardTimeout(
      lighthouse(params.url, flags),
      params.maxWaitForLoadMs + HARD_TIMEOUT_PAD_MS,
      params.url,
    );

    if (result?.lhr === undefined) {
      throw new Error("Lighthouse returned no report (the audit may have been aborted)");
    }

    return {
      lhr: result.lhr,
      reportJson: JSON.stringify(result.lhr, null, 2),
      reportHtml: includeHtml ? extractHtml(result.report) : undefined,
    };
  }

  /** Load once, cache the resolved function; never cache a rejection. */
  async #resolveLighthouse(): Promise<LighthouseFn> {
    if (!this.#lighthouse) {
      this.#lighthouse = this.#loadLighthouse().catch((error: unknown) => {
        this.#lighthouse = undefined;
        if (isModuleNotFound(error)) throw new Error(unavailableRemedy());
        throw error;
      });
    }
    return this.#lighthouse;
  }

  /**
   * Race the audit against a hard cap. Lighthouse has no cancel API, so a
   * timeout only stops *us* waiting; the run may still finish inside it. The
   * next call is unaffected.
   */
  async #withHardTimeout(audit: Promise<LighthouseResult>, timeoutMs: number, url: string): Promise<LighthouseResult> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Lighthouse did not finish auditing ${url} within ${Math.round(timeoutMs / 1000)}s. ` +
              "The run may still complete inside Lighthouse; retry, or raise maxWaitForLoadMs for a slow page.",
          ),
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([audit, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/** Default loader: resolve the installed package and hand back its runnable export. */
async function loadInstalledLighthouse(): Promise<LighthouseFn> {
  const imported: unknown = await import(LIGHTHOUSE_SPECIFIER);
  const candidate = (imported as { default?: unknown }).default ?? imported;
  if (typeof candidate !== "function") {
    throw new Error("The installed `lighthouse` package does not expose a runnable function.");
  }
  return candidate as LighthouseFn;
}

/** Actionable install/fallback text for a missing Lighthouse module. */
function unavailableRemedy(): string {
  return (
    "Lighthouse is not installed. Run `npm install` in " +
    `${resolve(import.meta.dirname, "../../../..")} (the pi-setup package directory), ` +
    "or run Lighthouse manually: `npx lighthouse <url> --output json --port <cdp-port>`."
  );
}

function isModuleNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /cannot find (module|package) 'lighthouse'/iu.test(message);
}

/** Pick the HTML member out of Lighthouse's `report` field. */
function extractHtml(report: string | string[] | undefined): string | undefined {
  const entries = Array.isArray(report) ? report : report ? [report] : [];
  return entries.find((entry) => entry.trimStart().startsWith("<"));
}
