/**
 * Test double for the `BodyFileStore` outbound port.
 *
 * Records each written body, returns a stable synthetic path, and tracks
 * disposal so tests can assert the temp file is always cleaned up.
 */

import type { BodyFileHandle, BodyFileStore } from "../../ports/body-file.ts";

export class FakeBodyFileStore implements BodyFileStore {
  readonly written: string[] = [];
  readonly disposed: string[] = [];
  private counter = 0;

  async write(body: string): Promise<BodyFileHandle> {
    const path = `/tmp/pi-create-pr-${++this.counter}/body.md`;
    this.written.push(body);
    return {
      path,
      dispose: async () => {
        this.disposed.push(path);
      },
    };
  }
}
