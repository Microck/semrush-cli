import { createHash } from 'node:crypto';

export const daemonBuildFlags = Object.freeze(['-trimpath', '-buildvcs=false', '-ldflags=-s -w']);

export function daemonCacheKey(revision, patchHash, flags = daemonBuildFlags) {
  const recipeHash = createHash('sha256').update(JSON.stringify(flags)).digest('hex').slice(0, 12);
  return `semrush-cli-galleton-${revision}-${patchHash}-${recipeHash}`;
}
