import type { ReactNode } from 'react';
import { swatchFor } from '@/shared/lib/tones';

/** Monospace document number chip (prototype IdChip), e.g. #GP-00012. */
export function IdChip({ children, tone = '#0033A0' }: { children: ReactNode; tone?: string }) {
  return (
    <span className="id-chip" style={{ ['--scan' as string]: tone }}>
      {children}
    </span>
  );
}

/** Small swatch for a material/coil colour name. */
export function ColorDot({ color }: { color?: string | null }) {
  const hex = swatchFor(color);
  if (!hex || !color) return null;
  return <span className="color-dot" style={{ background: hex }} />;
}
