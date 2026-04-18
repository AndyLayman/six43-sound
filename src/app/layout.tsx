import type { Metadata, Viewport } from 'next';
import { Montserrat } from 'next/font/google';
import { AudioProvider } from '@/hooks/use-audio';
import { ServiceWorkerRegistration } from './sw-register';
import './globals.css';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300'],
  variable: '--font',
});

export const metadata: Metadata = {
  title: 'Soundboard',
  manifest: '/manifest.json',
  icons: [
    { rel: 'icon', url: '/Favicon.png', type: 'image/png' },
    { rel: 'apple-touch-icon', url: '/Sound-128-128.png' },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Soundboard',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#181818',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" style={{ background: '#111111' }}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/iconoir@7/css/iconoir.css"
        />
      </head>
      <body className={montserrat.variable}>
        <ServiceWorkerRegistration />
        <AudioProvider>{children}</AudioProvider>
      </body>
    </html>
  );
}
