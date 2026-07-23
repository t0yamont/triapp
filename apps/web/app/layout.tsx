import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'IronFlow',
  description: 'Adaptive endurance training, anchored to your measured physiological thresholds.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg font-sans text-body text-text antialiased">{children}</body>
    </html>
  );
}
