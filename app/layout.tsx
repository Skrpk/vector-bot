import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Зоряна карта',
  description:
    'Створіть персональну зоряну карту — небо саме таким, яким воно було у певну дату й у певному місці.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0a0e1a',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="uk" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
