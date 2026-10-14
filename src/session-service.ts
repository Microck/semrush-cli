import { Context, Effect } from 'effect';
import type { Credentials, SessionStatus } from './vendor/galleton.js';
import type { SessionError } from './errors.js';

/** Galleton owns all durable credentials. Consumers only receive scoped headers. */
export class Sessions extends Context.Service<Sessions, {
  readonly headers: () => Effect.Effect<Record<string, string>, SessionError>;
  readonly status: () => Effect.Effect<SessionStatus, SessionError>;
  readonly save: (credentials: Credentials) => Effect.Effect<SessionStatus, SessionError>;
  readonly capture: (cookies: string[]) => Effect.Effect<void, SessionError>;
  readonly forget: () => Effect.Effect<void, SessionError>;
}>()('semrush/Sessions') {}
