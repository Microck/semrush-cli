import type { Schema } from 'effect';
import packageInfo from '../package.json' with { type: 'json' };
import catalog from './report-catalog.json' with { type: 'json' };

const backlinkSorts = new Map([['backlinks', 'page_ascore'], ['backlinks_refdomains', 'backlinksnum'], ['backlinks_anchors', 'backlinksnum'], ['backlinks_pages', 'domainsnum'], ['backlinks_outgoing_domains', 'links_num']]);
const domainPresets = new Map([['all', 1], ['improve', 2], ['create', 3]]);
const domainIntents = new Map([['informational', 1], ['navigational', 2], ['commercial', 3], ['transactional', 4]]);
const savedDatabases = new Map(Object.entries(catalog.saved_keywords_import.database_ids));
const savedListSorts = new Map([['name', 1], ['keywords', 2], ['updated', 3]]);
const savedKeywordSorts = new Map([['phrase', 1], ['volume', 2], ['difficulty', 3], ['topic', 4], ['subtopic', 5], ['updated', 6], ['cpc', 7]]);
const savedOwnership = new Map([['all', 1], ['own', 2], ['shared', 3], ['team', 4]]);
const savedLabels = new Map([['position_tracking', 1], ['content_written', 2], ['brief_generated', 3]]);

export const version = packageInfo.version;
export const reports = catalog;
export type ReportName = keyof typeof reports;
export type Report = (typeof reports)[ReportName];
/** Validated catalog queries and fixed JSON request payloads; optional keys are omitted on wire. */
export interface Query { [key: string]: Schema.Json; }

/** Fixed request shapes observed in semrush-web-mcp. No arbitrary RPC or URL input. */
export function reportParameters(definition: Report, q: Query): Query {
  const family = definition.transport;
  if (family === 'notes_web') return noteParameters(definition, q);
  if (family === 'ksb') return domainStrategyParameters(definition, q);
  if (family === 'saved_web') return savedParameters(definition, q);
  if (family === 'tracking_web') return trackingParameters(definition, q);
  if (family === 'audit_web') return auditParameters(definition, q);
  if (family === 'kwm') return keywordListParameters(definition, q);
  if (family === 'project_web') return projectParameters(definition, q);
  if (family === 'magic') return magicParameters(definition, q);
  if (family === 'keyword') return keywordParameters(definition, q);
  if (family === 'direct') return 'database' in q ? { database: (q.database ?? null), global: (q.global_data ?? null), dateFormat: 'date' } : {};
  if (family === 'domain') return domainParameters(definition, q);
  if (family === 'backlink_gap') return backlinkComparisonParameters(definition, q);
  if (family.startsWith('backlink')) return backlinkParameters(definition, q);
  if (family === 'gap') return gapParameters(definition, q);
  if (family === 'projects') return { filter: (q.filters ?? null), range: { limit: (q.limit ?? null), offset: (q.offset ?? null) } };
  if (definition.method.endsWith('selector-list')) return { limit: 10000, offset: 0 };
  return {};
}

/** The current domain strategy API uses camelCase fields and header-only runtime auth. */
function domainStrategyParameters(definition: Report, q: Query): Query {
  if (!definition.method.startsWith('audit.')) return domainResultParameters(definition, q);
  switch (definition.method) {
    case 'audit.ListV3': return { ownership: q.ownership ?? 'all', sortBy: q.sort_field === 'name' ? 'name' : 'updatedAt',
      sortOrder: q.descending === false ? 'asc' : 'desc', nameFilter: q.name_filter ?? '', limit: q.limit ?? 20, offset: q.offset ?? 0 };
    case 'audit.Summary': return { nameFilter: q.name_filter ?? '' };
    case 'audit.GetV3': case 'audit.GetPresetCounts': return { id: q.strategy_id ?? null };
    case 'audit.GetStatus': case 'audit.Delete': return { ids: q.strategy_ids ?? [] };
    case 'audit.Create': return { domain: q.domain ?? null, seedPhrases: [], database: q.database ?? 'us', geoMarkers: [] };
    default: return { id: q.strategy_id ?? null, name: q.name ?? null };
  }
}

/** Domain result filters use their own intent codes and nullable ranges. */
function domainResultParameters(definition: Report, q: Query): Query {
  const method = definition.method;
  if (['page.GetV2', 'page.GetURLs', 'page.GetSERPAnalysis'].includes(method)) return { id: q.page_id ?? null };
  if (method === 'keyword.Delete') return { ids: q.keyword_ids ?? [] };
  if (method.startsWith('keyword.')) return { pageId: q.page_id ?? null };
  const text = String(q.text ?? '').trim();
  const filters = { textSearch: text || null, potentialVolume: { min: q.volume_min ?? null, max: q.volume_max ?? null },
    difficulty: { min: q.difficulty_min ?? null, max: q.difficulty_max ?? null },
    primaryIntent: Array.isArray(q.primary_intents) ? q.primary_intents.map(intent => domainIntents.get(String(intent)) ?? null) : [] };
  if (method === 'export.GetAudit') return { auditId: q.strategy_id ?? null, filename: q.filename ?? 'semrush-keyword-strategy',
    format: q.format === 'xlsx' ? 'xlsx' : q.format === 'csv_semicolon' ? 'csvs' : 'csv', filters };
  const parameters: Query = { auditId: q.strategy_id ?? null, preset: domainPresets.get(String(q.preset)) ?? 1, filters };
  if (method === 'page.ListV2') { parameters.limit = q.limit ?? 20; parameters.offset = q.offset ?? 0; }
  return parameters;
}

/** Current Saved Keywords collections use FilterQL and decimal-string IDs, not basket RPCs. */
function savedParameters(definition: Report, q: Query): Query {
  const path = definition.method;
  if (path.includes('/user/')) return {};
  if (path.endsWith('/undo-delete')) return { undo_id: q.undo_id ?? null };
  return path.includes('/list/') ? savedListParameters(path, q) : savedKeywordParameters(path, q);
}

function savedListParameters(path: string, q: Query): Query {
  if (path.endsWith('/list/create')) return { name: q.name ?? null };
  if (path.endsWith('/list/delete')) return { list_ids: q.list_ids ?? [] };
  if (path.endsWith('/list/rename')) return { list_id: q.list_id ?? null, name: q.name ?? null };
  if (path.endsWith('/list/all')) {
    if ('list_id' in q) return { filter: `id = ${q.list_id}`, ownership: 1, order: { field: 3, direction: 2 }, range: { limit: 1, offset: 0 } };
    const parameters: Query = { ownership: savedOwnership.get(String(q.ownership)) ?? 1,
      order: { field: savedListSorts.get(String(q.sort_field)) ?? 3, direction: q.descending === false ? 1 : 2 }, range: { limit: q.limit ?? 1000, offset: q.offset ?? 0 } };
    if (q.filter) parameters.filter = q.filter;
    return parameters;
  }
  if (path.endsWith('/list/summary')) return { filter: q.filter ?? '' };
  return { list_id: q.list_id ?? null };
}

function savedKeywordParameters(path: string, q: Query): Query {
  if (path.endsWith('/keyword/competitors')) return { keyword_id: q.keyword_id ?? null };
  if (path.endsWith('/keyword/import')) return { list_id: q.list_id ?? null, keywords: Array.isArray(q.keywords)
    ? q.keywords.map(phrase => ({ phrase, database: savedDatabases.get(String(q.database)) ?? null, tags: q.tags ?? [] })) : [] };
  // The native serializer sorts numeric IDs. Compare decimal strings without rounding UInt64 values.
  const selected = Array.isArray(q.keyword_ids) ? q.keyword_ids.map(String).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)) : undefined;
  const filter = selected ? `keyword_id IN (${selected.join(', ')})` : q.filter ?? '';
  if (path.endsWith('/keyword/move') || path.endsWith('/keyword/copy')) return { source_list_id: q.list_id ?? null, target_list_id: q.target_list_id ?? null, filter };
  const parameters: Query = { list_id: q.list_id ?? null, filter };
  if ('sort_field' in q) {
    parameters.order = { field: savedKeywordSorts.get(String(q.sort_field)) ?? 1, direction: q.descending ? 2 : 1 };
  }
  if ('limit' in q) parameters.range = { limit: q.limit ?? 20, offset: q.offset ?? 0 };
  if ('tags' in q) parameters.tags = q.tags ?? [];
  if ('labels' in q) {
    parameters.labels = Array.isArray(q.labels) ? q.labels.map(label => savedLabels.get(String(label)) ?? null) : [];
  }
  if ('format' in q) parameters.format = q.format === 'xlsx' ? 2 : q.format === 'csv_semicolon' ? 3 : 1;
  return parameters;
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

/** Current project-selector and Crossroad web contracts. Control flags never go on wire. */
function projectParameters(definition: Report, q: Query): Query {
  const path = definition.method;
  if (path === '/apis/v4-raw/folders/api/v0/folders' || definition.http_method === 'PUT') {
    const properties: Schema.Json[] = [];
    if (q.name !== undefined) properties.push({ name: { value: q.name } });
    if (q.domain !== undefined) properties.push({ domain: { value: q.domain } });
    return { properties };
  }
  if (path.endsWith('/leave/project-smb')) return { object_ids: [q.folder_id ?? null] };
  if (path.includes('/tags/')) return { tags: Array.isArray(q.tags) ? q.tags.map(name => ({ name })) : [] };
  if (path.endsWith('/set-pinned')) return { id: q.folder_id ?? null, is_pinned: q.pinned ?? null };
  if (path.endsWith('/toolkits')) return { folders: q.folder_ids ?? [], withPromo: q.with_promo ?? false };
  if (path.endsWith('/tools')) return { items: Array.isArray(q.tools) ? q.tools.map(tool => ({ folder_id: q.folder_id ?? null, tool })) : [] };
  if (definition.http_method === 'DELETE') return {};
  return Object.fromEntries(Object.entries(q).filter(([key]) => key !== 'confirm' && key !== 'dry_run'));
}

export interface WebRequest { method: string; path: string; body: Schema.Json; encoding?: 'form'; }

/** Fixed public request plans. RPC credentials enter only inside the browser layer. */
export function webRequest(definition: Report, query: Query): WebRequest {
  if (definition.transport === 'kwm' || definition.transport === 'ksb') return { method: 'POST', path: definition.transport === 'ksb' ? '/ksb/rpc' : '/kwm/rpc', body: rpcBody(definition.method, reportParameters(definition, query)) };
  const parameters = reportParameters(definition, query);
  if ('request_encoding' in definition && definition.request_encoding === 'form') return {
    method: definition.http_method, path: definition.method, body: parameters, encoding: 'form',
  };
  if (definition.transport === 'notes_web' && definition.http_method === 'PUT' && definition.method.endsWith('/hidden/categories/')) {
    const context = new URLSearchParams({ tool: String(parameters.tool) });
    if ('project_id' in parameters) context.set('project_id', String(parameters.project_id));
    return { method: 'PUT', path: definition.method + '?' + context, body: parameters.categories ?? [] };
  }
  return {
    method: definition.http_method,
    path: definition.method.replace(/\{([a-z_]+)\}/g, (_match, key: string) => encodeURIComponent(String(query[key]))),
    body: definition.method.endsWith('/campaign_set_competitors') ? parameters.competitors ?? []
      : definition.http_method === 'POST' && Object.keys(parameters).length === 0 ? null : parameters,
  };
}

export function previewMutation(name: string, definition: Report, query: Query) {
  return definition.mutation && query.dry_run === true
    ? { dry_run: true, report: name, request: webRequest(definition, query) }
    : undefined;
}


/** One JSON-RPC envelope for execution and credential-free previews. */
export function rpcBody(method: string, params: Query): Query { return { id: 1, jsonrpc: '2.0', method, params }; }

/** Basket page filters differ from keyword-row filters and from domain strategies. */
function seedPageFilters(value: Schema.Json | undefined): Query {
  const filters: Query = { Phrase: [], TopicName: [], Volume: [], Difficulty: [], Intents: [], Includes: [], IsFavorite: { Value: false } };
  return Object.assign(filters, value);
}

function basketKeywordFilters(value: Schema.Json | undefined): Query {
  const filters: Query = Object.fromEntries(['ClusterIDs', 'Databases', 'Phrase', 'CompetitionLevel', 'Cpc', 'Difficulty', 'SERPFeatures', 'Volume', 'ClickPotential', 'Tags', 'Intents'].map(key => [key, []]));
  return Object.assign(filters, value);
}

/** Native phrase selections always include their database. */
function basketKeywordIDs(q: Query): Query[] {
  return Array.isArray(q.keywords) ? q.keywords.map(Phrase => ({ Phrase, Database: q.database ?? 'us' })) : [];
}

/** Fixed seed-based page and export contracts from the current Keyword Strategy Builder client. */
function seedResultParameters(definition: Report, q: Query): Query {
  const method = definition.method;
  const shared = { BasketID: q.basket_id ?? null, OwnerID: q.owner_id ?? null };
  if (method.startsWith('export_v2.')) {
    const selection: Query = 'cluster_ids' in q ? { ClusterIDs: q.cluster_ids ?? [] } : 'keywords' in q ? {
      KeywordIDs: basketKeywordIDs(q),
    } : { Filter: 'page_filters' in q ? seedPageFilters(q.page_filters) : basketKeywordFilters(q.filters) };
    return { ...shared, ...selection, Format: q.format === 'xlsx' ? 0 : q.format === 'csv_semicolon' ? 2 : 1, Filename: q.filename ?? 'semrush-keyword-list' };
  }
  if ('cluster_ids' in q) return { ...shared, ClusterIDs: q.cluster_ids ?? [] };
  if ('page_id' in q) return { ...shared, ID: q.page_id ?? null };
  if (method === 'baskets.BasketGetPagePresetCounts') return shared;
  const order = { Direction: q.descending ? 1 : 0, Field: q.sort_field ?? null };
  if (method === 'baskets.BasketGetClusterKeywords') return { ...shared, ClusterID: q.cluster_id ?? null,
    Page: { Number: q.page ?? 1, Size: q.page_size ?? 100 }, Order: order };
  const parameters: Query = { ...shared, Preset: q.preset ?? 1, Filter: seedPageFilters(q.page_filters), Order: [order] };
  if (method === 'baskets.BasketGetClusters') { parameters.ParentID = q.parent_id ?? null; parameters.Page = { Number: q.page ?? 1, Size: q.page_size ?? 20 }; }
  return parameters;
}

/** Transfers use nested owner-aware selectors rather than a single basket scope. */
function basketTransferParameters(q: Query): Query {
  const selection: Query = 'cluster_ids' in q ? { ClusterIDs: q.cluster_ids ?? [] } : { KeywordIDs: basketKeywordIDs(q) };
  return { SourceShareID: { BasketID: q.basket_id ?? null, OwnerID: q.owner_id ?? null },
    TargetShareID: { BasketID: q.target_basket_id ?? null, OwnerID: q.target_owner_id ?? null }, ...selection };
}

/** Keyword Strategy Builder's casing differs from the keyword-research API. */
function keywordListParameters(definition: Report, q: Query): Query {
  const method = definition.method;
  if (method === 'user.GetInfo') return {};
  if (method === 'baskets.BasketsGetAll') return {
    Order: { Direction: q.descending ? 1 : 0, Field: q.sort_field ?? null },
    Page: { Number: q.page ?? null, Size: q.page_size ?? null },
    Filter: { Name: q.name_filter ?? '', OwningType: q.ownership ?? 7 },
  };
  if (method === 'baskets.BasketCreate') return {
    Name: q.name ?? null,
    Clusterization: 'seed_keywords' in q ? { Databases: [q.database ?? 'us'], Domain: q.domain ?? '', Competitors: q.competitors ?? [], SeedPhrases: q.seed_keywords ?? [] } : null,
  };
  if (method === 'baskets.BasketDelete') return { BasketIDs: [q.basket_id ?? null] };
  if (method === 'baskets.KeywordsDeleteUndo') return { UndoID: q.undo_id ?? null };
  if ('target_basket_id' in q) return basketTransferParameters(q);
  if (method.startsWith('export_v2.') || 'page_filters' in q || 'cluster_ids' in q || 'page_id' in q || 'cluster_id' in q || method === 'baskets.BasketGetPagePresetCounts') return seedResultParameters(definition, q);
  const shared: Query = { BasketID: q.basket_id ?? null, OwnerID: q.owner_id ?? null };
  if (method === 'baskets.BasketGetClusterizationStatuses') return { BasketIDs: [shared] };
  if (method === 'baskets.BasketRename') return { ...shared, Name: q.name ?? null };
  if ('keywords' in q) {
    const phrases = Array.isArray(q.keywords) ? q.keywords : [];
    if (method === 'baskets.KeywordsImport') return { ...shared, Keywords: phrases.map(Phrase => ({ Phrase, Database: q.database ?? 'us', Tags: q.tags ?? [] })) };
    const params: Query = { ...shared, KeywordIDs: basketKeywordIDs(q) };
    if ('tags' in q) params.Tags = q.tags ?? [];
    return params;
  }
  if ('filters' in q) {
    const filter = basketKeywordFilters(q.filters);
    if (method === 'baskets.KeywordsGetSummary') return { ...shared, Filter: filter };
    return { ...shared, Filter: filter, Order: { Direction: q.descending ? 1 : 0, Field: q.sort_field ?? null }, Page: { Number: q.page ?? null, Size: q.page_size ?? null } };
  }
  return shared;
}

/** Public-site settings use the wizard contract. Saving and launching are separate operations. */
function auditParameters(definition: Report, q: Query): Query {
  if (!definition.method.endsWith('/save')) {
    const parameters = publicParameters(definition, q);
    if ('format' in parameters) { parameters.export = parameters.format ?? null; delete parameters.format; }
    if ('campaign_ids' in parameters) { parameters.campaignIds = Array.isArray(parameters.campaign_ids) ? parameters.campaign_ids.join(',') : ''; delete parameters.campaign_ids; }
    if ('filter_type' in parameters) { parameters.filterType = parameters.filter_type ?? null; delete parameters.filter_type; }
    return parameters;
  }
  const paths = (value: Schema.Json | undefined) => Array.isArray(value) ? [...new Set(value.map(path => String(path).startsWith('/') ? String(path) : '/' + String(path)))] : [];
  return {
    name: q.name ?? null, domain: q.domain ?? null, rootDomain: q.domain ?? null,
    pageLimit: q.page_limit ?? null, scheduleDay: q.schedule_day ?? 0, notify: q.notify ?? false,
    userAgentType: q.user_agent_type ?? 8, crawlSubdomains: q.crawl_subdomains ?? false,
    crawlSourceType: q.crawl_source_type ?? 0, crawlSourceUrl: q.crawl_source_url ?? '',
    crawlDelaySettingTypeId: q.crawl_delay ?? 1, ignoreRobotsDisallow: q.ignore_robots_disallow ?? false,
    jsRendering: q.js_rendering ?? 'DISABLED', scheme: q.scheme ?? 'https', startCrawlUrl: null,
    allow: paths(q.allow), disallow: paths(q.disallow), withSubfolder: Array.isArray(q.allow) && q.allow.length === 1,
    removedParameters: q.removed_parameters ?? [], excludedChecks: q.excluded_checks ?? [],
    authEnabled: false, authUsername: '', authPassword: '', gaSettings: {}, gaStatus: '',
    webBotAuthEnabled: false, webBotAuthSignatureAgent: '', webBotAuthSignatureInput: '', webBotAuthSignature: '',
  };
}

/** Only catalog parameters go on wire; identifiers embedded in a path are not repeated. */
function publicParameters(definition: Report, query: Query): Query {
  return Object.fromEntries(Object.entries(query).filter(([key]) => !['confirm', 'dry_run'].includes(key) && !definition.method.includes(`{${key}}`)));
}

/** Native JSON tracking reports use repeated selections and bracketed sorting keys. */
function trackingReportParameters(definition: Report, query: Query): Query {
  const parameters = publicParameters(definition, query);
  if ('competitors' in parameters) { parameters['competitors[]'] = parameters.competitors ?? []; delete parameters.competitors; }
  if ('target_ids' in parameters) {
    parameters['targets[]'] = parameters.target_ids ?? []; delete parameters.target_ids;
    parameters.main_target = query.campaign_id ?? null;
    if (parameters.intersection_type === 'all') delete parameters.intersection_type;
  }
  for (const field of ['field', 'order', 'date', 'competitor', 'target', 'top']) {
    const key = `sort_${field}`;
    if (key in parameters) { parameters[`sort[${field}]`] = parameters[key] ?? null; delete parameters[key]; }
  }
  return parameters;
}

/** Current Position Tracking wizard uses cookie-authenticated incremental writes, never billing. */
function trackingParameters(definition: Report, query: Query): Query {
  if ('request_type' in definition) {
    const parameters: Query = { campaign_id: query.campaign_id ?? null, request_type: definition.request_type };
    if (definition.request_type === 'alert_list_read') return { ...parameters, page: query.page ?? 1, display_limit: query.limit ?? 50 };
    if ('trigger_id' in query) parameters.trigger_id = query.trigger_id ?? null;
    if ('condition' in query) {
      const rule: Query = {
        domain: query.domain ?? null, condition: query.condition ?? null, threshold: query.threshold ?? null,
        parameter: 'position', scope: 'all',
      };
      if ('trigger_id' in query) rule.id = query.trigger_id ?? null;
      parameters.trigger_body = rule;
    }
    return parameters;
  }
  if (definition.method.startsWith('/positions/api/targets/')) return {};
  if (definition.method === '/positions/api/replace_target') {
    const names = new Map([['campaign_id', 'id'], ['device', 'device_group']]);
    return Object.fromEntries(Object.entries(publicParameters(definition, query)).map(([key, value]) => [names.get(key) ?? key, value]));
  }
  const phrases = Array.isArray(query.keywords) ? query.keywords : [];
  if (definition.method.endsWith('/campaign_edit_domain_settings')) {
    const names = new Map([['campaign_id', 'campaignId'], ['url_type', 'type'], ['business_name', 'businessName']]);
    return Object.fromEntries(Object.entries(publicParameters(definition, query)).map(([key, value]) => [names.get(key) ?? key, value]));
  }
  if (definition.method.endsWith('/create_targets')) return {
    url: query.domain ?? null, url_type: query.url_type ?? 'rootdomain',
    keywords: phrases.map(keyword => ({ keyword, tags: query.tags ?? [] })),
    targeting: [{ timezone: query.timezone ?? 0, title: query.name ?? query.domain ?? null,
      weekly_notification: query.weekly_notification ?? false, device: query.device ?? 'desktop',
      engine: query.engine ?? 'google', business_name: query.business_name ?? '', brands: query.brands ?? [],
      location: { language_code: query.language_code ?? 'en', location_id: query.location_id ?? null, volume_type: query.volume_type ?? 'national' } }],
  };
  if (definition.method.endsWith('/update_keywords_state')) {
    if ('tags' in query) return { create: phrases.map(keyword => ({ keyword, tags: query.tags ?? [] })) };
    if ('add_tags' in query) return { 'update-attributes': phrases.map(keyword => ({ keyword, tags: { create: query.add_tags ?? [], delete: query.remove_tags ?? [] } })) };
    return { delete: phrases };
  }
  if (definition.method.endsWith('/campaign_set_competitors')) return { competitors: Array.isArray(query.competitors) ? query.competitors.map(domain => ({ domain, url: domain })) : [] };
  if (definition.method.endsWith('/get_locations')) return query.engine ? { q: query.query ?? '', filter_engine: query.engine } : { q: query.query ?? '' };
  if (definition.method.startsWith('/tracking/web-api/reports/')) return trackingReportParameters(definition, query);
  return publicParameters(definition, query);
}

/** The shared notes client uses comma-separated selections and UTC date strings. */
function noteParameters(definition: Report, query: Query): Query {
  const parameters = publicParameters(definition, query);
  for (const key of ['datetime', 'datetime_from', 'datetime_to']) {
    if (key in parameters) parameters[key] = new Date(String(parameters[key])).toISOString();
  }
  if (definition.method.endsWith('/hidden/categories/')) return parameters;
  if (definition.http_method === 'GET' && definition.method.endsWith('/notes/')) {
    for (const key of ['tools', 'categories', 'project_ids']) {
      const value = parameters[key];
      if (Array.isArray(value)) {
        if (value.length) parameters[key === 'project_ids' ? 'projects' : key] = value.join(',');
        else delete parameters[key];
      }
      if (key === 'project_ids') delete parameters.project_ids;
    }
    if ('database' in parameters) { parameters.databases = String(parameters.database).toUpperCase() + ',ALL'; delete parameters.database; }
    parameters.ordering = query.descending ? '-datetime,-created' : 'datetime,created'; delete parameters.descending;
    if (query.include_hidden === false) parameters.get_hidden = 'false';
    delete parameters.include_hidden;
    return parameters;
  }
  if ('project_id' in parameters) { parameters.project = parameters.project_id ?? null; delete parameters.project_id; }
  if (definition.http_method === 'POST' && definition.method.endsWith('/notes/')) parameters.category = 'USER_NOTE';
  return parameters;
}
