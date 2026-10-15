import { Ajv } from 'ajv';
import { Effect, Predicate } from 'effect';
import { reports, type Query, type ReportName } from './report-parameters.js';
import { UsageError } from './errors.js';

const ajv = new Ajv({ useDefaults: true, allErrors: true, strict: false });
const validators = new Map(Object.entries(reports).map(([name, report]) => [name, ajv.compile<Query>(report.schema)]));
export function isReportName(name: string): name is ReportName { return Object.hasOwn(reports, name); }

/** Validate once at the public boundary, populate schema defaults, reject unknown keys. */
export const parseReport = Effect.fn('Reports.parse')(function* (name: string, input: Query) {
  if (!isReportName(name)) return yield* Effect.fail(new UsageError({ message: `Unknown report: ${name}. Run semrush reports.` }));
  const validate = validators.get(name);
  const query = structuredClone(input);
  if (!validate || !validate(query)) return yield* Effect.fail(new UsageError({ message: `Invalid ${name} input: ${ajv.errorsText(validate?.errors)}. Run semrush ${name.replaceAll('_', '-')} --help.` }));
  if ((name === 'saved_keywords_move' || name === 'saved_keywords_copy') && query.list_id === query.target_list_id) {
    return yield* Effect.fail(new UsageError({ message: 'Source and destination Saved Keywords collections must be different.' }));
  }
  const definition = reports[name];
  if (definition.transport === 'kwm' && 'target_basket_id' in query && query.basket_id === query.target_basket_id) return yield* Effect.fail(new UsageError({ message: 'Source and destination Keyword Strategy Builder baskets must be different.' }));
  if (definition.transport === 'ksb' && 'volume_min' in query) {
    const bounds = [['volume_min', 'volume_max'], ['difficulty_min', 'difficulty_max']] satisfies [string, string][];
    for (const [lower, upper] of bounds) {
      const minimum = query[lower]; const maximum = query[upper];
      if (Predicate.isNumber(minimum) && Predicate.isNumber(maximum) && minimum > maximum) return yield* Effect.fail(new UsageError({ message: `${lower} must not exceed ${upper}.` }));
    }
  }
  if (definition.mutation && query.confirm !== true && query.dry_run !== true) return yield* Effect.fail(new UsageError({ message: `${name} changes your Semrush account. Use --confirm (MCP confirm:true) to send it, or --dry-run to inspect the request.` }));
  return { name, definition, query };
});

export type ReportRequest = Effect.Success<ReturnType<typeof parseReport>>;
