/**
 * llm-tools — deterministic tools that remove mechanical decisions from the
 * model's plate. Each file registers one tool; this index is the entrypoint
 * loaded by Pi's extension loader.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerGitClassifyChanges } from "./git-classify.ts";
import { registerJSDocCandidates } from "./jsdoc-candidates.ts";
import { registerPRSkeleton } from "./pr-skeleton.ts";

export default function llmToolsExtension(pi: ExtensionAPI) {
  registerGitClassifyChanges(pi);
  registerJSDocCandidates(pi);
  registerPRSkeleton(pi);
}
