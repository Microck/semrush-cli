import { Predicate, type Schema } from 'effect';
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

/** Native My Reports fields; this fixed overview never accepts caller GraphQL or generates reports. */
const reportingOverviewQuery = `query ReportingOverview($offset: Int, $where: ReportsWhereInput) {
  me {
    hasProduct productTier isPaid isCommonPrivacyAccepted availableActions
    newReportProperties { state availableActions }
    limits {
      reports_essential { isLimitReached limit used need }
      reports_premium { isLimitReached limit used need }
      reports_upgrades_for_essential { isLimitReached limit used need }
      aiSummary { isLimitReached limit used }
      aiSummaryFlash { isLimitReached limit used }
      trials { isLimitReached limit used }
    }
    systemTemplates { type title isPremium new tools datasources groups hint }
    reports(limit: 30, sort: UpdatedAt, sortDescend: true, offset: $offset, where: $where) {
      totalCount
      nodes {
        id name state createdAt updatedAt availableActions isBranded
        schedule { isScheduled dayOfPeriod period }
        readyTasks: tasks(limit: 1, states: [ready]) { id filename state createdAt }
      }
    }
  }
}`;

export const version = packageInfo.version;
export const reports = catalog;
export type ReportName = keyof typeof reports;
export type Report = (typeof reports)[ReportName];
/** Optional response metadata is shared by the CLI, MCP annotations and adapter. */
export function reportResponseType(definition: Report): string | undefined {
  return 'response_type' in definition ? definition.response_type : undefined;
}
/** Validated catalog queries and fixed JSON request payloads; optional keys are omitted on wire. */
export interface Query { [key: string]: Schema.Json; }

/** Filters mirror the native grid; caller text only enters GraphQL variables. */
function reportingParameters(query: Query): Query {
  const where: Query = {};
  if (query.ownership === 'own') where.ownedByMe = true;
  if (query.ownership === 'shared') Object.assign(where, { ownedByMe: false, isVirtualShare: false });
  if (query.ownership === 'team') where.isVirtualShare = true;
  const branding = query.branding ?? 'all'; const schedule = query.schedule ?? 'all';
  if (branding !== 'all') where.isBranded = branding === 'branded';
  if (schedule !== 'all') where.schedulePeriods = [schedule];
  if (query.search) where.name = { method: 'Contains', value: query.search };
  return { operationName: 'ReportingOverview', query: reportingOverviewQuery, variables: { offset: query.offset ?? 0, where } };
}

/** Fixed request shapes observed in semrush-web-mcp. No arbitrary RPC or URL input. */
export function reportParameters(definition: Report, q: Query): Query {
  const family = definition.transport;
  if (family === 'onpage_web') return onpageParameters(definition, q);
  if (family === 'reporting_web') return reportingParameters(q);
  if (family === 'bla') return backlinkAuditParameters(definition, q);
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

/** Backlink Audit has separate SEO project IDs, campaign IDs and native search objects. */
function backlinkAuditParameters(definition: Report, query: Query): Query {
  const method = definition.method;
  if (['projects.Limits', 'domains.GetAll', 'catalog.CategoriesFull', 'catalog.GeoList'].includes(method)) return {};
  if (['domains.GetProject', 'domains.GetScopes', 'domains.GetByProjectId'].includes(method)) return { projectId: query.project_id ?? null };
  if (method === 'domains.AddByProjectId') return { projectId: query.project_id ?? null, scope: query.scope ?? 'root', params: backlinkAuditSettings(query) };
  if (method === 'domains.ApplySettings') return { userDomainId: query.audit_id ?? null, params: backlinkAuditSettings(query) };
  const parameters: Query = { userDomainId: query.audit_id ?? null };
  if (['backlinks.MoveDomains', 'backlinks.MoveUrls', 'backlinks.MoveLinkNetworks', 'disavow.Move', 'disavow.Delete', 'disavow.Clear'].includes(method)) return backlinkAuditListParameters(method, query);
  if (['comments.GetByIds', 'comments.Save', 'comments.Delete', 'usertags.Get', 'usertags.TargetPagesCounters', 'usertags.AddTargetUrlTag', 'usertags.RemoveTargetUrlTag', 'usertags.Delete'].includes(method)) return backlinkAuditAnnotationParameters(method, query);
  if (['backlinks.GetTargetPagesCompound', 'backlinks.CountTargetPagesCompound'].includes(method)) return backlinkAuditTargetParameters(method, query);
  if (method === 'domains.GetStatus') return { ...parameters, background: query.background ?? false };
  if (['backlinks.Get', 'backlinks.Count'].includes(method)) return backlinkAuditTableParameters(query);
  if (method === 'backlinks.StartBacklinksCSVExport') { const table = backlinkAuditTableParameters(query); return { userDomainId: table.userDomainId, search: table.search }; }
  if (method === 'disavow.Get' || method === 'disavow.Count') {
    parameters.search = { query: query.query ?? null, status: query.status ?? null, source: query.source ?? null, type: query.type ?? null };
    if (method === 'disavow.Get') Object.assign(parameters, { sort: { field: 'statusId', type: query.descending === false ? 'ASC' : 'DESC' }, pageSize: query.page_size ?? 50, page: query.page ?? 0 });
    return parameters;
  }
  if (method === 'disavow.Counters') return { ...parameters, search: { targetUrlHash: query.target_url_hash ?? null, targetUrlPath: query.target_url_path ?? null } };
  if (!method.startsWith('overview.')) return parameters;
  const search: Query = { targetUrlHash: query.target_url_hash ?? null, targetUrlPath: query.target_url_path ?? null };
  if (method === 'overview.GetRelStats' && query.by_domain) search.collapse = 'd';
  parameters.search = search;
  if (method === 'overview.GetLostFoundTimechart') Object.assign(parameters, { list: query.list ?? 'new', showDiff: query.show_diff ?? true, withDomains: query.with_domains ?? true });
  if (method === 'overview.GetAnchorDistributionNew') Object.assign(parameters, { anchorTypes: query.anchor_types ?? ['all'], limit: query.limit ?? 100, orderBy: 'backlinks' });
  if (method === 'overview.TopRefDomains') Object.assign(parameters, { limit: query.limit ?? 100, showOnlyToxic: query.only_toxic ?? false });
  return parameters;
}

/** Backlink selections and disavow items use distinct native identifier fields. */
function backlinkAuditListParameters(method: string, query: Query): Query {
  const parameters: Query = { userDomainId: query.audit_id ?? null };
  if (method.startsWith('backlinks.Move')) return { ...parameters, ids: query.ids ?? [], list: query.list ?? null };
  if (method === 'disavow.Clear') return { ...parameters, withManual: query.with_manual ?? false, withFile: query.with_file ?? false, withGDT: query.with_gdt ?? false };
  parameters.userListItemId = query.item_id ?? null;
  if (method === 'disavow.Move') parameters.list = query.list ?? null;
  return parameters;
}

/** Domain comments and target-page labels use their own native keys. */
function backlinkAuditAnnotationParameters(method: string, query: Query): Query {
  const parameters: Query = { userDomainId: query.audit_id ?? null };
  if (method === 'comments.GetByIds') return { ...parameters, ids: query.ids ?? [] };
  if (method === 'comments.Save') return { ...parameters, domain: query.domain ?? null, comment: query.comment ?? null };
  if (method === 'comments.Delete') return { ...parameters, id: query.comment_id ?? null };
  if (query.label !== undefined) parameters.label = query.label;
  if (query.target_url !== undefined) parameters.targetUrl = query.target_url;
  return parameters;
}

/** Target Pages has flat filters rather than the audit table's search object. */
function backlinkAuditTargetParameters(method: string, query: Query): Query {
  const parameters: Query = { userDomainId: query.audit_id ?? null, query: query.query ?? '', queryMode: query.query_mode ?? null,
    collapse: query.by_domain === false ? null : 'd', targetUrlError: query.target_error ?? null, userTags: query.labels ?? [], isNew: query.is_new ?? false };
  if (method === 'backlinks.GetTargetPagesCompound') Object.assign(parameters, {
    sort: (query.descending === false ? '+' : '-') + String(query.sort_field ?? 'active'), page: query.page ?? 0, pageSize: query.page_size ?? 50,
  });
  return parameters;
}

/** Native settings are partial; category IDs use the web client's string encoding. */
function backlinkAuditSettings(query: Query): Query {
  const settings: Query = {};
  for (const [input, output] of [['brands', 'brands'], ['categories', 'categories'], ['countries', 'geo'], ['recrawl', 'recrawl'], ['recrawl_notify', 'recrawlNotify'], ['recrawl_majestic', 'recrawlMajestic']] as const) {
    const value = query[input];
    // The category picker returns numbers; the native settings client sends string IDs.
    if (value !== undefined) settings[output] = input === 'categories' && Array.isArray(value) ? value.map(category => String(category)) : value;
  }
  return settings;
}

/** Table filters use schema defaults; the native field names differ from CLI flags. */
function backlinkAuditTableParameters(query: Query): Query & { userDomainId: Schema.Json; search: Query } {
  const fields = [['authority_min', 'aScoreMin'], ['authority_max', 'aScoreMax'], ['anchor_types', 'anchorTypes'],
    ['category_id', 'categoryId'], ['is_new', 'isNew'], ['target_error', 'isTargetError'], ['link_type', 'linkType'],
    ['query', 'query'], ['query_mode', 'queryMode'], ['rel', 'rel'], ['toxic_markers', 'toxicMarkerIds'],
    ['toxic_type', 'toxicType'], ['mode', 'mode'], ['source', 'src'], ['target_url_hash', 'targetUrlHash'], ['target_url_path', 'targetUrlPath']] as const;
  const search: Query = Object.fromEntries(fields.map(([input, output]) => [output, query[input] ?? null]));
  search.collapse = query.by_domain === false ? null : 'd';
  if (['new', 'broken', 'lost'].includes(String(query.mode))) search.rangeDays = query.range_days ?? 30;
  if (query.completely) search.completely = true;
  return { userDomainId: query.audit_id ?? null, search, pageSize: query.page_size ?? 50, page: query.page ?? 0 };
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
  if (method === 'user.GetInfo') return {};
  const topics = q.group_by !== 'words';
  const filters: Query = Object.fromEntries(['phrase', 'competition_level', 'cpc', 'difficulty', 'results', 'volume', 'words_count'].map(key => [key, []]));
  Object.assign(filters, { serp_features: [{ inverted: false, value: [] }], phrase_include_logic: 0 }, (q.filters ?? null));
  const params: Query = { phrase: (q.keyword ?? null), database: (q.database ?? null), currency: (q.currency ?? null), mode: (q.mode ?? null), questions_only: (q.questions_only ?? null), filter: filters, groups: q.groups ?? [], order: { direction: q.descending ? 1 : 0, field: q.sort_field ?? (topics ? 'similarity_score' : 'volume') }, groups_order: { direction: q.groups_descending === false ? 0 : 1, field: topics ? 'relevance' : q.groups_sort_field ?? 'count' } };
  if (topics) params.topics_enabled = true;
  if (q.domain) params.domain = q.domain;
  if (method === 'ideas.GetKeywords') params.page = { number: (q.page ?? null), size: (q.page_size ?? null) };
  if (method === 'ideas.GetGroups') params.groups_page = { number: (q.page ?? null), size: (q.page_size ?? null) };
  return params;
}


const keywordExportColumns = { keyword: 0, intent: 1, volume: 2, trend: 3, difficulty: 4, cpc: 5, competition: 6, serp_features: 7, results: 8, personalized_difficulty: 10, positions: 11, potential_traffic: 12 };
function keywordBulkParameters(q: Query): Query {
  const params: Query = { phrases: q.keywords ?? [], database: q.database ?? 'us', currency: q.currency ?? 'USD' };
  if (q.domain) params.domain = q.domain;
  return params;
}
/** Export column choices are a selection; native field order determines the file order. */
function keywordExportParameters(method: string, q: Query): Query {
  const format = q.format === 'xlsx' ? 0 : q.format === 'csv_semicolon' ? 2 : 1;
  if (method === 'keywords.Export') {
    const columns = Array.isArray(q.columns) ? q.columns : [];
    return { ...keywordBulkParameters(q), format, filename: 'semrush-keyword-bulk',
      columns: Object.entries(keywordExportColumns).filter(([name]) => columns.includes(name)).map(([, code]) => code) };
  }
  if (method === 'serp.ExportURLsLocal') return { phrase: q.keyword ?? '', database: q.database ?? 'us', location: q.location_id ?? 0, format, filename: 'semrush-keyword-local-serp' };
  return { phrase: q.keyword ?? '', database: q.database ?? 'us', device: q.device === 'mobile' ? 1 : 0, date: q.date ?? '', format,
    filename: method === 'serp.ExportDomains' ? 'semrush-keyword-serp-domains' : 'semrush-keyword-serp' };
}

function keywordParameters(definition: Report, q: Query): Query {
  const method = definition.method;
  if (method === 'domains.GetSiteRoot' || method === 'domains.GetStatus') {
    const selection: Query = { domain: q.domain ?? '' };
    if (q.job_id !== undefined) selection.id = q.job_id;
    return selection;
  }
  if (method === 'locations.Get') return { database: q.database ?? 'us', input: q.input ?? '' };
  if (method === 'updates.RequestUpdates' || method === 'updates.GetKeywords') return keywordRefreshParameters(method, q);
  if (method === 'keywords.GetBulk') return { ...keywordBulkParameters(q), date: '' };
  if (method === 'keywords.Export' || method === 'serp.ExportURLs' || method === 'serp.ExportDomains' || method === 'serp.ExportURLsLocal') return keywordExportParameters(method, q);
  if (!('keyword' in q)) return {};
  const params: Query = { phrase: (q.keyword ?? null), database: (q.database ?? null), device: q.device === 'mobile' ? 1 : 0, currency: q.currency ?? 'USD', location: q.location_id ?? 0, date: q.date ?? '' };
  if (q.domain) params.domain = q.domain;
  if (method.startsWith('ideas.')) Object.assign(params, { mode: 0, questions_only: (q.questions_only ?? null) });
  if (method === 'serp.GetURLsOrganicMetrics' || method === 'serp.GetURLsBacklinksMetrics' || method === 'serp.GetURLsOrganicMetricsLocal') params.urls = q.urls ?? [];
  if (method === 'serp.GetDomainsOrganicMetrics' || method === 'serp.GetDomainsBacklinksMetrics') params.domains = Array.isArray(q.domains) ? q.domains.toSorted() : [];
  return params;
}

/** Refresh uses explicit phrase selections; status timestamps are native epoch seconds. */
function keywordRefreshParameters(method: string, query: Query): Query {
  const status = method === 'updates.GetKeywords';
  const phrases = Array.isArray(query.keywords) ? query.keywords.map(phrase => {
    const selection: Query = { phrase, database: query.database ?? 'us', location: query.location_id ?? 0 };
    if (status) selection.status_updated_at = query.status_updated_at ?? 0;
    return selection;
  }) : [];
  if (!status) return { phrases };
  const parameters: Query = { phrases, include_updating: true, currency: query.currency ?? 'USD' };
  if (query.domain) parameters.domain = query.domain;
  return parameters;
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

/** On Page setup and later location edits use distinct native country fields. */
function onpageParameters(definition: Report, query: Query): Query {
  const path = definition.method;
  if (path === '/on-page-seo-checker/api/create') return {
    id: query.campaign_id ?? null, landings: query.landings ?? [], timezone: query.timezone_offset ?? 0,
    settings: { location: { location: query.location ?? query.country_name ?? 'United States', language: query.language ?? 'en',
      device: query.device === 'mobile' ? 'phone' : 'desktop', country: query.country_name ?? 'United States' },
      notify: query.notify ?? false, schedule: query.schedule === 'weekly' ? 1 : 0, default_agent: query.crawler !== 'googlebot' },
  };
  if (path.endsWith('/settings/')) {
    const changes: Query = {};
    if (query.schedule !== undefined) changes.schedule = query.schedule === 'weekly' ? 1 : 0;
    if (query.notify !== undefined) changes.notify = query.notify;
    if (query.crawler !== undefined) changes.default_agent = query.crawler === 'semrushbot';
    if (query.timezone_offset !== undefined) changes.timezone = query.timezone_offset;
    return changes;
  }
  if (path.endsWith('/location/')) return { country: query.country_code ?? null, location: query.location ?? null,
    language: query.language ?? 'en', device: query.device === 'mobile' ? 'phone' : 'desktop' };
  if (path.endsWith('/landings/create/')) return { landings: query.landings ?? [] };
  if (definition.http_method === 'DELETE') return { ids: query.page_ids ?? [] };
  if (definition.http_method === 'PUT') return { url: query.url ?? null, keywords: query.keywords ?? [],
    id: query.page_id ?? null, is_switch_scheme: query.switch_scheme ?? false };
  if (definition.http_method === 'POST' && path.endsWith('/landings/')) return { url: query.url ?? null, keywords: query.keywords ?? [] };
  return {};
}

export interface WebRequest { method: string; path: string; body: Schema.Json; encoding?: 'form' | 'multipart' | 'json' | 'query'; file?: { field: string; filename: string; contents: string }; }

/** Fixed public request plans. RPC credentials enter only inside the browser layer. */
export function webRequest(definition: Report, query: Query): WebRequest {
  if (definition.transport === 'keyword') return { method: 'POST', path: '/kwogw/v2/webapi', body: rpcBody(definition.method, reportParameters(definition, query)) };
  if (definition.transport === 'bla') return { method: 'POST', path: '/backlink_audit/rpc/?method=' + encodeURIComponent(definition.method), body: rpcBody(definition.method, reportParameters(definition, query)) };
  if (definition.transport === 'kwm' || definition.transport === 'ksb') return { method: 'POST', path: definition.transport === 'ksb' ? '/ksb/rpc' : '/kwm/rpc', body: rpcBody(definition.method, reportParameters(definition, query)) };
  const parameters = reportParameters(definition, query);
  const path = definition.method.replace(/\{([a-z_]+)\}/g, (_match, key: string) => encodeURIComponent(String(query[key])));
  if ('request_encoding' in definition && definition.request_encoding === 'multipart') {
    const prepared: WebRequest = { method: definition.http_method, path, body: parameters, encoding: 'multipart' };
    if ('file_field' in definition) {
      prepared.file = { field: definition.file_field, filename: String(query.filename), contents: String(query.contents) };
      prepared.body = null;
    }
    return prepared;
  }
  if ('request_encoding' in definition && definition.request_encoding === 'form') return {
    method: definition.http_method, path: definition.method, body: parameters, encoding: 'form',
  };
  if (definition.transport === 'notes_web' && definition.http_method === 'PUT' && definition.method.endsWith('/hidden/categories/')) {
    const context = new URLSearchParams({ tool: String(parameters.tool) });
    if ('project_id' in parameters) context.set('project_id', String(parameters.project_id));
    return { method: 'PUT', path: definition.method + '?' + context, body: parameters.categories ?? [] };
  }
  let body: Schema.Json = parameters;
  if (definition.transport === 'onpage_web' && definition.method.endsWith('/landings/create/')) body = parameters.landings ?? [];
  else if (definition.method.endsWith('/campaign_set_competitors')) body = parameters.competitors ?? [];
  else if (definition.http_method === 'POST' && Object.keys(parameters).length === 0) body = null;
  const prepared: WebRequest = { method: definition.http_method, path, body };
  if ('request_encoding' in definition && (definition.request_encoding === 'json' || definition.request_encoding === 'query')) prepared.encoding = definition.request_encoding;
  return prepared;
}

/** Keep secret object structure so native field mapping remains accurate in offline previews. */
const inputObject = (value: Schema.Json | undefined): value is Schema.JsonObject => Predicate.isObject(value) && !Array.isArray(value);
function redactInput(value: Schema.Json | undefined): Schema.Json {
  if (Array.isArray(value)) return value.map(redactInput);
  if (inputObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactInput(item)]));
  return '[redacted]';
}

export function previewMutation(name: string, definition: Report, query: Query) {
  if (!definition.mutation || query.dry_run !== true) return undefined;
  const visible = { ...query };
  for (const [key, property] of Object.entries(definition.schema.properties)) {
    if ('writeOnly' in property && property.writeOnly === true && key in visible) visible[key] = redactInput(visible[key]);
  }
  return { dry_run: true, report: name, request: webRequest(definition, visible) };
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
  if (definition.method.endsWith('/js-impact/details') || definition.method.startsWith('/siteaudit/export/js-impact/')) return auditJSImpactParameters(q);
  if (!definition.method.endsWith('/save')) {
    const parameters = publicParameters(definition, q);
    if ('format' in parameters) { parameters.export = parameters.format ?? null; delete parameters.format; }
    if ('campaign_ids' in parameters) { parameters.campaignIds = Array.isArray(parameters.campaign_ids) ? parameters.campaign_ids.join(',') : ''; delete parameters.campaign_ids; }
    if ('filter_type' in parameters) { parameters.filterType = parameters.filter_type ?? null; delete parameters.filter_type; }
    return parameters;
  }
  const paths = (value: Schema.Json | undefined) => Array.isArray(value) ? [...new Set(value.map(path => String(path).startsWith('/') ? String(path) : '/' + String(path)))] : [];
  const webBotAuth = Object.assign({ signature_agent: '', signature_input: '', signature: '' }, q.web_bot_auth);
  return {
    domain: q.domain ?? null, rootDomain: q.domain ?? null,
    pageLimit: q.page_limit ?? null, scheduleDay: q.schedule_day ?? 0, notify: q.notify ?? false,
    userAgentType: q.user_agent_type ?? 8, crawlSubdomains: q.crawl_subdomains ?? false,
    crawlSourceType: q.crawl_source_type ?? 0, crawlSourceUrl: q.crawl_source_url ?? '',
    crawlDelaySettingTypeId: q.crawl_delay ?? 1, ignoreRobotsDisallow: q.ignore_robots_disallow ?? false,
    jsRendering: q.js_rendering ?? 'DISABLED', scheme: q.scheme ?? 'https', startCrawlUrl: null,
    allow: paths(q.allow), disallow: paths(q.disallow), withSubfolder: Array.isArray(q.allow) && q.allow.length === 1,
    removedParameters: q.removed_parameters ?? [], excludedChecks: q.excluded_checks ?? [],
    authEnabled: q.auth_enabled ?? false, authUsername: q.auth_username ?? '', authPassword: q.auth_password ?? '', gaSettings: {}, gaStatus: '',
    webBotAuthEnabled: q.web_bot_auth_enabled ?? false, webBotAuthSignatureAgent: webBotAuth.signature_agent,
    webBotAuthSignatureInput: webBotAuth.signature_input, webBotAuthSignature: webBotAuth.signature,
  };
}

/** The JS Impact table and download share filters, but exports always include all matching pages. */
function auditJSImpactParameters(q: Query): Query {
  const parameters: Query = { sort: String(q.sort).toUpperCase(), page: q.page ?? 0, limit: q.limit ?? 100000 };
  if (Predicate.isString(q.query) && q.query.trim()) parameters.url = q.query;
  if (q.status !== 'all') parameters.changed = q.status === 'changed' ? 'true' : 'false';
  if (q.status === 'changed' && Array.isArray(q.parameters) && q.parameters.length) parameters.parameters = q.parameters.join(',');
  if ('format' in q) parameters.export = q.format ?? null;
  return parameters;
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
    if ('alert_id' in query) parameters.alert_id = query.alert_id ?? null;
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
