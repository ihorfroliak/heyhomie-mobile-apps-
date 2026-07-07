/** Inventory — eco cleaning supplies stock, low-stock and reorder. Pure + tested. */
const round2 = (n: number) => Math.round(n * 100) / 100;

export type SupplyUnit = 'l' | 'pcs' | 'kg' | 'pack';

export interface SupplyItem {
    id: string;
    name: string;
    unit: SupplyUnit;
    stock: number;
    reorderLevel: number;
    unitCost: number; // PLN per unit
}

export const isLowStock = (i: SupplyItem): boolean => i.stock <= i.reorderLevel;

export const lowStockItems = (items: SupplyItem[]): SupplyItem[] => items.filter(isLowStock);

export const inventoryValue = (items: SupplyItem[]): number => round2(items.reduce((s, i) => s + i.stock * i.unitCost, 0));

export interface ReorderLine {
    id: string;
    name: string;
    suggestQty: number;
    cost: number;
}

/** Suggest reordering low items back up to 2× their reorder level. */
export function reorderList(items: SupplyItem[]): ReorderLine[] {
    return lowStockItems(items).map(i => {
        const suggestQty = Math.max(0, i.reorderLevel * 2 - i.stock);
        return { id: i.id, name: i.name, suggestQty, cost: round2(suggestQty * i.unitCost) };
    });
}

/** Target stock a reorder brings an item to (2× reorder level). */
export const restockTarget = (i: SupplyItem): number => i.reorderLevel * 2;

/** New item with stock changed by delta, never below zero. */
export const adjustStock = (i: SupplyItem, delta: number): SupplyItem => ({ ...i, stock: Math.max(0, round2(i.stock + delta)) });

/** New item restocked up to its target (no-op if already at/above target). */
export const restock = (i: SupplyItem): SupplyItem => ({ ...i, stock: Math.max(i.stock, restockTarget(i)) });

/** Replace one item in a list by id (returns a new array). */
export const replaceItem = (items: SupplyItem[], next: SupplyItem): SupplyItem[] => items.map(i => (i.id === next.id ? next : i));
