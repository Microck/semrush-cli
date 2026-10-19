import { expect, test } from 'vitest';
import { daemonBuildFlags, daemonCacheKey } from '../scripts/daemon-build-recipe.mjs';

test('daemon cache identity changes with the actual build recipe', () => {
  const current = daemonCacheKey('revision', 'patch');
  expect(current).not.toBe('semrush-cli-galleton-revision-patch');
  expect(current).not.toBe(daemonCacheKey('revision', 'patch', daemonBuildFlags.filter(flag => flag !== '-buildvcs=false')));
  expect(current).toBe(daemonCacheKey('revision', 'patch', [...daemonBuildFlags]));
  expect(daemonCacheKey('new-revision', 'patch')).not.toBe(current);
  expect(daemonCacheKey('revision', 'new-patch')).not.toBe(current);
});
