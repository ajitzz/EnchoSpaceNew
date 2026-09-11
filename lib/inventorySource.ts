export const inventorySources = ['unknown', 'encho_allocation', 'external_sync'] as const;
export function inventorySourceLabel(source: unknown): string {
  if (source === 'encho_allocation') return 'Inventory reserved for Encho';
  if (source === 'external_sync') return 'External calendar verification required';
  return 'Inventory source not confirmed';
}
export function validInventorySource(source: unknown): boolean {
  return source == null || inventorySources.includes(source as typeof inventorySources[number]);
}
