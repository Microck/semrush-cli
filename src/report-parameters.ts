import type { Schema } from 'effect';
import catalog from './report-catalog.json' with { type: 'json' };

const backlinkSorts = new Map([['backlinks', 'page_ascore'], ['backlinks_refdomains', 'backlinksnum'], ['backlinks_anchors', 'backlinksnum'], ['backlinks_pages', 'domainsnum'], ['backlinks_outgoing_domains', 'links_num']]);

export const reports = catalog;
export type ReportName = keyof typeof reports;
export type Report = (typeof reports)[ReportName];
/** Validated catalog queries and fixed JSON request payloads; optional keys are omitted on wire. */
export interface Query { [key: string]: Schema.Json; }

/** Fixed request shapes observed in semrush-web-mcp. No arbitrary RPC or URL input. */
export function reportParameters(definition: Report, q: Query): Query {
  const family = definition.transport;
  if (family === 'magic') return magicParameters(definition, q);
  if (family === 'keyword') return keywordParameters(definition, q);
  if (family === 'direct') return 'database' in q ? { database: (q.database ?? null), global: (q.global_data ?? null), dateFormat: 'date' } : {};
  if (family === 'domain') return domainParameters(definition, q);
  if (family === 'backlink_gap') return backlinkComparisonParameters(definition, q);
  if (family.startsWith('backlink')) return backlinkParameters(definition, q);
  if (family === 'gap') return gapParameters(definition, q);
  if (family === 'projects') return { filter: (q.filters ?? null), range: { limit: (q.limit ?? null), offset: (q.offset ?? null) } };
  if (family === 'post' && definition.method.endsWith('/list/all')) return { ownership: 1, order: { field: 3, direction: 2 }, range: { limit: 1000, offset: 0 } };
  if (definition.method.endsWith('selector-list')) return { limit: 10000, offset: 0 };
  return {};
}

function magicParameters(definition: Report, q: Query): Query {
  const method = definition.method;
  const filters: Query = Object.fromEntries(['phrase', 'competition_level', 'cpc', 'difficulty', 'results', 'volume', 'words_count'].map(key => [key, []]));
  Object.assign(filters, { serp_features: [{ inverted: false, value: [] }], phrase_include_logic: 0 }, (q.filters ?? null));
  const params: Query = { phrase: (q.keyword ?? null), database: (q.database ?? null), currency: (q.currency ?? null), mode: (q.mode ?? null), questions_only: (q.questions_only ?? null), topics_enabled: true, filter: filters, groups: (q.groups ?? null), order: { direction: q.descending ? 1 : 0, field: (q.sort_field ?? null) }, groups_order: { direction: 1, field: 'relevance' } };
  if (method === 'ideas.GetKeywords') params.page = { number: (q.page ?? null), size: (q.page_size ?? null) };
  if (method === 'ideas.GetGroups') params.groups_page = { number: (q.page ?? null), size: (q.page_size ?? null) };
  return params;
}


function keywordParameters(definition: Report, q: Query): Query {
  const method = definition.method;
  if (!('keyword' in q)) return {};
  const params: Query = { phrase: (q.keyword ?? null), database: (q.database ?? null), device: 0, currency: 'USD', location: 0, date: '' };
  if (method.startsWith('ideas.')) Object.assign(params, { mode: 0, questions_only: (q.questions_only ?? null) });
  return params;
}


function domainParameters(definition: Report, q: Query): Query {
  const method = definition.method;
  if (!('domain' in q)) return { database: (q.database ?? null) };
  const params: Query = { searchItem: (q.domain ?? null), searchType: 'domain', dateFormat: 'date', dateType: q.date_type ?? 'daily' };
  if ('database' in q) params.database = (q.database ?? null);
  if ('search_type' in q) {
    delete params.dateFormat;
    if ((q.date ?? null) !== null) params.date = (q.date ?? null);
    Object.assign(params, { searchType: (q.search_type ?? null), display: { page: (q.page ?? null), pageSize: (q.page_size ?? null), order: { field: (q.sort_field ?? null), direction: q.descending ? 'desc' : 'asc' } } });
    if (method === 'organic.Positions' || method === 'organic.PositionChangesV2') params.positionsType = 'all';
    if ('filters' in q) params.filter = (q.filters ?? null);
    if (method === 'organic.PositionChangesV2') Object.assign(params, { changesTypes: null, dateRange: null });
  }
  if (method.endsWith('CompetitorsOverview')) Object.assign(params, { display: { page: 1, pageSize: (q.limit ?? null) }, youDomain: true });
  if (method === 'organic.OverviewTrend') {
    delete params.dateFormat;
    Object.assign(params, { dateRange: null, global: (q.global_data ?? null) });
  }
  if (method === 'organic.TopicsStatus' || method === 'organic.TopicsResult') {
    delete params.dateFormat;
    delete params.dateType;
  }
  if (method === 'organic.AiTopSources') params.range = { limit: (q.limit ?? null), offset: (q.offset ?? null) };
  return params;
}


function backlinkComparisonParameters(definition: Report, q: Query): Query {
  const method = definition.method;
  const params: Query = { action: 'report', type: method, 'targets[]': (q.domains ?? null), 'target_types[]': Array.isArray(q.domains) ? q.domains.map(() => 'root_domain') : [] };
  if (method === 'backlinks_matrix') Object.assign(params, { display_limit: (q.limit ?? null), export_columns: 'domain,domain_ascore,matches_num,backlinks_num,traffic', display_filter: (q.filters ?? null), sort_field: (q.sort_field ?? null), sort_type: q.descending ? 'desc' : 'asc', sort_target: (q.sort_target ?? null), display_page: (q.page ?? null) });
  else params.export_columns = 'zones,backlinks_historical,geodomains';
  return params;
}


function backlinkParameters(definition: Report, q: Query): Query {
  const method = definition.method;
  const family = definition.transport;
  const params: Query = { target: (q.domain ?? null), target_type: (q.target_type ?? null) };
  if (family === 'backlink') {
    Object.assign(params, { action: 'report', type: method, display_page: (q.page ?? null), sort_field: (q.sort_field ?? null) || backlinkSorts.get(method), sort_type: q.descending ? 'desc' : 'asc' });
    if ((q.filters ?? null)) params.display_filter = (q.filters ?? null);
  }
  return params;
}


function gapParameters(definition: Report, q: Query): Query {
  const method = definition.method;
  const params: Query = { targets: Array.isArray(q.domains) ? q.domains.map(value => ({ product_type: 2, type: 1, value, filters: '' })) : [], date: null, database: (q.database ?? null), filters: (q.filters ?? null) };
  if (method.endsWith('KeywordsList')) Object.assign(params, { type: (q.gap_type ?? null), range: { limit: (q.limit ?? null), offset: (q.offset ?? null) }, columns: ['KEYWORD', 'INTENTS', 'VOLUME', 'KEYWORD_DIFFICULTY', 'CPC', 'COMPETITION_DENSITY', 'TARGETS_POSITION', 'TARGETS_URL', 'RESULTS'], order: { column: 6, direction: 2 } });
  return params;
}
