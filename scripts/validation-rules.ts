/** Shared, dependency-free validation rules for agent resources and workflows. */

export const repositorySkillPathPattern = /(?:^|[\s"'({[]|[\\/])(?:[./\\]*[\\/])?skills[\\/][a-z0-9][a-z0-9/-]*/i;

const skillReferencePattern = /\/skill:([a-z0-9-]+)/g;
const artifactBlockPattern = /^```text:path=([^\n]+)\n([\s\S]*?)^```$/gm;

/** Return whether text contains a repository-relative skill path. */
export function hasRepositorySkillPath(text: string): boolean {
  return repositorySkillPathPattern.test(text);
}

/** Return the skill names referenced through `/skill:<name>`. */
export function skillReferences(text: string): string[] {
  return [...text.matchAll(skillReferencePattern)].map((match) => match[1]);
}

/** Extract labeled artifact blocks from workflow or agent output. */
export function artifactBlocks(text: string): Array<{ path: string; content: string }> {
  return [...text.matchAll(artifactBlockPattern)].map((match) => ({
    path: match[1],
    content: match[2],
  }));
}
