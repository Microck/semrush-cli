import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';
export default function Layout({ children }: { children: ReactNode }) {
  return <DocsLayout tree={source.getPageTree()} nav={{ title: <img src="/logo-lockup-dark.svg" width="210" height="70" alt="semrush cli" />, url: '/' }} githubUrl="https://github.com/Microck/semrush-cli" themeSwitch={{ enabled: false }}>{children}</DocsLayout>;
}
