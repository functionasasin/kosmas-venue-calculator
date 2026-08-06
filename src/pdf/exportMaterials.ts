import type { Item } from '@/calculator/types'
import type { StoredLine } from '@/data/venueLines'

/**
 * Placeholder so Task 16's venue screen compiles. Task 17 replaces this file
 * with the real jsPDF exporter — same signature, so the call site is final.
 */
export function exportMaterialsPdf(
  _venueName: string,
  _lines: StoredLine[],
  _catalog: Item[],
): void {
  throw new Error('PDF export arrives in Task 17')
}
