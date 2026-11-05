/**
 * Outbound port: run a Lighthouse audit against a browser that is already
 * listening on a CDP port.
 *
 * The tool layer asks "audit this URL on this port and give me the report"
 * without caring how Lighthouse is obtained or invoked. The concrete
 * implementation lives in `adapters/pi/lighthouse-runner.ts`.
 */

import type { LighthouseParams } from "../domain/lighthouse-report.ts";

export interface LighthouseRequest {
  /** Validated parameters with defaults applied (from `normalizeLighthouseParams`). */
  params: LighthouseParams;
  /** CDP port of the already-running Chrome; Lighthouse attaches instead of launching. */
  port: number;
  includeHtml: boolean;
}

export interface LighthouseReport {
  /** Raw Lighthouse result object (the LHR) — the stable on-disk contract. */
  lhr: unknown;
  /** `JSON.stringify(lhr)`, i.e. exactly what `--output=json` writes. */
  reportJson: string;
  /** Rendered HTML report, only when `includeHtml` was requested. */
  reportHtml?: string;
}

export interface LighthouseRunner {
  run(request: LighthouseRequest): Promise<LighthouseReport>;
}
