export type CutBendSpec = {
  model: 'CUT_BEND';
  material_label: string;
  thickness_mm?: number;
  gauge_size?: string;
  length_m?: number;
  sheet_cuts?: number;
  sheet_pieces?: number;
};

export type RollingSpec = {
  model: 'ROLLING';
  material_type: string;
  work_type: string;
  size: string;
};

export type CoilCutSpec = {
  model: 'COIL_CUT';
  weight_kg: number;
};

export type WorkOrderSpec = CutBendSpec | RollingSpec | CoilCutSpec;