import { operationCount } from '@/lib/operation-count';
import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  metadataBase: new URL('https://semrush.micr.dev'),
  title: { default: 'semrush-cli', template: '%s | semrush-cli' },
  description: `${operationCount} Semrush research and account operations in your terminal and MCP clients. TypeScript, Effect, encrypted sessions with Galleton.`,
  icons: { icon: '/logo.svg' },
  openGraph: { images: ['/logo.svg'], title: 'semrush-cli', description: 'Semrush research. From your terminal.' },
};
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en" className="dark" suppressHydrationWarning><body><RootProvider theme={{ forcedTheme: 'dark', enabled: false }}>{children}</RootProvider></body></html>;
}
