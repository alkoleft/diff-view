import { cellTextFromRow } from './normalize';
import { partsToHtml } from './utils';
import type { DiffPart, Side, TableRowNode } from './types';

export function isNullCellValue(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const maybeNode = value as { kind?: string; value?: unknown };
  return maybeNode.kind === 'value' && maybeNode.value === null;
}

export function getCellInfo(row: TableRowNode | null, column: string): { text: string; isNull: boolean } {
  const cellValue = row?.cells?.[column];
  return {
    text: row ? cellTextFromRow(row, column) : '',
    isNull: isNullCellValue(cellValue)
  };
}

export function setTextContent(target: HTMLElement, text: string, isNull: boolean): void {
  target.textContent = isNull ? '' : text || '—';
}

export function applyDiffHtml(
  target: HTMLElement,
  parts: DiffPart[] | null,
  side: Side,
  fallbackText: string,
  isNull: boolean
): void {
  const html = partsToHtml(parts, side);
  if (html === null) {
    setTextContent(target, fallbackText, isNull);
    return;
  }
  target.innerHTML = html;
  if (isNull && target.innerHTML === '') target.textContent = '';
}
