import { Context, Effect } from 'effect';
import type { ReportRequest } from './validation.js';
import type { ReportError, SessionError, UsageError } from './errors.js';

/** One serialized browser context per runtime. Report callers never handle cookies or pages. */
export class Semrush extends Context.Service<Semrush, {
  readonly report: (request: ReportRequest) => Effect.Effect<{ authenticated: true; report: string; data: unknown }, ReportError | SessionError | UsageError>;
}>()('semrush/Semrush') {}
