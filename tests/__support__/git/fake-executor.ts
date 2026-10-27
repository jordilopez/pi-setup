/**
 * Test double for the `Executor` outbound port.
 *
 * Records every `run()` call in `calls` and returns programmatic results:
 * a per-command canned `ExecResult` (or `Error`) via `setCommand`, else a
 * default result via `setDefault`. An aborted `signal` — already aborted at
 * call time or fired mid-flight — rejects with an `AbortError`, mirroring
 * `ExtensionAPI.exec`'s cancellation behaviour.
 */

import type { ExecResult, Executor, RunOptions } from "../../../extensions/git/ports/executor.ts";

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

  private readonly byCommand = new Map<string, ExecResult | Error>();
  private defaultResult: ExecResult = DEFAULT_RESULT;

  /** Program a canned response for a specific command+args pair. */
  setCommand(command: string, args: string[], result: ExecResult | Error): this {
    this.byCommand.set(this.key(command, args), result);
    return this;
  }

  /** Program the fallback result for anything not covered by `setCommand`. */
  setDefault(result: ExecResult): this {
    this.defaultResult = result;
    return this;
  }

  async run(command: string, args: string[], options: RunOptions): Promise<ExecResult> {
    this.calls.push({ command, args, options });

    if (options.signal?.aborted) {
      throw abortError();
    }

    const outcome = this.byCommand.get(this.key(command, args)) ?? this.defaultResult;

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

  private key(command: string, args: string[]): string {
    return `${command} ${args.join("\u0000")}`;
  }
}
