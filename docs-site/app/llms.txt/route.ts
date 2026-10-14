import { source } from '@/lib/source';
export function GET() {
  return new Response('# semrush-cli\n\nTypeScript + Effect CLI and MCP for 62 authenticated Semrush research and project operations. Sessions stored in Galleton.\n\n' + source.getPages().map(page => `- [${page.data.title}](https://semrush.micr.dev${page.url}): ${page.data.description ?? ''}`).join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
