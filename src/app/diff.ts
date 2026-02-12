import type { DiffStatus, FieldRow, StatusCounts, TableDiff, TableDiffRow, TableNode, TableRowNode } from './types';
import { cellTextFromRow } from './normalize';
import { createMatrix, levenshteinDistance } from './utils';

export function buildFieldRows(left: Map<string, string>, right: Map<string, string>): FieldRow[] {
  const keys = Array.from(new Set([...left.keys(), ...right.keys()]));

  return keys
    .map((key) => {
      const l = left.get(key) ?? null;
      const r = right.get(key) ?? null;
      let status: DiffStatus = 'unchanged';
      if (l === null && r !== null) status = 'added';
      else if (l !== null && r === null) status = 'removed';
      else if (l !== r) status = 'changed';
      return { key, l, r, status };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function buildTableDiffs(
  left: Map<string, TableNode>,
  right: Map<string, TableNode>
): TableDiff[] {
  const paths = Array.from(new Set([...left.keys(), ...right.keys()]));

  return paths
    .map((path) => {
      const lt = left.get(path) ?? null;
      const rt = right.get(path) ?? null;
      const columns = mergeColumns(lt?.columns, rt?.columns);
      return {
        path,
        title: lt?.name ?? rt?.name ?? null,
        columns,
        rows: alignRows(lt?.rows ?? [], rt?.rows ?? [], columns, path)
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function mergeColumns(a: string[] | undefined, b: string[] | undefined): string[] {
  return Array.from(new Set([...(a ?? []), ...(b ?? [])]));
}

function alignRows(
  leftRows: TableRowNode[],
  rightRows: TableRowNode[],
  columns: string[],
  path: string
): TableDiffRow[] {
  const n = leftRows.length;
  const m = rightRows.length;

  if (n * m > 50000) {
    logDecision(path, `${n}x${m}`, 'fallback', 'слишком большая матрица для выравнивания');
    return alignRowsFallback(leftRows, rightRows, columns);
  }

  const dp = createMatrix<number>(n + 1, m + 1, 0);
  const move = createMatrix<string>(n + 1, m + 1, '');
  const delCost = 1;
  const insCost = 1;

  for (let i = 1; i <= n; i += 1) {
    dp[i][0] = dp[i - 1][0] + delCost;
    move[i][0] = 'D';
  }
  for (let j = 1; j <= m; j += 1) {
    dp[0][j] = dp[0][j - 1] + insCost;
    move[0][j] = 'I';
  }

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const l = leftRows[i - 1];
      const r = rightRows[j - 1];
      const sim = similarityScore(l, r, columns);
      const subCost = sim.same ? 0 : sim.similar ? sim.ratio : 2;

      const del = dp[i - 1][j] + delCost;
      const ins = dp[i][j - 1] + insCost;
      const sub = dp[i - 1][j - 1] + subCost;
      const best = Math.min(del, ins, sub);

      dp[i][j] = best;
      move[i][j] = best === sub ? 'S' : best === del ? 'D' : 'I';
    }
  }

  const rows: TableDiffRow[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    const mv = move[i][j];

    if (mv === 'S') {
      const l = leftRows[i - 1];
      const r = rightRows[j - 1];
      const sim = similarityScore(l, r, columns);
      const id = l?.displayId ?? r?.displayId ?? String(i);
      const groupId = `g-${i}-${j}`;

      if (sim.same) {
        logDecision(path, id, 'unchanged', `совпало по содержимому. ratio: ${sim.ratio}`);
        rows.push({ id, l, r, status: 'unchanged', groupId });
      } else if (sim.similar) {
        logDecision(path, id, 'changed', `сопоставлено по близости. ratio: ${sim.ratio}`);
        rows.push({ id, l, r, status: 'changed', groupId });
      } else {
        logDecision(path, id, 'removed+added', `слишком отличается после выравнивания. ratio: ${sim.ratio}`);
        const pairId = `pair-${i}-${j}`;
        rows.push({ id, l, r: null, status: 'removed', pair: r, groupId: pairId });
        rows.push({ id, l: null, r, status: 'added', pair: l, groupId: pairId });
      }

      i -= 1;
      j -= 1;
      continue;
    }

    if (mv === 'D') {
      const l = leftRows[i - 1];
      const id = l?.displayId ?? String(i);
      logDecision(path, id, 'removed', 'удалено при выравнивании');
      rows.push({ id, l, r: null, status: 'removed', groupId: `g-${i}-d` });
      i -= 1;
      continue;
    }

    const r = rightRows[j - 1];
    const id = r?.displayId ?? String(j);
    logDecision(path, id, 'added', 'добавлено при выравнивании');
    rows.push({ id, l: null, r, status: 'added', groupId: `g-${j}-i` });
    j -= 1;
  }

  return rows.reverse();
}

function alignRowsFallback(leftRows: TableRowNode[], rightRows: TableRowNode[], columns: string[]): TableDiffRow[] {
  const leftMap = new Map<string, TableRowNode>();
  const rightMap = new Map<string, TableRowNode>();

  leftRows.forEach((row, index) => {
    leftMap.set(row.displayId ?? row.id ?? String(index + 1), row);
  });
  rightRows.forEach((row, index) => {
    rightMap.set(row.displayId ?? row.id ?? String(index + 1), row);
  });

  const ids = Array.from(new Set([...leftMap.keys(), ...rightMap.keys()]));

  return ids.map((id, index) => {
    const l = leftMap.get(id) ?? null;
    const r = rightMap.get(id) ?? null;

    let status: DiffStatus = 'unchanged';
    if (l && r && rowsEqual(l, r, columns)) status = 'unchanged';
    else if (l && r) status = 'changed';
    else if (l && !r) status = 'removed';
    else status = 'added';

    return { id, l, r, status, groupId: `fallback-${index}` };
  });
}

function similarityScore(l: TableRowNode | null, r: TableRowNode | null, columns: string[]) {
  if (!l || !r) return { same: false, similar: false, ratio: 1 };
  if (rowsEqual(l, r, columns)) return { same: true, similar: true, ratio: 0 };

  const left = getRowSignature(l, columns);
  const right = getRowSignature(r, columns);
  const maxLen = Math.max(left.length, right.length);

  if (maxLen === 0) return { same: true, similar: true, ratio: 0 };

  if (maxLen > 300) {
    const sim = tokenSimilarity(left, right);
    return { same: false, similar: sim >= 0.6, ratio: sim };
  }

  const ratio = levenshteinDistance(left, right) / maxLen;
  return { same: false, similar: ratio <= 0.4, ratio };
}

function rowsEqual(l: TableRowNode | null, r: TableRowNode | null, columns: string[]): boolean {
  if (!l || !r) return false;
  for (let i = 0; i < columns.length; i += 1) {
    const column = columns[i];
    if (cellTextFromRow(l, column) !== cellTextFromRow(r, column)) return false;
  }
  return true;
}

function getRowSignature(row: TableRowNode, columns: string[]): string {
  const key = columns.join('\u0001');
  if (!row.__sigCache) row.__sigCache = {};
  if (row.__sigCache[key]) return row.__sigCache[key];
  const signature = columns.map((column) => cellTextFromRow(row, column)).join('|');
  row.__sigCache[key] = signature;
  return signature;
}

function tokenSimilarity(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length === 0 && rightKeys.length === 0) return 1;

  let inter = 0;
  leftKeys.forEach((token) => {
    if (right[token]) inter += 1;
  });

  const union = leftKeys.length + rightKeys.length - inter;
  return union === 0 ? 0 : inter / union;
}

function tokenize(text: string): Record<string, true> {
  const out: Record<string, true> = {};
  String(text)
    .toLowerCase()
    .split(/[^\w\u0400-\u04FF]+/)
    .forEach((token) => {
      if (token) out[token] = true;
    });
  return out;
}

function logDecision(path: string, id: string, status: string, reason: string): void {
  try {
    console.log(`[1C-DIFF] ${path} :: ${id} -> ${status}. Причина: ${reason}`);
  } catch {
    // ignore logging errors in restricted environments
  }
}

export function zeroCounts(): StatusCounts {
  return { changed: 0, added: 0, removed: 0, unchanged: 0 };
}

export function countStatuses(rows: TableDiffRow[]): StatusCounts {
  const counts = zeroCounts();
  rows.forEach((row) => {
    counts[row.status] += 1;
  });
  return counts;
}
