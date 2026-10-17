import type { IncomingMessage, ServerResponse } from 'node:http';
import { text as readText } from 'node:stream/consumers';
import { expect } from 'vitest';
import { Schema } from 'effect';

export const auditAuthPath = '/siteaudit/api/campaigns/791';
interface Headers { readonly webBotAuthSignatureAgent: string; readonly webBotAuthSignatureInput: string; readonly webBotAuthSignature: string; }
interface AuditInfo {
  readonly id: number; readonly status: string; readonly projectDomain: string;
  authEnabled?: boolean; readonly webBotAuthEnabled: boolean; readonly gaSettings: null;
  webBotAuthSignatureAgent?: string | null; webBotAuthSignatureInput?: string | null; webBotAuthSignature?: string | null;
}
const settings = Schema.Struct({
  domain: Schema.Literal('example.com'), pageLimit: Schema.Literal(10), scheduleDay: Schema.Literal(0), notify: Schema.Literal(false),
  authEnabled: Schema.Boolean, webBotAuthEnabled: Schema.Boolean,
  webBotAuthSignatureAgent: Schema.String, webBotAuthSignatureInput: Schema.String, webBotAuthSignature: Schema.String,
});

/** Stateful native HTTP settings: blank Signature retains it, but Agent/Input must survive the replacement. */
export function makeWebBotAuthFixture() {
  let configured = false;
  let basic = false;
  let headers: Headers | undefined;
  let reject = false;
  let metadata: 'complete' | 'headers_missing' | 'auth_missing' = 'complete';
  let saves = 0;
  const info = () => {
    const value: AuditInfo = { id: 791, status: 'FINISHED', projectDomain: 'example.com',
      authEnabled: basic, webBotAuthEnabled: headers !== undefined, gaSettings: null,
      webBotAuthSignatureAgent: null, webBotAuthSignatureInput: null, webBotAuthSignature: null, ...headers };
    if (metadata === 'headers_missing') delete value.webBotAuthSignatureInput;
    if (metadata === 'auth_missing') delete value.authEnabled;
    return value;
  };
  return {
    reset() { configured = false; basic = false; headers = undefined; reject = false; metadata = 'complete'; saves = 0; },
    campaigns: () => configured ? [{ id: 791 }] : [],
    state: () => ({ configured, basic, headers: headers && { ...headers }, saves }),
    basicAuth(value: boolean) { basic = value; },
    rejectSave(value: boolean) { reject = value; },
    metadata(value: typeof metadata) { metadata = value; },
    async serve(request: IncomingMessage, response: ServerResponse, url: URL) {
      expect(request.headers.cookie).toContain('session=authorized');
      expect(url.searchParams.get('key')).toBe('fixture-secret');
      response.setHeader('Content-Type', 'application/json');
      if (url.pathname === auditAuthPath + '/info') {
        expect(request.method).toBe('GET'); response.end(JSON.stringify(info())); return;
      }
      expect(url.pathname).toBe(auditAuthPath + '/save'); expect(request.method).toBe('POST');
      const raw = JSON.parse(await readText(request)); expect(raw).not.toHaveProperty('confirm');
      const body = Schema.decodeUnknownSync(settings)(raw);
      if (reject) {
        response.end(JSON.stringify({ error: { message: [body.webBotAuthSignatureAgent, body.webBotAuthSignatureInput, body.webBotAuthSignature].join(' ') } })); return;
      }
      if (!body.webBotAuthEnabled) headers = undefined;
      else if (body.webBotAuthSignature) headers = { webBotAuthSignatureAgent: body.webBotAuthSignatureAgent,
        webBotAuthSignatureInput: body.webBotAuthSignatureInput, webBotAuthSignature: body.webBotAuthSignature };
      else {
        expect(headers).toBeDefined();
        expect(body.webBotAuthSignatureAgent).toBe(headers?.webBotAuthSignatureAgent);
        expect(body.webBotAuthSignatureInput).toBe(headers?.webBotAuthSignatureInput);
      }
      basic = body.authEnabled; configured = true; saves++;
      response.end(JSON.stringify({ ...info(), echo: [body.webBotAuthSignatureAgent, body.webBotAuthSignatureInput, body.webBotAuthSignature] }));
    },
  };
}
