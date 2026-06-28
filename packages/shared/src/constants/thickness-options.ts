export const THICKNESS_MM_OPTIONS = [6, 5, 4.5, 4, 3, 2.5, 2] as const;

export const GAUGE_OPTIONS = ['16', '18', '19', '20', '22', '23', '24'] as const;

export type ThicknessMm = (typeof THICKNESS_MM_OPTIONS)[number];
export type GaugeSize = (typeof GAUGE_OPTIONS)[number];