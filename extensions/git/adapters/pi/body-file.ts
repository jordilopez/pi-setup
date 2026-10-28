/**
 * Production adapter: writes the PR body to a `0600` file inside a private
 * temp directory and removes that directory on dispose.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BodyFileHandle, BodyFileStore } from "../../ports/body-file.ts";

export function TempBodyFileStore(): BodyFileStore {
  return {
    async write(body: string): Promise<BodyFileHandle> {
      const dir = await mkdtemp(join(tmpdir(), "pi-create-pr-"));
      const path = join(dir, "body.md");
      await writeFile(path, body, { mode: 0o600 });
      return {
        path,
        dispose: () => rm(dir, { recursive: true, force: true }),
      };
    },
  };
}
