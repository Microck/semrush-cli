import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Schema } from 'effect';
import { expect } from 'vitest';

/** Native rules, event lists and confirmed event mutations share one authenticated endpoint. */
export function makeTrackingAlertsFixture() {
  const rules = new Map<string, { domain: string; condition: string; threshold: number; parameter: string; scope: string; id?: string }>();
  const events = new Map([
    ['900719925474099312345', { date: 1792094400, date_begin: 1792008000, date_end: 1792094400, is_read: 0 }],
    ['alert-2', { date: 1792094401, date_begin: 1792008000, date_end: 1792094401, is_read: 0 }],
  ]);
  return async (request: IncomingMessage, response: ServerResponse) => {
    expect(request.method).toBe('POST');
    expect(request.headers.cookie).toContain('session=authorized');
    expect(request.headers['content-type']).toBe('application/json');
    let encoded = '';
    for await (const chunk of request) encoded += chunk;
    const body = JSON.parse(encoded);
    expect(body.key).toBe('fixture-secret');
    expect(body).not.toHaveProperty('confirm');
    expect(body).not.toHaveProperty('dry_run');
    response.setHeader('Content-Type', 'application/json');
    if (body.campaign_id === '789_99') {
      response.end(JSON.stringify({ error_code: 403, error_message: 'fixture-secret: target is read-only' })); return;
    }
    expect(body.campaign_id).toBe('789_42');
    const respond = (reply: Schema.JsonObject) => response.end(JSON.stringify({ error_code: 0, ...reply }));
    switch (body.request_type) {
      case 'alert_list_read':
        expect(body.page).toBe(2); expect(body.display_limit).toBe(10);
        respond({ alert_ids: [...events].map(([alert_id, alert_body]) => ({ alert_id, trigger_id: 'rule-1', alert_body })) }); return;
      case 'alert_items_count': respond({ items_count: events.size, unread_items_count: [...events.values()].filter(event => event.is_read === 0).length }); return;
      case 'alert_read': {
        expect(Object.keys(body).sort()).toEqual(['alert_id', 'campaign_id', 'key', 'request_type']);
        const event = events.get(body.alert_id);
        if (!event) { respond({ error_code: 404, error_message: 'Alert not found' }); return; }
        event.is_read = 1; respond({ alert_id: body.alert_id, alert_body: event }); return;
      }
      case 'alert_mark_as_read':
        expect(Object.keys(body).sort()).toEqual(['campaign_id', 'key', 'request_type']);
        for (const event of events.values()) event.is_read = 1;
        respond({}); return;
      case 'alert_delete':
        expect(Object.keys(body).sort()).toEqual(['alert_id', 'campaign_id', 'key', 'request_type']);
        if (!events.delete(body.alert_id)) { respond({ error_code: 404, error_message: 'Alert not found' }); return; }
        respond({}); return;
      case 'trigger_list_read': respond({ trigger_ids: [...rules].map(([trigger_id, trigger_body]) => ({ trigger_id, trigger_body })) }); return;
      case 'trigger_items_count': respond({ items_count: rules.size }); return;
      case 'trigger_create':
        expect(body.trigger_body).toMatchObject({ domain: 'example.com', condition: 'enters_top', threshold: 10, parameter: 'position', scope: 'all' });
        rules.set('rule-1', body.trigger_body); respond({ trigger_id: 'rule-1' }); return;
      case 'trigger_update':
        expect(body.trigger_id).toBe('rule-1'); expect(body.trigger_body.id).toBe('rule-1');
        expect(rules.has(body.trigger_id)).toBe(true);
        rules.set(body.trigger_id, body.trigger_body); respond({}); return;
      case 'trigger_delete':
        expect(rules.delete(body.trigger_id)).toBe(true); respond({}); return;
      default: throw new Error('Unexpected tracking alert request type');
    }
  };
}
