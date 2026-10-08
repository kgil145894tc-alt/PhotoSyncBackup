export type CatalogChange = {
  entity: 'service' | 'package';
  id: string;
  isActive: boolean;
  isArchived?: boolean;
};
type CatalogChangeListener = (change?: CatalogChange) => void;
const listeners = new Set<CatalogChangeListener>();

export function emitCatalogChanged(change?: CatalogChange) {
  listeners.forEach((listener) => listener(change));
}

export function subscribeToCatalogChanged(listener: CatalogChangeListener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
