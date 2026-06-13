import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Playoffs — WC 2026 Pick\'em',
  description: 'Predict every knockout round from R32 to the Final.',
};

export default function PlayoffsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
