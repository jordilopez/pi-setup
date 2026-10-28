import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { Executor } from "../../ports/executor.ts";

/**
 * Production adapter: satisfies the `Executor` outbound port by delegating to
 * Pi's `ExtensionAPI.exec`. This is the only file in the git extension that
 * may import `ExtensionAPI` in the direction of the domain.
 */
export function PiExecutor(pi: ExtensionAPI): Executor {
  return {
    run(command, args, options) {
      return pi.exec(command, args, options);
    },
  };
}
