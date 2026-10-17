import type { IncomingMessage, ServerResponse } from 'node:http';
import { text } from 'node:stream/consumers';
import { expect } from 'vitest';

interface Share { email: string; role: string; share_id: string; is_free: boolean; }
interface SharePage { list: Omit<Share, 'role'>[]; offset: number; total: number; }

/** Native SharingModal arrays and envelopes, served through authenticated HTTP. */
export function makeProjectSharingFixture() {
  let shares: Share[] = [];
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
      expect(path).toBe('/share/json/shares/project-smb/9223372036854775807');
      expect([...url.searchParams]).toEqual([]);
      send({ list: shares, offset: 0, total: shares.length }); return;
    }
    expect(request.method).toBe('POST');
    expect(request.headers['content-type']).toContain('application/json');
    writes++;
    if (scenario === 'denied') { denied(); return; }
    const body: unknown = JSON.parse(await text(request));
    if (path === '/share/json/share/project-smb') {
      expect(body).toEqual([{ email: 'recipient@example.com', object_id: '9223372036854775807', role: 'viewer' }]);
      shares.push({ email: 'recipient@example.com', role: 'viewer', share_id: '0123456789abcdef01234567', is_free: true });
      if (scenario === 'create-lost') { request.socket.destroy(); return; }
      if (scenario === 'receipt-missing') { response.end(JSON.stringify({ is_success: true })); return; }
      if (scenario === 'receipt-partial') { send({ list: [], offset: 0, total: 0 }); return; }
      send({ list: shares.map(({ role: _role, ...entry }) => entry), offset: 0, total: shares.length }); return;
    }
    expect(body).toEqual(['0123456789abcdef01234567']);
    if (path.startsWith('/share/json/set-role/')) {
      const role = path.split('/').at(-1);
      expect(role).toBe('editor');
      shares = shares.map(entry => ({ ...entry, role: 'editor' }));
      send(null); return;
    }
    expect(path).toBe('/share/json/stop-sharing');
    shares = [];
    send(null);
  };
  return { serve, reset, writes: () => writes };
}
