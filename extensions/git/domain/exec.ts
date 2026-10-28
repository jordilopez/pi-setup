/**
 * Subprocess-result policy, shared by the git domain's executor-flagged
 * helpers: run a command through the `Executor` port and turn a non-zero exit
 * into a labelled error.
 *
 * Pure with respect to pi — it only knows the `Executor` contract.
 */

import type { Executor, ExecResult } from "../ports/executor.ts";

/**
 * Runs a command and throws a descriptive error on a non-zero exit.
 *
 * `label` names the operation in the error so a failing git or `gh` call is
 * never reported as bare exit status.
 */
export async function execOk(
  executor: Executor,
  command: string,
  args: string[],
  cwd: string,
  signal: AbortSignal | undefined,
  label: string,
): Promise<ExecResult> {
  const result = await executor.run(command, args, { cwd, signal });
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
    throw new Error(`${label} failed: ${detail}`);
  }
  return result;
}
