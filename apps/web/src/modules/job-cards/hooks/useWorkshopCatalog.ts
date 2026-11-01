import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import { queryKeys } from '@/shared/api/query-keys';
import type { CoilOption } from '@/modules/roofing/hooks/useRoofing';

export interface WorkshopCoilOption extends CoilOption {
  /** Catalogue name ("CN 0.35mm Blue coil"), saved as the Coil Cutting material */
  name: string;
}

export interface WorkshopMaterialStock {
  item_id: string;
  material_type: string;
  thickness: string;
  unit: string;
  /** On hand minus what open orders hold */
  available: number;
}

export interface WorkshopCatalog {
  materials: WorkshopMaterialStock[];
  coils: WorkshopCoilOption[];
  override_allowed: boolean;
}

/**
 * The job card form's inventory data in one call: sheet stock (shortage warning), coils
 * (Coil Cutting) and the override switch. Loaded once; the live "stock" topic refreshes
 * it (it sits under ['items']), so typing never calls the API (Docs/decisions/0009).
 */
export function useWorkshopCatalog() {
  return useQuery({
    queryKey: queryKeys.items.workshopCatalog(),
    queryFn: async () => (await apiClient.get<{ data: WorkshopCatalog }>('/items/workshop-catalog')).data.data,
    staleTime: Infinity,
  });
}
