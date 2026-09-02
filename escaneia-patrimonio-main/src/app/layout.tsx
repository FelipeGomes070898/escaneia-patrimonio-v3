import type { Metadata } from 'next';
import { Barlow_Semi_Condensed, Public_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const display = Barlow_Semi_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display'
});
const body = Public_Sans({ subsets: ['latin'], variable: '--font-body' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Escaneia Patrimônio',
  description: 'Levantamento de bens patrimoniais — Estado de Rondônia'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
