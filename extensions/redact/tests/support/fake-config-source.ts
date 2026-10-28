/**
 * Test double for the `ConfigSource` outbound port.
 *
 * Returns a programmable `ConfigRead` on every `read()`, recording each read
 * so tests can assert how many times the loader consulted the source.
 */

import type { ConfigRead, ConfigSource } from "../../ports/config-source.ts";

export class FakeConfigSource implements ConfigSource {
  readonly reads: ConfigRead[] = [];
  private next: ConfigRead = { status: "missing" };

  setNext(read: ConfigRead): this {
    this.next = read;
    return this;
  }

  read(): ConfigRead {
    this.reads.push(this.next);
    return this.next;
  }
}
