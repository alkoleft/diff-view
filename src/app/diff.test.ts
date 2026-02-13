import { describe, expect, it } from 'vitest';
import type { TableNode, TableRowNode, ValueNode } from './types';
import { buildFieldRows, buildTableDiffs, countStatuses, getDiffOptions, resetDiffOptions, setDiffOptions } from './diff';
import { buildDiff } from './pipeline';

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

function table(name: string, columns: string[], rows: TableRowNode[]): TableNode {
  return {
    kind: 'table',
    name,
    columns,
    rows,
    hasExplicitIds: true
  };
}

describe('buildFieldRows', function () {
  it('computes added/removed/changed/unchanged and sorts by key', function () {
    var left = new Map<string, unknown>([
      ['a', 1],
      ['b', { x: 1 }],
      ['d', 'same']
    ]);
    var right = new Map<string, unknown>([
      ['b', { x: 2 }],
      ['c', true],
      ['d', 'same']
    ]);

    var rows = buildFieldRows(left, right);

    expect(rows.map(function (row) { return row.key; })).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.find(function (row) { return row.key === 'a'; })?.status).toBe('removed');
    expect(rows.find(function (row) { return row.key === 'b'; })?.status).toBe('changed');
    expect(rows.find(function (row) { return row.key === 'c'; })?.status).toBe('added');
    expect(rows.find(function (row) { return row.key === 'd'; })?.status).toBe('unchanged');
  });
});

describe('buildTableDiffs', function () {
  it('aligns rows and marks unchanged/changed/added/removed', function () {
    var columns = ['name', 'value'];
    var leftTable = table('Тест', columns, [
      row('1', { name: 'alpha', value: 1 }),
      row('2', { name: 'beta', value: 1 }),
      row('3', { name: 'left-only', value: 'x' })
    ]);
    var rightTable = table('Тест', columns, [
      row('1', { name: 'alpha', value: 1 }),
      row('2', { name: 'beta', value: 2 }),
      row('4', { name: 'right-only', value: 'y' })
    ]);

    var diffs = buildTableDiffs(
      new Map([['ROOT', leftTable]]),
      new Map([['ROOT', rightTable]])
    );

    expect(diffs).toHaveLength(1);
    var rows = diffs[0].rows;
    var statuses = rows.map(function (r) { return r.status; });

    expect(statuses).toContain('unchanged');
    expect(statuses).toContain('changed');
    expect(statuses).toContain('removed');
    expect(statuses).toContain('added');

    var counts = countStatuses(rows);
    expect(counts.unchanged).toBe(1);
    expect(counts.changed).toBe(1);
    expect(counts.removed).toBe(1);
    expect(counts.added).toBe(1);
    expect(counts.moved).toBe(0);
  });

  it('falls back to id-based alignment for large matrices', function () {
    var columns = ['name'];
    var leftRows: TableRowNode[] = [];
    var rightRows: TableRowNode[] = [];

    for (let i = 1; i <= 230; i += 1) {
      leftRows.push(row(String(i), { name: `row-${i}` }));
      rightRows.push(row(String(i), { name: `row-${i}` }));
    }

    rightRows[5] = row('6', { name: 'changed' });

    var diffs = buildTableDiffs(
      new Map([['ROOT', table('Big', columns, leftRows)]]),
      new Map([['ROOT', table('Big', columns, rightRows)]])
    );

    expect(diffs[0].rows).toHaveLength(230);
    var counts = countStatuses(diffs[0].rows);
    expect(counts.unchanged).toBe(229);
    expect(counts.changed).toBe(1);
    expect(counts.moved).toBe(0);
  });

  it('allows tuning fallback threshold via options', function () {
    var previous = getDiffOptions();
    setDiffOptions({ maxAlignCells: 1 });

    var columns = ['name'];
    var leftRows = [row('1', { name: 'alpha' }), row('2', { name: 'beta' })];
    var rightRows = [row('1', { name: 'alpha' }), row('2', { name: 'beta' })];

    var diffs = buildTableDiffs(
      new Map([['ROOT', table('Small', columns, leftRows)]]),
      new Map([['ROOT', table('Small', columns, rightRows)]])
    );

    expect(diffs[0].rows[0].groupId).toBe('fallback-0');
    resetDiffOptions();
    expect(getDiffOptions()).toEqual(previous);
  });
});

describe('buildDiff (pipeline)', function () {
  it('computes errors for invalid JSON inputs', function () {
    var result = buildDiff({ left: '{', right: '{ "ok": true }' });

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/Левая версия/);
    expect(result.fields).toHaveLength(1);
  });

  it('computes diffs from JSON strings', function () {
    var left = JSON.stringify({ a: 1, b: 2 });
    var right = JSON.stringify({ a: 1, b: 3, c: 4 });

    var result = buildDiff({ left, right });

    var byKey = new Map(result.fields.map(function (row) { return [row.key, row.status]; }));
    expect(byKey.get('a')).toBe('unchanged');
    expect(byKey.get('b')).toBe('changed');
    expect(byKey.get('c')).toBe('added');
    expect(result.errors).toHaveLength(0);
  });

  it('accepts non-string inputs and normalizes them', function () {
    var left = { a: 1, table: { type: 'table', columns: ['x'], rows: [{ id: 1, x: 10 }] } };
    var right = { a: 2, table: { type: 'table', columns: ['x'], rows: [{ id: 1, x: 10 }, { id: 2, x: 20 }] } };

    var result = buildDiff({ left, right });

    expect(result.errors).toHaveLength(0);
    var byKey = new Map(result.fields.map(function (row) { return [row.key, row.status]; }));
    expect(byKey.get('a')).toBe('changed');

    expect(result.tables).toHaveLength(1);
    var table = result.tables[0];
    var statuses = table.rows.map(function (row) { return row.status; });
    expect(statuses).toContain('unchanged');
    expect(statuses).toContain('added');
  });
});

describe('moved rows detection', function () {
  it('detects moved rows based on similarity', function () {
    var columns = ['name'];
    var leftTable = table('Move', columns, [
      row('1', { name: 'alpha' }),
      row('2', { name: 'beta' }),
      row('3', { name: 'gamma' })
    ]);
    var rightTable = table('Move', columns, [
      row('2', { name: 'beta' }),
      row('1', { name: 'alpha' }),
      row('3', { name: 'gamma' })
    ]);

    var diffs = buildTableDiffs(
      new Map([['ROOT', leftTable]]),
      new Map([['ROOT', rightTable]])
    );

    var counts = countStatuses(diffs[0].rows);
    expect(counts.moved).toBe(1);
    expect(counts.added).toBe(0);
    expect(counts.removed).toBe(0);
  });
});
