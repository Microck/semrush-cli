import type { IncomingMessage, ServerResponse } from 'node:http';
import { expect } from 'vitest';
import type { Schema } from 'effect';

interface Opportunity { id: number; type: number; title: string; url: string; labels: number[]; potentialVolume: number; difficulty: number; }
const opportunities: Opportunity[] = [
  { id: 1201, type: 2, title: 'Python guide', url: 'https://example.com/python', labels: [], potentialVolume: 3000, difficulty: 35 },
  { id: 1202, type: 1, title: 'New topic', url: '', labels: [], potentialVolume: 500, difficulty: 60 },
];

/** The domain RPC and its native attachment endpoint share this stateful HTTP provider. */
export function makeDomainFixture() {
  let strategy: { id: number; name: string; domain: string; state: number } | undefined;
  let recommended = [{ id: 902, phrase: 'python ideas', intents: [3], difficulty: 35, volume: 2000 },
    { id: 903, phrase: 'python tools', intents: [1], difficulty: 40, volume: 1000 }];

  return async (request: IncomingMessage, response: ServerResponse, url: URL) => {
    expect(request.headers.cookie).toContain('session=authorized');
    if (url.pathname.startsWith('/ksb/export/')) {
      expect(request.method).toBe('GET');
      if (url.pathname.endsWith('/forbidden.csv')) {
        response.writeHead(403, { 'Content-Type': 'application/json' }); response.end('{"error":"denied"}'); return;
      }
      if (url.pathname.endsWith('/redirect.csv')) {
        response.writeHead(302, { Location: '/ksb/export/file.csv' }); response.end(); return;
      }
      response.setHeader('Content-Type', 'text/csv');
      response.setHeader('Content-Disposition', 'attachment; filename=domain-strategy.csv');
      response.end('url,keyword\nhttps://example.com/python,python ideas\n'); return;
    }
    expect(url.pathname).toBe('/ksb/rpc'); expect(request.method).toBe('POST'); expect(url.search).toBe('');
    expect(request.headers['api-key']).toBe('fixture-secret'); expect(request.headers['user-id']).toBe('123');
    let encoded = ''; for await (const chunk of request) encoded += chunk;
    const rpc = JSON.parse(encoded); const params = rpc.params;
    expect(params).not.toHaveProperty('APIKey'); expect(params).not.toHaveProperty('UserID');
    expect(params).not.toHaveProperty('confirm'); expect(params).not.toHaveProperty('dry_run');
    let result: Schema.Json = {};
    switch (rpc.method) {
      case 'audit.Create':
        expect(params).toEqual({ domain: 'example.com', seedPhrases: [], database: 'us', geoMarkers: [] });
        strategy = { id: 654, name: 'example.com', domain: 'example.com', state: 1 };
        recommended = [{ id: 902, phrase: 'python ideas', intents: [3], difficulty: 35, volume: 2000 }, { id: 903, phrase: 'python tools', intents: [1], difficulty: 40, volume: 1000 }];
        result = { id: 654 }; break;
      case 'audit.ListV3': result = { lists: strategy ? [strategy] : [] }; break;
      case 'audit.Summary': result = { own: strategy ? 1 : 0, direct: 0, corporate: 0 }; break;
      case 'audit.GetV3': expect(params.id).toBe(654); result = strategy ?? null; break;
      case 'audit.GetStatus': expect(params.ids).toEqual([654]); result = { statuses: [strategy?.state ?? 0] }; break;
      case 'audit.GetPresetCounts': expect(params.id).toBe(654); result = { all: 2, existing: 1, new: 1 }; break;
      case 'audit.Rename': expect(params.id).toBe(654); if (strategy) strategy.name = params.name; result = strategy ?? null; break;
      case 'audit.Delete': expect(params.ids).toEqual([654]); strategy = undefined; break;
      case 'page.ListV2': case 'page.GetSummary': {
        expect(params.auditId).toBe(654);
        expect(params.filters).toMatchObject({ textSearch: null, difficulty: { min: null, max: null }, primaryIntent: [] });
        const selected = opportunities.filter(page => (params.preset === 1 || page.type === (params.preset === 2 ? 2 : 1)) &&
          (params.filters.potentialVolume.min === null || page.potentialVolume >= params.filters.potentialVolume.min));
        result = rpc.method === 'page.GetSummary' ? { count: selected.length }
          : { pages: selected.slice(params.offset, params.offset + params.limit).map(({ difficulty: _difficulty, ...page }) => page) };
        break;
      }
      case 'page.GetV2':
        expect(params.id).toBe(1201);
        result = { title: 'Python guide', url: 'https://example.com/python', languageTag: 'en', keywordStats: {
          existingCount: 1, existingAvgPosition: 9, recommendedVolume: 3000, recommendedAvgDifficulty: 35, existingIntents: [1], recommendedPrimaryIntents: [3],
        } }; break;
      case 'page.GetURLs': expect(params.id).toBe(1201); result = { urls: ['https://example.com/python'] }; break;
      case 'page.GetSERPAnalysis': expect(params.id).toBe(1201); result = { serpFeatures: [21], urls: [{ url: 'https://example.org/python', domainAuthorityScore: 70 }] }; break;
      case 'keyword.ListExistingV2': expect(params.pageId).toBe(1201); result = { keywords: [{ id: 901, phrase: 'python guide', volume: 1000 }] }; break;
      case 'keyword.ListRecommendedV2': expect(params.pageId).toBe(1201); result = { keywords: recommended }; break;
      case 'keyword.Delete':
        expect(params.ids).toEqual([902]); recommended = recommended.filter(keyword => !params.ids.includes(keyword.id)); break;
      case 'export.GetAudit': {
        expect(params).toMatchObject({ auditId: 654, format: 'csv', filters: { textSearch: null, primaryIntent: [] } });
        const host = params.filename === 'foreign' ? 'https://example.com' : url.origin;
        const name = params.filename === 'forbidden' ? 'forbidden' : 'redirect';
        result = { url: host + '/ksb/export/' + name + '.csv' }; break;
      }
      default: throw new Error('Unsupported domain strategy fixture method');
    }
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
  };
}
