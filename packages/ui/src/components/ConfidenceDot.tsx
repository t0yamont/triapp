import { cn } from '../cn.js';

/**
 * The confidence indicator (06-UX.md §2, §1): "the number and its confidence are
 * inseparable." Used everywhere a physiological number appears. Bands from 03-ALGORITHM §2.4.
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

export function confidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.5) return 'medium';
  if (confidence >= 0.3) return 'low';
  return 'none';
}

const DOT: Record<ConfidenceLevel, string> = {
  high: 'bg-confidence-high shadow-[0_0_8px_rgba(53,214,164,0.65)]',
  medium: 'bg-confidence-medium shadow-[0_0_8px_rgba(244,183,64,0.65)]',
  low: 'bg-confidence-low shadow-[0_0_8px_rgba(251,139,76,0.65)]',
  none: 'bg-confidence-none',
};

export function ConfidenceDot({ confidence, label }: { confidence: number; label: string }) {
  const level = confidenceLevel(confidence);
  return (
    <span className="inline-flex items-center gap-1.5 text-label text-muted">
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT[level])} aria-hidden />
      {label}
    </span>
  );
}
