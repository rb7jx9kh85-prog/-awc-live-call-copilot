import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AWC LIVE — Straight Line Copilot',
  description: 'Copilote commercial temps réel pour les cold calls Alpinia Web Craft.',
};

export const viewport: Viewport = {
  themeColor: '#07090c',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
