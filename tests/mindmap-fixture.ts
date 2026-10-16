import type { IncomingMessage, ServerResponse } from 'node:http';
import { expect } from 'vitest';

// Valid 2x2 images keep the real browser download fixture small.
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAADklEQVR4nGP4CwYMEAoAUxIL3XOZJD8AAAAASUVORK5CYII=';
const jpg = '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYxLjE5LjEwMQD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABLAAEBAAAAAAAAAAAAAAAAAAAABwEBAAAAAAAAAAAAAAAAAAAAABABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAAIAAgMBIgACEQADEQD/2gAMAwEAAhEDEQA/AL+AD//Z';

/** Native-shaped controls create real data-URL downloads; the slow case exercises browser cancellation. */
export function makeMindmapFixture() {
  let scenario: 'complete' | 'denied' | 'slow' = 'complete';
  let started = () => {};
  let closed = () => {};
  let ready = Promise.resolve();
  let disconnected = Promise.resolve();
  return {
    bytes: (format: 'png' | 'jpg') => Buffer.from(format === 'png' ? png : jpg, 'base64'),
    use(value: typeof scenario) {
      scenario = value;
      ready = new Promise<void>(resolve => { started = resolve; });
      disconnected = new Promise<void>(resolve => { closed = resolve; });
    },
    ready: () => ready,
    disconnected: () => disconnected,
    async serve(request: IncomingMessage, response: ServerResponse, url: URL) {
      expect(request.method).toBe('GET'); expect(request.headers.cookie).toContain('session=authorized');
      if (url.pathname === '/mindmap-download') {
        response.once('close', () => closed());
        response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename=slow.png', 'Content-Length': 1048576 });
        response.write(Buffer.from(png, 'base64').subarray(0, 32)); started(); return;
      }
      expect(url.pathname).toBe('/analytics/keywordmanager/list');
      expect(Object.fromEntries(url.searchParams)).toEqual({ listId: '456/123', tab: '0' });
      if (scenario === 'denied') { response.writeHead(403); response.end('Strategy access denied'); return; }
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Set-Cookie', 'mindmap_rotation=retained; Path=/; HttpOnly; SameSite=Lax');
      response.end(`<!doctype html><button data-testid="export-mindmap-button" onclick="document.querySelector('#formats').hidden=false">Export</button>
        <div id="formats" hidden><button onclick="downloadImage('png')">PNG</button><button onclick="downloadImage('jpg')">JPG</button></div>
        <script>
          const images = ${JSON.stringify({ png, jpg })};
          function downloadImage(format) {
            const link = document.createElement('a');
            link.href = ${scenario === 'slow' ? "'/mindmap-download'" : "'data:image/' + (format === 'jpg' ? 'jpeg' : 'png') + ';base64,' + images[format]"};
            link.download = 'native mindmap.' + format;
            document.body.append(link); link.click(); link.remove();
          }
        </script>`);
    },
  };
}
