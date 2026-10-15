import type { IncomingMessage, ServerResponse } from 'node:http';
import { expect } from 'vitest';
import { Schema } from 'effect';

interface SeedRPC { method: string; params: Record<string, Schema.Json>; }

/** Stateful HTTP provider for seed-based pages; existing basket lifecycle stays in its own fixture. */
export function makeSeedFixture() {
  let clusters = [{ ID: 1008, Name: 'Email marketing', IsFavorite: false, Volume: 5000, KeywordsCount: 2, UpdatedAt: 'before' },
    { ID: 1009, Name: 'Email tools', IsFavorite: false, Volume: 1000, KeywordsCount: 1, UpdatedAt: 'before' }];
  return async (request: IncomingMessage, response: ServerResponse, url: URL, rpc?: SeedRPC): Promise<boolean> => {
    if (url.pathname === '/kwm/download-export-v2') {
      expect(request.method).toBe('GET'); expect(request.headers.cookie).toContain('session=authorized');
      expect(url.searchParams.get('userId')).toBe('123'); expect(url.searchParams.get('apiKey')).toBe('fixture-secret');
      expect(url.searchParams.get('exportId')).toBe('fixture-export&encoded=yes'); expect([...url.searchParams.keys()]).toHaveLength(3);
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', 'attachment; filename=seed-keywords.csv');
      response.end('Keyword,Volume\nemail marketing,5000\n'); return true;
    }
    if (!rpc) return false;
    const { method, params } = rpc;
    let result: Schema.Json;
    switch (method) {
      case 'baskets.BasketGetPagePresetCounts': result = [{ Preset: 1, Count: clusters.length }]; break;
      case 'baskets.BasketGetPages': {
        expect(params.Preset).toBe(1); expect(params.Order).toEqual([{ Direction: 1, Field: 'metrics_score_v2' }]);
        const filter = params.Filter;
        expect(filter).toMatchObject({ Phrase: [], TopicName: [], Volume: [], Difficulty: [], Intents: [], Includes: [] });
        const favorites = Schema.decodeUnknownSync(Schema.Struct({ IsFavorite: Schema.Struct({ Value: Schema.Boolean }) }))(filter).IsFavorite.Value;
        result = { Pages: clusters.filter(cluster => !favorites || cluster.IsFavorite), Topics: [], TotalPagesCount: clusters.length }; break;
      }
      case 'baskets.BasketGetClusters':
        expect(params.ParentID).toBeNull(); expect(params.Page).toEqual({ Number: 1, Size: 20 });
        expect(params.Order).toEqual([{ Direction: 1, Field: 'kdv' }]); result = clusters; break;
      case 'baskets.BasketGetClustersByIDs': case 'baskets.BasketGetClustersUpdated':
        expect(params.ClusterIDs).toEqual([1008]); result = clusters.filter(cluster => cluster.ID === 1008); break;
      case 'baskets.BasketGetClusterKeywords':
        expect(params.ClusterID).toBe(1008); expect(params.Page).toEqual({ Number: 1, Size: 100 });
        expect(params.Order).toEqual({ Direction: 1, Field: 'difficulty' }); result = [{ Phrase: 'email marketing', Database: 'us', Volume: 5000 }]; break;
      case 'baskets.GetPage': expect(params.ID).toBe(1008); result = { ID: 1008, PrimaryIntents: [1], SERPFeatures: [21], Refs: ['https://example.com/email'] }; break;
      case 'baskets.SetFavoritePage': case 'baskets.ResetFavoritePage':
        expect(params.ID).toBe(1008); clusters = clusters.map(cluster => cluster.ID === 1008 ? { ...cluster, IsFavorite: method === 'baskets.SetFavoritePage' } : cluster); result = null; break;
      case 'baskets.KeywordsRequestUpdateByClusterIDs':
        expect(params.ClusterIDs).toEqual([1008]); clusters = clusters.map(cluster => cluster.ID === 1008 ? { ...cluster, UpdatedAt: 'after' } : cluster);
        result = { limit: 1000, usage: 2 }; break;
      case 'baskets.BasketDeleteClusters':
        expect(params.ClusterIDs).toEqual([1009]); clusters = clusters.filter(cluster => cluster.ID !== 1009); result = null; break;
      case 'export_v2.ExportKeywordsByFilter':
        expect(params.Filter).toMatchObject({ ClusterIDs: [], Databases: [], Phrase: [], Tags: [], Intents: [] }); result = { ExportID: 'fixture-export&encoded=yes' }; break;
      case 'export_v2.ExportKeywordsByIDs':
        expect(params.KeywordIDs).toEqual([{ Phrase: 'email marketing', Database: 'us' }]); result = { ExportID: 'fixture-export&encoded=yes' }; break;
      case 'export_v2.ExportKeywordsByClusters':
        expect(params.Filter).toMatchObject({ Phrase: [], TopicName: [], IsFavorite: { Value: false } }); result = { ExportID: 'fixture-export&encoded=yes' }; break;
      case 'export_v2.ExportKeywordsByClusterIDs':
        expect(params.ClusterIDs).toEqual([1008]); result = { ExportID: 'fixture-export&encoded=yes' }; break;
      default: return false;
    }
    expect(params.BasketID).toBe(456); expect(params.OwnerID).toBe(123);
    if (method.startsWith('export_v2.')) {
      expect(params.Format).toBe(1);
      result = params.Filename === 'missing' ? {} : result;
    }
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result })); return true;
  };
}
