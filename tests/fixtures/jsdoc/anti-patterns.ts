/** Bad doc block exercising all four anti-patterns.
 * @param a - the input
 * @returns void
 */
export function flagged(_a: string): void {}

/** @description Redundant description tag. */
export function described(): number {
  return 1;
}
