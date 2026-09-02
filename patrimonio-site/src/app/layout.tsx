import type { Metadata, Viewport } from 'next';
import { Barlow_Semi_Condensed, Public_Sans, IBM_Plex_Mono } from 'next/font/google';
import RegistrarServiceWorker from '@/components/RegistrarServiceWorker';
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
  description: 'Levantamento de bens patrimoniais — Estado de Rondônia',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: '/apple-touch-icon.png'
  }
};

export const viewport: Viewport = {
  themeColor: '#0E7C86'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <RegistrarServiceWorker />
        {children}
      </body>
    </html>
  );
}
