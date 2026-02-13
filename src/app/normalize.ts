import type { DiffNode, ParseResult, StructureNode, TableNode, TableRowNode, ValueNode } from './types';
import { shorten } from './utils';

export function parseJson(text: string): ParseResult | null {
  if (!text.trim()) return null;
  try {
    const obj = JSON.parse(text) as unknown;
    return { node: normalizeValue(obj), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка JSON';
    console.warn(`Ошибка JSON: ${message}`);
    return { node: null, error: message };
  }
}

export function normalizeValue(value: unknown): DiffNode {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.type === 'table') return normalizeTable(record);

    if (record.type === 'structure') {
      const fieldsRaw = (record.fields ?? {}) as Record<string, unknown>;
      const normalizedFields: Record<string, DiffNode> = {};
      Object.keys(fieldsRaw).forEach((key) => {
        normalizedFields[key] = normalizeValue(fieldsRaw[key]);
      });
      return { kind: 'structure', fields: normalizedFields } satisfies StructureNode;
    }

    if (Array.isArray(value)) return { kind: 'value', value } satisfies ValueNode;

    const normalizedFields: Record<string, DiffNode> = {};
    Object.keys(record).forEach((key) => {
      normalizedFields[key] = normalizeValue(record[key]);
    });
    return { kind: 'structure', fields: normalizedFields } satisfies StructureNode;
  }

  return { kind: 'value', value } satisfies ValueNode;
}

function normalizeTable(value: Record<string, unknown>): TableNode {
  const columns = Array.isArray(value.columns)
    ? value.columns.filter((item): item is string => typeof item === 'string')
    : [];

  const rows = Array.isArray(value.rows) ? value.rows : [];
  const normalizedRows = rows.map((row, index) => normalizeRow(row, index, columns));

  if (!columns.length) {
    const seen = new Set<string>();
    normalizedRows.forEach((row) => {
      Object.keys(row.cells).forEach((column) => {
        if (!seen.has(column)) {
          seen.add(column);
          columns.push(column);
        }
      });
    });
  }

  const name =
    typeof value.name === 'string'
      ? value.name
      : typeof value.title === 'string'
        ? value.title
        : null;

  return {
    kind: 'table',
    columns,
    rows: normalizedRows,
    name,
    hasExplicitIds: normalizedRows.some((row) => row.hasExplicitId)
  } satisfies TableNode;
}

function normalizeRow(value: unknown, index: number, columns: string[]): TableRowNode {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  const hasExplicitId = Boolean(row && (row.id !== undefined || row.$id !== undefined || row.key !== undefined));

  const displayId = hasExplicitId
    ? String(row?.id ?? row?.$id ?? row?.key)
    : String(index + 1);

  let cells: unknown = row?.cells ?? row?.values ?? row;
  if (Array.isArray(cells)) {
    const values = cells;
    const mapped: Record<string, unknown> = {};
    columns.forEach((column, idx) => {
      mapped[column] = values[idx];
    });
    cells = mapped;
  }

  const normalizedCells: Record<string, DiffNode> = {};
  if (cells && typeof cells === 'object') {
    Object.keys(cells as Record<string, unknown>).forEach((key) => {
      normalizedCells[key] = normalizeValue((cells as Record<string, unknown>)[key]);
    });
  }

  return {
    id: displayId,
    displayId,
    cells: normalizedCells,
    hasExplicitId
  };
}

export function stringifyValue(node: DiffNode | null | undefined): string {
  if (!node) return '';

  if (node.kind === 'value') {
    if (node.value === null || node.value === undefined) return '';
    if (typeof node.value === 'string') return node.value;
    return String(node.value);
  }

  if (node.kind === 'table') return `[table ${node.rows.length}x${node.columns.length}]`;

  if (node.kind === 'structure') return shorten(JSON.stringify(nodeToPlain(node)), 200);

  return shorten(JSON.stringify(node), 200);
}

function nodeToPlain(node: DiffNode | unknown): unknown {
  if (!node || typeof node !== 'object') return node;

  const normalized = node as DiffNode;
  if (normalized.kind === 'value') return normalized.value;

  if (normalized.kind === 'table') {
    return {
      type: 'table',
      columns: normalized.columns,
      rows: normalized.rows.map((row) => {
        const cells: Record<string, unknown> = {};
        Object.keys(row.cells).forEach((key) => {
          cells[key] = nodeToPlain(row.cells[key]);
        });
        return { id: row.id, cells };
      })
    };
  }

  if (normalized.kind === 'structure') {
    const out: Record<string, unknown> = {};
    Object.keys(normalized.fields).forEach((key) => {
      out[key] = nodeToPlain(normalized.fields[key]);
    });
    return out;
  }

  return normalized;
}

export function cellTextFromRow(row: TableRowNode | null | undefined, column: string): string {
  if (!row?.cells) return '';
  if (!row.__cellCache) row.__cellCache = {};
  if (row.__cellCache[column] !== undefined) return row.__cellCache[column];
  const value = row.cells[column];

  let text: string;
  if (value && typeof value === 'object') {
    const maybeNode = value as Partial<DiffNode>;
    if (typeof maybeNode.kind === 'string') {
      text = stringifyValue(value as DiffNode);
    } else {
      try {
        text = JSON.stringify(value);
      } catch {
        text = String(value);
      }
    }
  } else if (value === null || value === undefined) {
    text = '';
  } else {
    text = String(value);
  }

  row.__cellCache[column] = text;
  return text;
}

export function collect(
  node: DiffNode | null,
  path: string,
  accFields: Map<string, unknown>,
  accTables: Map<string, TableNode>
): void {
  if (!node) return;

  if (node.kind === 'structure') {
    Object.keys(node.fields).forEach((name) => {
      const nextPath = path ? `${path}.${name}` : name;
      const child = node.fields[name];
      if (child.kind === 'table') accTables.set(nextPath, child);
      else if (child.kind === 'structure') collect(child, nextPath, accFields, accTables);
      else accFields.set(nextPath, child.value);
    });
    return;
  }

  if (node.kind === 'table') {
    accTables.set(path || 'ROOT', node);
    return;
  }

  accFields.set(path || 'ROOT', node.value);
}
