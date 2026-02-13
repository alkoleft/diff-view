import type { DiffNode, FieldRow, ParseResult, TableDiff, TableNode } from './types';
import { buildFieldRows, buildTableDiffs } from './diff';
import { collect, normalizeValue, parseJson } from './normalize';

export interface DiffInput {
  left: string | unknown;
  right: string | unknown;
}

export interface DiffResult {
  left: DiffNode | null;
  right: DiffNode | null;
  fields: FieldRow[];
  tables: TableDiff[];
  errors: string[];
}

export function buildDiff(input: DiffInput): DiffResult {
  const leftParsed = parseInput(input.left);
  const rightParsed = parseInput(input.right);

  const errors: string[] = [];
  if (leftParsed?.error) errors.push(`Левая версия: ${leftParsed.error}`);
  if (rightParsed?.error) errors.push(`Правая версия: ${rightParsed.error}`);

  const leftRoot = leftParsed?.node ?? null;
  const rightRoot = rightParsed?.node ?? null;

  const leftFields = new Map<string, unknown>();
  const rightFields = new Map<string, unknown>();
  const leftTables = new Map<string, TableNode>();
  const rightTables = new Map<string, TableNode>();

  if (leftRoot) collect(leftRoot, '', leftFields, leftTables);
  if (rightRoot) collect(rightRoot, '', rightFields, rightTables);

  return {
    left: leftRoot,
    right: rightRoot,
    fields: buildFieldRows(leftFields, rightFields),
    tables: buildTableDiffs(leftTables, rightTables),
    errors
  };
}

function parseInput(input: string | unknown): ParseResult | null {
  if (typeof input === 'string') return parseJson(input);
  if (input === null || input === undefined) return { node: null, error: null };
  return { node: normalizeValue(input), error: null };
}
