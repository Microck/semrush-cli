import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Config, Effect, Layer } from 'effect';
import { Galleton, GalletonError, type Credentials } from './vendor/galleton.js';
import { SessionError } from './errors.js';
import { Sessions } from './session-service.js';

export const origin = 'https://www.semrush.com';
export const defaultStateDirectory = join(homedir(), '.local', 'share', 'semrush-cli', 'galleton');

/** Raw SDK errors stop here; daemon and upstream payloads never reach diagnostics. */
const sdkError = (cause: unknown): SessionError => {
  if (cause instanceof GalletonError) {
    const recovery = cause.code === 'not_found' ? 'Run semrush-cli auth login or semrush-cli auth import --cdp-url URL.' : 'Run semrush-cli daemon start and semrush-cli auth status. Reimport if renewal or authentication failed.';
    return new SessionError({ message: `Galleton ${cause.code}. ${recovery}`, code: cause.code });
  }
  return new SessionError({ message: 'Galleton operation failed. Run semrush-cli doctor and check local configuration.' });
};

export const makeSessionsLayer = (credentialOrigin: string) => Layer.effect(Sessions, Effect.gen(function* () {
  const baseURL = yield* Config.String('SEMRUSH_GALLETON_URL').pipe(Config.withDefault('http://127.0.0.1:8768'));
  const tokenFile = yield* Config.String('SEMRUSH_GALLETON_TOKEN_FILE').pipe(Config.withDefault(join(defaultStateDirectory, 'api.token')));
  const id = yield* Config.String('SEMRUSH_SESSION').pipe(Config.withDefault('semrush-cli'));
  const token = yield* Effect.tryPromise({ try: () => readFile(tokenFile, 'utf8'), catch: () => new SessionError({ message: 'Galleton token unavailable. Run semrush-cli setup, or set SEMRUSH_GALLETON_TOKEN_FILE.' }) });
  const sdk = yield* Effect.try({ try: () => new Galleton({ baseURL, token, timeoutMs: 60000 }), catch: sdkError });
  const status = Effect.fn('Sessions.status')(() => Effect.tryPromise({ try: () => sdk.status(id), catch: sdkError }));
  return Sessions.of({
    status,
    headers: Effect.fn('Sessions.headers')(() => Effect.tryPromise({ try: () => sdk.headers(id, credentialOrigin + '/'), catch: sdkError })),
    save: Effect.fn('Sessions.save')(function* (credentials: Credentials) {
      // Replacements are explicit and revision-checked; missing profiles are created.
      const previous = yield* status().pipe(Effect.map(value => value.revision), Effect.catchTag('SessionError', error => error.code === 'not_found' ? Effect.succeed(undefined) : Effect.fail(error)));
      const input = { ...credentials };
      if (previous !== undefined) { input.replace = true; input.expected_revision = previous; }
      return yield* Effect.tryPromise({ try: () => sdk.connect(id, input), catch: sdkError });
    }),
    capture: Effect.fn('Sessions.capture')((cookies: string[]) => Effect.tryPromise({ try: async () => { await sdk.capture(id, credentialOrigin + '/', cookies); }, catch: sdkError })),
    forget: Effect.fn('Sessions.forget')(() => Effect.tryPromise({ try: () => sdk.forget(id), catch: sdkError })),
  });
}));

export const sessionsLive = makeSessionsLayer(origin);
