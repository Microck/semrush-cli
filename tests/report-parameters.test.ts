import { Schema } from 'effect';
import { expect, test } from 'vitest';
import cases from './reference-cases.json' with { type: 'json' };
import { isReportName } from '../src/validation.js';
import { reportParameters, reports } from '../src/report-parameters.js';
for (const sample of cases) {
  test(`matches Python reference: ${sample.name}`, () => {
    if (!isReportName(sample.name)) throw new Error('Unknown reference report');
    expect(reportParameters(reports[sample.name], Schema.decodeUnknownSync(Schema.JsonObject)(sample.query))).toEqual(sample.params);
  });
}
