import { ItemRequestStatus, ItemType } from '../enums/inventory.enums';

// New catalogue products (Docs/decisions/0013).

export const ITEM_REQUEST_STATUS_LABEL: Record<ItemRequestStatus, string> = {
  PENDING: 'Waiting for approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const norm = (v: string | undefined) => (v ?? '').trim().toLowerCase();

/**
 * What makes two active items the same product to pricing: sheets are looked up by
 * material + thickness, coils by origin + thickness + colour. A second item with the same
 * key would silently replace the first in the price lookup, so it is refused.
 * Hardware has no key; its name must be unique instead.
 */
export function itemDuplicateKey(itemType: ItemType, attributes: Record<string, string | undefined>): string | null {
  if (itemType === ItemType.MATERIAL) return `${norm(attributes.material_type)}|${norm(attributes.thickness)}`;
  if (itemType === ItemType.COIL) return `${norm(attributes.origin)}|${norm(attributes.thickness)}|${norm(attributes.color)}`;
  return null;
}
