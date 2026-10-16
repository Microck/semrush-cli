import type { IncomingMessage, ServerResponse } from 'node:http';
import { expect } from 'vitest';

/** Stateful native wizard and target deletion contracts, including a sibling target. */
export function makeTrackingTargetsFixture() {
  const state = {
    enabled: false, editable: true, malformed: false, deleted: false, writes: 0,
    device: 'desktop', language: 'en', engine: 'google', location: 2840,
    keywords: [{ keyword: 'example domain', tags: ['owned tag'] }, { keyword: 'example', tags: [] }],
  };
  const serve = async (request: IncomingMessage, response: ServerResponse, url: URL) => {
    if (!state.enabled) return false;
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname.endsWith('/info')) {
      response.end(JSON.stringify({ status: 'ok', data: { can_edit: state.editable,
        campaign_settings: { title: 'Owned target', tracking_url: 'example.com', tracking_url_type: 'rootdomain',
          business_name: 'owned business', brands: ['owned brand'], weekly_notification: false,
          targeting: { engine: state.engine, device: state.device, language: state.language } },
        location: { id: state.location }, filters: { volume_type: 'national' },
      } })); return true;
    }
    if (url.pathname === '/tracking/hashes') {
      expect(url.searchParams.get('id')).toBe('789_42');
      response.end(JSON.stringify({ info: state.malformed ? {} : {
        campaign_create: { hash: 'fixture-replace-capability', random: 7 },
        add_keywords: { hash: 'fixture-delete-capability', random: 8 },
      } })); return true;
    }
    if (url.pathname.endsWith('/keywords')) {
      expect(request.method).toBe('GET');
      response.end(JSON.stringify({ status: 'ok', data: state.keywords })); return true;
    }
    if (url.pathname === '/positions/api/replace_target') {
      expect(request.method).toBe('POST'); expect(url.searchParams.get('key')).toBe('fixture-secret');
      let encoded = ''; for await (const chunk of request) encoded += chunk;
      const payload = JSON.parse(encoded);
      expect(payload).toMatchObject({ id: '789_42', title: 'Owned target', key: 'fixture-secret',
        display_hash: 'fixture-replace-capability', rnd: 7, businessName: 'owned business', brands: ['owned brand'],
        trackingUrl: 'example.com', trackingUrlType: 'rootdomain', weekly_notification: false, volume_type: 'national',
        keywords: ['example domain', 'example'], tags: { 'example domain': ['owned tag'] }, timezone: 0,
      });
      state.device = payload.device_group; state.engine = payload.engine;
      state.language = payload.language_code; state.location = payload.location_id; state.writes++;
      response.end(JSON.stringify({ status: 'SUCCESS', result: { id: '789_43' },
        diagnostic: 'accepted fixture-replace-capability' })); return true;
    }
    if (url.pathname === '/positions/api/targets/789_42') {
      expect(request.method).toBe('DELETE'); expect(url.searchParams.get('key')).toBe('fixture-secret');
      expect(url.searchParams.get('display_hash')).toBe('fixture-delete-capability'); expect(url.searchParams.get('rnd')).toBe('8');
      expect(url.searchParams.has('campaign_id')).toBe(false);
      let encoded = ''; for await (const chunk of request) encoded += chunk; expect(encoded).toBe('');
      state.deleted = true; state.writes++;
      response.end(JSON.stringify({ status: 'SUCCESS', targets: ['789_99'], diagnostic: 'accepted fixture-delete-capability' })); return true;
    }
    return false;
  };
  return { state, serve };
}
