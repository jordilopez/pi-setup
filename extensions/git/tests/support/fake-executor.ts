/**
 * Test double for the `Executor` outbound port.
 *
 * Records every `run()` call in `calls` and returns programmatic results: a
 * dynamic handler via `setHandler`, else a default result via `setDefault`. An
 * aborted `signal` — already aborted at call time or fired mid-flight — rejects
 * with an `AbortError`, mirroring `ExtensionAPI.exec`'s cancellation behaviour.
 */

import type { ExecResult, Executor, RunOptions } from "../../ports/executor.ts";

export interface RecordedCall {
  command: string;
  args: string[];
  options: RunOptions;
}

function abortError(): Error {
  const err = new Error("aborted") as Error & { name: string };
  err.name = "AbortError";
  return err;
}

const DEFAULT_RESULT: ExecResult = { stdout: "", stderr: "", code: 0, killed: false };

export class FakeExecutor implements Executor {
  readonly calls: RecordedCall[] = [];

  private defaultResult: ExecResult = DEFAULT_RESULT;
  private handler?: (command: string, args: string[], options: RunOptions) => ExecResult | Error;

  /**
   * Program a dynamic response function. It takes precedence over `setDefault`,
   * and is how tests mimic commands whose response depends on the arguments
   * (e.g. `git check-ref-format <ref>`).
   */
  setHandler(handler: (command: string, args: string[], options: RunOptions) => ExecResult | Error): this {
    this.handler = handler;
    return this;
  }

  /** Program the fallback result for anything not covered by the handler. */
  setDefault(result: ExecResult): this {
    this.defaultResult = result;
    return this;
  }

  async run(command: string, args: string[], options: RunOptions): Promise<ExecResult> {
    this.calls.push({ command, args, options });

    if (options.signal?.aborted) {
      throw abortError();
    }

    const outcome = this.handler?.(command, args, options) ?? this.defaultResult;

    return new Promise<ExecResult>((resolve, reject) => {
      const onAbort = () => reject(abortError());
      options.signal?.addEventListener("abort", onAbort, { once: true });

      queueMicrotask(() => {
        options.signal?.removeEventListener("abort", onAbort);
        if (outcome instanceof Error) {
          reject(outcome);
        } else {
          resolve(outcome);
        }
      });
    });
  }
}
