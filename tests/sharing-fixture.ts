import type { IncomingMessage, ServerResponse } from 'node:http';
import { text } from 'node:stream/consumers';
import { expect } from 'vitest';

interface Share { email: string; role: string; share_id: string; is_free: boolean; }
interface StoredShare extends Share { scope: string; }
interface SharePage { list: Omit<Share, 'role'>[]; offset: number; total: number; }

/** Native SharingModal arrays and envelopes, served through authenticated HTTP. */
export function makeSharingFixture() {
  let shares: StoredShare[] = [];
  let writes = 0;
  let scenario = '';
  const reset = (nextScenario = '') => { shares = []; writes = 0; scenario = nextScenario; };
  const serve = async (request: IncomingMessage, response: ServerResponse, url: URL) => {
    expect(request.headers.cookie).toContain('session=authorized');
    response.setHeader('Content-Type', 'application/json');
    const send = (data: SharePage | null) => response.end(JSON.stringify({ is_success: true, errors: null, data }));
    const denied = () => response.end(JSON.stringify({ is_success: false, errors: ['Sharing access denied'], data: null }));
    const path = url.pathname;
    if (request.method === 'GET') {
      expect(path).toMatch(/^\/share\/json\/shares\/(?:project-smb\/9223372036854775807|report\/71)$/);
      const scope = path.split('/').at(-2);
      const list = shares.filter(entry => entry.scope === scope).map(({ scope: _scope, ...entry }) => entry);
      expect([...url.searchParams]).toEqual([]);
      send({ list, offset: 0, total: list.length }); return;
    }
    expect(request.method).toBe('POST');
    expect(request.headers['content-type']).toContain('application/json');
    writes++;
    if (scenario === 'denied') { denied(); return; }
    const body: unknown = JSON.parse(await text(request));
    if (path.startsWith('/share/json/share/')) {
      const scope = path.split('/').at(-1) ?? '';
      expect(['project-smb', 'report']).toContain(scope);
      const report = scope === 'report';
      expect(body).toEqual([{ email: 'recipient@example.com', object_id: report ? '71' : '9223372036854775807', role: 'viewer' }]);
      const created = { scope, email: 'recipient@example.com', role: 'viewer', share_id: report ? '0123456789abcdef01234568' : '0123456789abcdef01234567', is_free: true };
      shares.push(created);
      if (scenario === 'create-lost') { request.socket.destroy(); return; }
      if (scenario === 'receipt-missing') { response.end(JSON.stringify({ is_success: true })); return; }
      if (scenario === 'receipt-partial') { send({ list: [], offset: 0, total: 0 }); return; }
      const { scope: _scope, role: _role, ...receipt } = created;
      send({ list: [receipt], offset: 0, total: 1 }); return;
    }
    const selected = shares.filter(entry => Array.isArray(body) && body.includes(entry.share_id));
    expect(selected).toHaveLength(1);
    expect(body).toEqual(selected.map(entry => entry.share_id));
    if (path.startsWith('/share/json/set-role/')) {
      const role = path.split('/').at(-1);
      expect(role).toBe('editor');
      shares = shares.map(entry => selected.includes(entry) ? { ...entry, role: 'editor' } : entry);
      send(null); return;
    }
    expect(path).toBe('/share/json/stop-sharing');
    shares = shares.filter(entry => !selected.includes(entry));
    send(null);
  };
  return { serve, reset, writes: () => writes };
}
