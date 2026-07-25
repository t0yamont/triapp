import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AuroraBackground } from '../components/AuroraBackground';
import { currentClimate } from '../lib/today-demo';

export const metadata: Metadata = {
  title: 'TriFlow',
  description: 'Adaptive endurance training, anchored to your measured physiological thresholds.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans text-body text-text antialiased">
        <AuroraBackground climate={currentClimate()} />
        {children}
      </body>
    </html>
  );
}
