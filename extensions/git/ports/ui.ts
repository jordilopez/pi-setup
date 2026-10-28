/**
 * Outbound port: user interaction.
 *
 * The domain says "I need the user to choose / confirm / type / be told
 * something" without caring whether that renders through Pi's TUI, a test
 * recording, or a headless stub. The concrete decision lives in
 * `adapters/pi/ui.ts`.
 */

export type NotifyLevel = "info" | "warning" | "error";

export interface Ui {
  /** Show a selector. `undefined` means the prompt was cancelled. */
  select(title: string, options: string[]): Promise<string | undefined>;
  /** Show a confirmation dialog. */
  confirm(title: string, message: string): Promise<boolean>;
  /** Show a text input dialog. `undefined` means the prompt was cancelled. */
  input(title: string, placeholder?: string): Promise<string | undefined>;
  /** Surface a non-blocking notification to the user. */
  notify(message: string, type?: NotifyLevel): void;
}
