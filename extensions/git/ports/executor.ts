/**
 * Outbound port: subprocess execution.
 *
 * The domain asks "run this command and give me back stdout/stderr/exit
 * code" without caring whether the command runs through Pi's
 * `ExtensionAPI.exec`, a test fake, or something else entirely. The concrete
 * decision lives in `adapters/pi/executor.ts`; production and tests both
 * satisfy this contract.
 */

/** Result of a completed subprocess run. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  /** Exit code (0 on success). */
  code: number;
  /** True when the process was terminated rather than exiting normally. */
  killed?: boolean;
}

/** Options controlling a single subprocess run. */
export interface RunOptions {
  /** Working directory the command runs in. */
  cwd: string;
  /** Optional cancellation signal; aborts the command when fired. */
  signal?: AbortSignal;
  /** Optional timeout in milliseconds. */
  timeout?: number;
}

/**
 * Outbound port: run an external command without a shell.
 *
 * Implementations must pass `args` through verbatim (array form, no shell
 * string), preserving the callers' safety guarantees against injection.
 */
export interface Executor {
  run(command: string, args: string[], options: RunOptions): Promise<ExecResult>;
}
