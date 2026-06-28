export const ROLLING_WORK_TYPES = [
  { code: 'GI_PIPE', label: 'GI Pipe' },
  { code: 'L_BENDING_1', label: 'L Bending (1)' },
  { code: 'ROLLING_2', label: 'Rolling (2)' },
  { code: 'FULL_LENGTH', label: 'Full Length' },
  { code: 'CIRCLE_BEND', label: 'Circle Bend' },
  { code: 'GATE_BEND_TWO_SIDE', label: 'Gate Bend Two Side' },
  { code: 'GATE_BEND_ONE_SIDE', label: 'Gate Bend One Side' },
  { code: 'FOR_LOTTERY', label: 'For Lottery (FR09)' },
] as const;

export type RollingWorkTypeCode = (typeof ROLLING_WORK_TYPES)[number]['code'];