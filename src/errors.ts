import { Schema } from 'effect';

/** Safe errors are the only error details exposed by CLI and MCP boundaries. */
export class SessionError extends Schema.TaggedError<SessionError>()('SessionError', { message: Schema.String, code: Schema.optional(Schema.String) }) {}
export class ReportError extends Schema.TaggedError<ReportError>()('ReportError', { message: Schema.String }) {}
export class UsageError extends Schema.TaggedError<UsageError>()('UsageError', { message: Schema.String }) {}
