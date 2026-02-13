export type DiffPartType = 'eq' | 'add' | 'del';

export interface DiffPart {
  type: DiffPartType;
  value: string;
}

export type Side = 'left' | 'right';

export enum DiffStatus {
  Unchanged = 'unchanged',
  Added = 'added',
  Removed = 'removed',
  Changed = 'changed',
  Moved = 'moved'
}

export interface ValueNode {
  kind: 'value';
  value: unknown;
}

export interface StructureNode {
  kind: 'structure';
  fields: Record<string, DiffNode>;
}

export interface TableRowNode {
  id: string;
  displayId: string;
  cells: Record<string, DiffNode>;
  hasExplicitId: boolean;
  __sigCache?: Record<string, string>;
  __cellCache?: Record<string, string>;
}

export interface TableNode {
  kind: 'table';
  columns: string[];
  rows: TableRowNode[];
  name: string | null;
  hasExplicitIds: boolean;
}

export type DiffNode = ValueNode | StructureNode | TableNode;

export interface ParseResult {
  node: DiffNode | null;
  error: string | null;
}

export interface FieldRow {
  key: string;
  l: string | null;
  r: string | null;
  status: DiffStatus;
  parts?: DiffPart[] | null;
}

export interface CellDiffInfo {
  leftText: string;
  rightText: string;
  leftNull: boolean;
  rightNull: boolean;
  parts: DiffPart[] | null;
}

export interface TableDiffRow {
  id: string;
  l: TableRowNode | null;
  r: TableRowNode | null;
  status: DiffStatus;
  groupId: string;
  pair?: TableRowNode;
  moveId?: string;
  moveRole?: 'from' | 'to';
  moveFromIndex?: number;
  moveToIndex?: number;
  cellDiffs?: Record<string, CellDiffInfo>;
}

export interface TableDiff {
  path: string;
  title: string | null;
  columns: string[];
  rows: TableDiffRow[];
}

export interface StatusCounts {
  changed: number;
  added: number;
  removed: number;
  moved: number;
  unchanged: number;
}

export interface DomRefs {
  leftInput: HTMLTextAreaElement;
  rightInput: HTMLTextAreaElement;
  structBody: HTMLElement;
  tablesBody: HTMLElement;
  jsonError: HTMLElement;
  infoBtn: HTMLButtonElement;
  infoPanel: HTMLElement;
}
