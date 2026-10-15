import type { ServerResponse } from 'node:http';
import { expect } from 'vitest';
import { Predicate, type Schema } from 'effect';

interface Keyword { Phrase: string; Database: string; ClusterID: number; }
interface TransferRPC { method: string; params: Record<string, Schema.Json>; }

/** Dedicated source/destination baskets make copy, move and duplicate handling observable over HTTP. */
export function makeTransferFixture() {
  const baskets = new Map<number, Keyword[]>([
    [1001, [{ Phrase: 'email marketing', Database: 'us', ClusterID: 1008 },
      { Phrase: 'python tutorial', Database: 'us', ClusterID: 1009 }, { Phrase: 'seo tools', Database: 'us', ClusterID: 1010 }]],
    [1002, []],
  ]);
  return (rpc: TransferRPC, response: ServerResponse): boolean => {
    const { method, params } = rpc;
    if (method === 'baskets.KeywordsGetByFilter' && (params.BasketID === 1001 || params.BasketID === 1002)) {
      response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { Keywords: baskets.get(params.BasketID) } })); return true;
    }
    if (!['baskets.CopyKeywordsByIDs', 'baskets.MoveKeywordsByIDs', 'baskets.CopyKeywordsByClusterIDs', 'baskets.MoveKeywordsByClusterIDs'].includes(method)) return false;
    expect(params.SourceShareID).toEqual({ BasketID: 1001, OwnerID: 123 });
    expect(params.TargetShareID).toEqual({ BasketID: 1002, OwnerID: 123 });
    expect(params).not.toHaveProperty('BasketID'); expect(params).not.toHaveProperty('OwnerID');
    const source = baskets.get(1001) ?? [];
    const selected = source.filter(keyword => Array.isArray(params.ClusterIDs) ? params.ClusterIDs.includes(keyword.ClusterID)
      : Array.isArray(params.KeywordIDs) && params.KeywordIDs.some(id => Predicate.isObject(id) && !Array.isArray(id) && id.Phrase === keyword.Phrase && id.Database === keyword.Database));
    const target = baskets.get(1002) ?? [];
    for (const keyword of selected) if (!target.some(existing => existing.Phrase === keyword.Phrase && existing.Database === keyword.Database)) target.push({ ...keyword, ClusterID: 0 });
    if (method.startsWith('baskets.Move')) baskets.set(1001, source.filter(keyword => !selected.includes(keyword)));
    baskets.set(1002, target);
    response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { BasketID: 1002, Name: 'transfer destination' } })); return true;
  };
}
