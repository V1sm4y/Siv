import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Geist, Geist_Mono } from 'next/font/google';
import { NO_FLASH_SCRIPT } from '@arena/ui';
import { Providers } from './providers';
import './globals.css';

// Condensed broadcast display face for titles and numerals; Geist for UI; Geist Mono for eyebrow labels.
// display:'optional' = never swap late (no layout shift, no LCP re-paint): the preloaded font is used if it
// arrives in time, otherwise the fallback stays for that view. Next cannot compute fallback metrics for this family.
const display = Big_Shoulders({ subsets: ['latin'], variable: '--font-display', display: 'optional', weight: ['700', '800', '900'] });
const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Arena OS', template: '%s · Arena OS' },
  description: 'The operating system for esports organisations: comms, practice, analysis, match day and contracts.',
  applicationName: 'Arena OS',
};
export const viewport: Viewport = { themeColor: '#0A0B0F', colorScheme: 'dark light' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only text-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-surface-3 focus:px-4 focus:py-3 focus:text-sm"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
