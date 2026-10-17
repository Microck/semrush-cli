import type { IncomingMessage, ServerResponse } from 'node:http';
import { text } from 'node:stream/consumers';
import { Schema } from 'effect';
import { expect } from 'vitest';

type Scenario = 'complete' | 'empty' | 'denied' | 'totals-failed';
const rpcSchema = Schema.Struct({ method: Schema.String, params: Schema.Struct({ apiKey: Schema.String, userId: Schema.Number, request_id: Schema.String, report: Schema.String, args: Schema.JsonObject }) });
const positions = [
  { change: 'new', keyword: 'fixture new', position: 2, previousPosition: 0, positionIsSERPFeature: 0, traffic: 40 },
  { change: 'improved', keyword: 'fixture feature', position: 1, previousPosition: 3, positionIsSERPFeature: 1, traffic: 30 },
  { change: 'declined', keyword: 'fixture declined', position: 8, previousPosition: 5, positionIsSERPFeature: 0, traffic: 20 },
  { change: 'lost', keyword: 'fixture lost', position: 0, previousPosition: 7, positionIsSERPFeature: 0, traffic: 0 },
];

/** Real DPA HTTP boundary with independent row, count and trend selections. */
export function makeOrganicResearchFixture() {
  let scenario: Scenario = 'complete';
  const observed: { method: string; args: Schema.JsonObject }[] = [];
  return {
    observed,
    use(next: Scenario = 'complete') { scenario = next; observed.length = 0; },
    async serve(request: IncomingMessage, response: ServerResponse) {
      const rpc = Schema.decodeUnknownSync(rpcSchema)(JSON.parse(await text(request)));
      expect(request.method).toBe('POST');
      expect(request.headers.cookie).toContain('session=authorized');
      expect(rpc.params.apiKey).toBe('fixture-secret');
      expect(rpc.params.userId).toBe(123);
      expect(rpc.params.request_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(rpc.params.report).toBe(rpc.method.startsWith('organic.Positions') ? 'organic.positions' : 'organic.changes');
      const args = rpc.params.args;
      expect(args.searchItem).toBe('fixture.example');
      expect(args.searchType).toBe('domain');
      expect(args).not.toHaveProperty('confirm');
      expect(args).not.toHaveProperty('date_range');
      observed.push({ method: rpc.method, args });
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Set-Cookie', 'organic_rotation=retained; Path=/; HttpOnly; SameSite=Lax');
      const error = (code: number) => response.end(JSON.stringify({ error: { code, message: 'fixture-secret native report unavailable' } }));
      const reply = (result: Schema.Json) => response.end(JSON.stringify({ id: 1, jsonrpc: '2.0', result }));
      if (scenario === 'denied') { error(-32099); return; }
      if (scenario === 'totals-failed' && rpc.method.endsWith('TotalV2')) { error(-32098); return; }
      const empty = scenario === 'empty';
      if (rpc.method.endsWith('ChangesTrendV2')) {
        expect(Object.keys(args).sort()).toEqual(['database', 'searchItem', 'searchType']);
        reply(empty ? [] : [{ date: rpc.method.includes('Monthly') ? '202609' : '20261016', positionsDropping: 0, positionsTrending: 2, traffic: 0, native_extra: false }]); return;
      }
      if (rpc.method === 'organic.PositionChangesPresetsTotalV2') {
        expect(Object.keys(args).sort()).toEqual(['database', 'dateRange', 'dateType', 'searchItem', 'searchType']);
        reply({ positionsDropping: empty ? 0 : 2, positionsSerpChanges: empty ? 0 : 1, positionsTotal: empty ? 0 : 4, positionsTrending: empty ? 0 : 2, native_extra: false }); return;
      }
      const changes = rpc.method.startsWith('organic.PositionChanges');
      let selected = empty ? [] : positions.filter(row => changes || row.position > 0);
      if (args.positionsType === 'organic') selected = selected.filter(row => !row.positionIsSERPFeature);
      if (args.positionsType === 'serpFeatures') selected = selected.filter(row => row.positionIsSERPFeature);
      if (changes && args.changesTypes !== null) {
        const types = Schema.decodeUnknownSync(Schema.Array(Schema.String))(args.changesTypes);
        selected = selected.filter(row => types.includes(row.change));
      }
      if (rpc.method === 'organic.PositionChangesTotalV2') {
        expect(args).not.toHaveProperty('display'); reply(selected.length); return;
      }
      if (rpc.method === 'organic.PositionsTotal') { reply(selected.length); return; }
      expect(['organic.Positions', 'organic.PositionChangesV2']).toContain(rpc.method);
      const display = Schema.decodeUnknownSync(Schema.Struct({ page: Schema.Int, pageSize: Schema.Int }))(args.display);
      reply(selected.slice((display.page - 1) * display.pageSize, display.page * display.pageSize).map(({ change: _change, ...row }) => ({ ...row, urlHash: '9223372036854775807', native_extra: false })));
    },
  };
}
