import { describe, expect, it } from 'vitest';
import type { TableRowNode, ValueNode } from './types';
import { applyDiffHtml, getCellInfo, isNullCellValue, setTextContent } from './render-helpers';

function valueNode(value: unknown): ValueNode {
  return { kind: 'value', value };
}

function row(id: string, cells: Record<string, unknown>): TableRowNode {
  var normalizedCells: Record<string, ValueNode> = {};
  Object.keys(cells).forEach(function (key) {
    normalizedCells[key] = valueNode(cells[key]);
  });

  return {
    id,
    displayId: id,
    cells: normalizedCells,
    hasExplicitId: true
  };
}

function el(initialText: string = ''): HTMLElement {
  return { innerHTML: '', textContent: initialText } as unknown as HTMLElement;
}

describe('render helpers', function () {
  it('detects explicit null value nodes', function () {
    expect(isNullCellValue(null)).toBe(true);
    expect(isNullCellValue(valueNode(null))).toBe(true);
    expect(isNullCellValue(valueNode(0))).toBe(false);
    expect(isNullCellValue(0)).toBe(false);
  });

  it('extracts cell info with null flag', function () {
    var left = row('1', { a: null, b: 'x' });
    var infoA = getCellInfo(left, 'a');
    var infoB = getCellInfo(left, 'b');

    expect(infoA.text).toBe('');
    expect(infoA.isNull).toBe(true);
    expect(infoB.text).toBe('x');
    expect(infoB.isNull).toBe(false);
  });

  it('sets text content with null and empty fallback', function () {
    var node = el();
    setTextContent(node, 'x', true);
    expect(node.textContent).toBe('');

    setTextContent(node, '', false);
    expect(node.textContent).toBe('—');

    setTextContent(node, 'ok', false);
    expect(node.textContent).toBe('ok');
  });

  it('applies diff html or falls back to text', function () {
    var node = el();
    applyDiffHtml(node, null, 'left', 'fallback', false);
    expect(node.textContent).toBe('fallback');

    var parts = [{ type: 'eq', value: 'A' }, { type: 'add', value: 'B' }] as const;
    applyDiffHtml(node, parts, 'left', 'ignored', false);
    expect(node.innerHTML).toBe('A');

    applyDiffHtml(node, parts, 'right', 'ignored', false);
    expect(node.innerHTML).toBe('A<span class="diff-add">B</span>');
  });

  it('clears text when diff html is empty for null values', function () {
    var node = el('stale');
    var parts = [{ type: 'add', value: 'X' }] as const;
    applyDiffHtml(node, parts, 'left', 'ignored', true);
    expect(node.textContent).toBe('');
  });
});
