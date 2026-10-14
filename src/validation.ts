import { Ajv } from 'ajv';
import { Effect } from 'effect';
import { reports, type Query, type ReportName } from './report-parameters.js';
import { UsageError } from './errors.js';

const ajv = new Ajv({ useDefaults: true, allErrors: true, strict: false });
const validators = new Map(Object.entries(reports).map(([name, report]) => [name, ajv.compile<Query>(report.schema)]));
export function isReportName(name: string): name is ReportName { return Object.hasOwn(reports, name); }

/** Validate once at the public boundary, populate schema defaults, reject unknown keys. */
export const parseReport = Effect.fn('Reports.parse')(function* (name: string, input: Query) {
  if (!isReportName(name)) return yield* Effect.fail(new UsageError({ message: `Unknown report: ${name}. Run semrush-cli reports.` }));
  const validate = validators.get(name);
  const query = structuredClone(input);
  if (!validate || !validate(query)) return yield* Effect.fail(new UsageError({ message: `Invalid ${name} input: ${ajv.errorsText(validate?.errors)}. Run semrush-cli ${name.replaceAll('_', '-')} --help.` }));
  const definition = reports[name];
  if (definition.mutation && query.confirm !== true && query.dry_run !== true) return yield* Effect.fail(new UsageError({ message: `${name} changes your Semrush account. Use --confirm (MCP confirm:true) to send it, or --dry-run to inspect the request.` }));
  return { name, definition, query };
});

export type ReportRequest = Effect.Success<ReturnType<typeof parseReport>>;
