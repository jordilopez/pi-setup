/**
 * Test double for the `Ui` outbound port.
 *
 * Records every interaction in `calls` and returns programmatic responses so
 * tests can drive the domain through confirmation gates, cancellation
 * (`undefined` from `select`/`input`), and notifications without a real TUI.
 */

import type { NotifyLevel, Ui } from "../../../extensions/git/ports/ui.ts";

export type UiCall =
  | { kind: "select"; title: string; options: string[] }
  | { kind: "confirm"; title: string; message: string }
  | { kind: "input"; title: string; placeholder?: string }
  | { kind: "notify"; message: string; type?: NotifyLevel };

export class FakeUi implements Ui {
  readonly calls: UiCall[] = [];

  /** Value returned by the next `select` (default `undefined` = cancelled). */
  selectResult: string | undefined = undefined;
  /** Value returned by the next `confirm`. */
  confirmResult = false;
  /** Value returned by the next `input` (default `undefined` = cancelled). */
  inputResult: string | undefined = undefined;

  async select(title: string, options: string[]): Promise<string | undefined> {
    this.calls.push({ kind: "select", title, options });
    return this.selectResult;
  }

  async confirm(title: string, message: string): Promise<boolean> {
    this.calls.push({ kind: "confirm", title, message });
    return this.confirmResult;
  }

  async input(title: string, placeholder?: string): Promise<string | undefined> {
    this.calls.push({ kind: "input", title, placeholder });
    return this.inputResult;
  }

  notify(message: string, type?: NotifyLevel): void {
    this.calls.push({ kind: "notify", message, type });
  }
}
