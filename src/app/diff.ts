import { DiffStatus } from './types';
import type { CellDiffInfo, FieldRow, StatusCounts, TableDiff, TableDiffRow, TableNode, TableRowNode } from './types';
import { create } from 'jsondiffpatch';
import { cellTextFromRow } from './normalize';
import { createMatrix, diffParts, levenshteinDistance, shorten } from './utils';

var structureDiff = create({
  arrays: {
    detectMove: false
  }
});

export interface DiffOptions {
  maxAlignCells?: number;
  logDecisions?: boolean;
  moveSimilarityThreshold?: number;
  moveMaxPairs?: number;
}

var defaultDiffOptions = {
  maxAlignCells: 50000,
  logDecisions: false,
  moveSimilarityThreshold: 0.8,
  moveMaxPairs: 5000
};

let diffOptions = { ...defaultDiffOptions };

export function setDiffOptions(next: DiffOptions): void {
  diffOptions = {
    ...diffOptions,
    ...(next.maxAlignCells !== undefined ? { maxAlignCells: next.maxAlignCells } : {}),
    ...(next.logDecisions !== undefined ? { logDecisions: next.logDecisions } : {}),
    ...(next.moveSimilarityThreshold !== undefined ? { moveSimilarityThreshold: next.moveSimilarityThreshold } : {}),
    ...(next.moveMaxPairs !== undefined ? { moveMaxPairs: next.moveMaxPairs } : {})
  };
}

export function resetDiffOptions(): void {
  diffOptions = { ...defaultDiffOptions };
}

export function getDiffOptions(): Readonly<typeof defaultDiffOptions> {
  return { ...diffOptions };
}

var stableStringifyCache = new WeakMap<object, string>();

export function buildFieldRows(left: Map<string, unknown>, right: Map<string, unknown>): FieldRow[] {
  var keys = Array.from(new Set([...left.keys(), ...right.keys()]));

  return keys
    .map(function (key) {
      var l = left.get(key) ?? null;
      var r = right.get(key) ?? null;
      var lText = formatFieldValue(l);
      var rText = formatFieldValue(r);
      let status: DiffStatus = DiffStatus.Unchanged;
      if (l === null && r !== null) status = DiffStatus.Added;
      else if (l !== null && r === null) status = DiffStatus.Removed;
      else if (hasStructuralDiff(l, r)) status = DiffStatus.Changed;
      var parts = status === DiffStatus.Changed ? diffParts(lText ?? '', rText ?? '') : undefined;
      return { key, l: lText, r: rText, status, parts };
    })
    .sort(function (a, b) {
      return a.key.localeCompare(b.key);
    });
}

function hasStructuralDiff(leftValue: unknown, rightValue: unknown): boolean {
  try {
    return structureDiff.diff(leftValue, rightValue) !== undefined;
  } catch {
    // Fallback when diff library cannot process a value shape.
    return stableStringify(leftValue) !== stableStringify(rightValue);
  }
}

function formatFieldValue(value: unknown): string | null {
  if (value === null) return null;
  if (value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object') return shorten(stableStringify(value), 200);
  return String(value);
}

function stableStringify(value: unknown): string {
  if (value && typeof value === 'object') {
    var cached = stableStringifyCache.get(value as object);
    if (cached !== undefined) return cached;
  }

  var seen = new WeakSet<object>();
  var result = JSON.stringify(sortKeys(value, seen));

  if (value && typeof value === 'object') {
    stableStringifyCache.set(value as object, result);
  }

  return result;
}

function sortKeys(value: unknown, seen: WeakSet<object>): unknown {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) return value.map(function (item) {
    return sortKeys(item, seen);
  });

  var out: Record<string, unknown> = {};
  Object.keys(value as Record<string, unknown>)
    .sort()
    .forEach(function (key) {
      out[key] = sortKeys((value as Record<string, unknown>)[key], seen);
    });
  return out;
}

export function buildTableDiffs(
  left: Map<string, TableNode>,
  right: Map<string, TableNode>
): TableDiff[] {
  var paths = Array.from(new Set([...left.keys(), ...right.keys()]));

  return paths
    .map(function (path) {
      var lt = left.get(path) ?? null;
      var rt = right.get(path) ?? null;
      var columns = mergeColumns(lt?.columns, rt?.columns);
      return {
        path,
        title: lt?.name ?? rt?.name ?? null,
        columns,
        rows: alignRows(lt?.rows ?? [], rt?.rows ?? [], columns, path)
      };
    })
    .sort(function (a, b) {
      return a.path.localeCompare(b.path);
    });
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
  var n = leftRows.length;
  var m = rightRows.length;

  if (n * m > diffOptions.maxAlignCells) {
    logDecision(path, `${n}x${m}`, 'fallback', 'слишком большая матрица для выравнивания');
    return alignRowsFallback(leftRows, rightRows, columns);
  }

  var movedPairs = findMovedPairs(leftRows, rightRows, columns, path);
  var movedLeft = new Set<number>();
  var movedRight = new Set<number>();

  movedPairs.forEach(function (pair) {
    movedLeft.add(pair.leftIndex);
    movedRight.add(pair.rightIndex);
  });

  var leftRemaining: TableRowNode[] = [];
  var rightRemaining: TableRowNode[] = [];
  var leftIndexMap: number[] = [];
  var rightIndexMap: number[] = [];

  leftRows.forEach(function (row, index) {
    if (!movedLeft.has(index)) {
      leftRemaining.push(row);
      leftIndexMap.push(index);
    }
  });
  rightRows.forEach(function (row, index) {
    if (!movedRight.has(index)) {
      rightRemaining.push(row);
      rightIndexMap.push(index);
    }
  });

  var remainingN = leftRemaining.length;
  var remainingM = rightRemaining.length;

  var dp = createMatrix<number>(remainingN + 1, remainingM + 1, () => 0);
  var move = createMatrix<string>(remainingN + 1, remainingM + 1, () => '');
  var delCost = 1;
  var insCost = 1;

  for (let i = 1; i <= remainingN; i += 1) {
    dp[i][0] = dp[i - 1][0] + delCost;
    move[i][0] = 'D';
  }
  for (let j = 1; j <= remainingM; j += 1) {
    dp[0][j] = dp[0][j - 1] + insCost;
    move[0][j] = 'I';
  }

  for (let i = 1; i <= remainingN; i += 1) {
    for (let j = 1; j <= remainingM; j += 1) {
      var l = leftRemaining[i - 1];
      var r = rightRemaining[j - 1];
      var sim = similarityScore(l, r, columns);
      var subCost = sim.same ? 0 : sim.similar ? sim.ratio : 2;

      var del = dp[i - 1][j] + delCost;
      var ins = dp[i][j - 1] + insCost;
      var sub = dp[i - 1][j - 1] + subCost;
      var best = Math.min(del, ins, sub);

      dp[i][j] = best;
      move[i][j] = best === sub ? 'S' : best === del ? 'D' : 'I';
    }
  }

  var rows: TableDiffRow[] = [];
  var rowLeftIndices: Array<number | null> = [];
  var rowRightIndices: Array<number | null> = [];
  let i = remainingN;
  let j = remainingM;

  while (i > 0 || j > 0) {
    var mv = move[i][j];

    if (mv === 'S') {
      var l = leftRemaining[i - 1];
      var r = rightRemaining[j - 1];
      var leftIndex = leftIndexMap[i - 1];
      var rightIndex = rightIndexMap[j - 1];
      var sim = similarityScore(l, r, columns);
      var id = l?.displayId ?? r?.displayId ?? String(leftIndex + 1);
      var groupId = `g-${leftIndex}-${rightIndex}`;

      if (sim.same) {
        logDecision(path, id, DiffStatus.Unchanged, `совпало по содержимому. similarity: ${sim.similarity}`);
        rows.push({ id, l, r, status: DiffStatus.Unchanged, groupId });
        rowLeftIndices.push(leftIndex);
        rowRightIndices.push(rightIndex);
      } else if (sim.similar) {
        logDecision(path, id, DiffStatus.Changed, `сопоставлено по близости. similarity: ${sim.similarity}`);
        rows.push({ id, l, r, status: DiffStatus.Changed, groupId, cellDiffs: buildCellDiffs(l, r, columns) });
        rowLeftIndices.push(leftIndex);
        rowRightIndices.push(rightIndex);
      } else {
        logDecision(path, id, 'removed+added', `слишком отличается после выравнивания. similarity: ${sim.similarity}`);
        var pairId = `pair-${leftIndex}-${rightIndex}`;
        var cellDiffs = buildCellDiffs(l, r, columns);
        rows.push({ id, l, r: null, status: DiffStatus.Removed, pair: r, groupId: pairId, cellDiffs });
        rowLeftIndices.push(leftIndex);
        rowRightIndices.push(null);
        rows.push({ id, l: null, r, status: DiffStatus.Added, pair: l, groupId: pairId, cellDiffs });
        rowLeftIndices.push(null);
        rowRightIndices.push(rightIndex);
      }

      i -= 1;
      j -= 1;
      continue;
    }

    if (mv === 'D') {
      var l = leftRemaining[i - 1];
      var leftIndex = leftIndexMap[i - 1];
      var id = l?.displayId ?? String(leftIndex + 1);
      logDecision(path, id, DiffStatus.Removed, 'удалено при выравнивании');
      rows.push({ id, l, r: null, status: DiffStatus.Removed, groupId: `g-${leftIndex}-d` });
      rowLeftIndices.push(leftIndex);
      rowRightIndices.push(null);
      i -= 1;
      continue;
    }

    var r = rightRemaining[j - 1];
    var rightIndex = rightIndexMap[j - 1];
    var id = r?.displayId ?? String(rightIndex + 1);
    logDecision(path, id, DiffStatus.Added, 'добавлено при выравнивании');
    rows.push({ id, l: null, r, status: DiffStatus.Added, groupId: `g-${rightIndex}-i` });
    rowLeftIndices.push(null);
    rowRightIndices.push(rightIndex);
    j -= 1;
  }

  var orderedRows = rows.reverse();
  var orderedRightIndices = rowRightIndices.reverse();
  if (!movedPairs.length) return orderedRows;

  var movedRows = buildMovedRows(movedPairs, leftRows, rightRows, columns);
  return insertMovedRows(orderedRows, orderedRightIndices, movedRows);
}

function alignRowsFallback(leftRows: TableRowNode[], rightRows: TableRowNode[], columns: string[]): TableDiffRow[] {
  var leftMap = new Map<string, TableRowNode>();
  var rightMap = new Map<string, TableRowNode>();

  leftRows.forEach(function (row, index) {
    leftMap.set(row.displayId ?? row.id ?? String(index + 1), row);
  });
  rightRows.forEach(function (row, index) {
    rightMap.set(row.displayId ?? row.id ?? String(index + 1), row);
  });

  var ids = Array.from(new Set([...leftMap.keys(), ...rightMap.keys()]));

  return ids.map(function (id, index) {
    var l = leftMap.get(id) ?? null;
    var r = rightMap.get(id) ?? null;

    let status: DiffStatus = DiffStatus.Unchanged;
    if (l && r && rowsEqual(l, r, columns)) status = DiffStatus.Unchanged;
    else if (l && r) status = DiffStatus.Changed;
    else if (l && !r) status = DiffStatus.Removed;
    else status = DiffStatus.Added;

    var cellDiffs = status === DiffStatus.Changed ? buildCellDiffs(l, r, columns) : undefined;
    return { id, l, r, status, groupId: `fallback-${index}`, cellDiffs };
  });
}

function findMovedPairs(
  leftRows: TableRowNode[],
  rightRows: TableRowNode[],
  columns: string[],
  path: string
): Array<{ leftIndex: number; rightIndex: number; similarity: number }> {
  if (!leftRows.length || !rightRows.length) return [];
  var threshold = diffOptions.moveSimilarityThreshold ?? 0.8;
  var maxPairs = diffOptions.moveMaxPairs ?? 5000;

  var candidates: Array<{ leftIndex: number; rightIndex: number; similarity: number }> = [];
  for (let i = 0; i < leftRows.length; i += 1) {
    for (let j = 0; j < rightRows.length; j += 1) {
      var similarity = rowSimilarity(leftRows[i], rightRows[j], columns);
      if (similarity >= threshold) {
        candidates.push({ leftIndex: i, rightIndex: j, similarity });
        if (candidates.length > maxPairs) {
          logDecision(path, `${leftRows.length}x${rightRows.length}`, 'move-skip', 'слишком много пар');
          return [];
        }
      }
    }
  }

  if (!candidates.length) return [];

  candidates.sort(function (a, b) {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    var aDist = Math.abs(a.leftIndex - a.rightIndex);
    var bDist = Math.abs(b.leftIndex - b.rightIndex);
    return aDist - bDist;
  });

  var matchedLeft = new Set<number>();
  var matchedRight = new Set<number>();
  var matched: Array<{ leftIndex: number; rightIndex: number; similarity: number }> = [];

  candidates.forEach(function (candidate) {
    if (matchedLeft.has(candidate.leftIndex) || matchedRight.has(candidate.rightIndex)) return;
    matchedLeft.add(candidate.leftIndex);
    matchedRight.add(candidate.rightIndex);
    matched.push(candidate);
  });

  if (matched.length < 2) return [];

  var ordered = matched.slice().sort(function (a, b) {
    return a.rightIndex - b.rightIndex;
  });
  var sequence = ordered.map(function (pair) {
    return pair.leftIndex;
  });
  var lis = computeLISIndices(sequence);

  var moved: Array<{ leftIndex: number; rightIndex: number; similarity: number }> = [];
  ordered.forEach(function (pair, index) {
    if (!lis.has(index)) moved.push(pair);
  });

  return moved;
}

function buildMovedRows(
  movedPairs: Array<{ leftIndex: number; rightIndex: number; similarity: number }>,
  leftRows: TableRowNode[],
  rightRows: TableRowNode[],
  columns: string[]
): Array<{ rightIndex: number; rows: TableDiffRow[] }> {
  return movedPairs
    .slice()
    .sort(function (a, b) {
      return a.rightIndex - b.rightIndex;
    })
    .map(function (pair) {
      var l = leftRows[pair.leftIndex] ?? null;
      var r = rightRows[pair.rightIndex] ?? null;
      var id = l?.displayId ?? r?.displayId ?? String(pair.rightIndex + 1);
      var moveId = `move-${pair.leftIndex}-${pair.rightIndex}`;
      var cellDiffs = buildCellDiffs(l, r, columns);
      return {
        rightIndex: pair.rightIndex,
        rows: [
          {
            id,
            l: null,
            r,
            status: DiffStatus.Moved,
            groupId: moveId,
            moveId,
            moveRole: 'to',
            moveFromIndex: pair.leftIndex,
            moveToIndex: pair.rightIndex,
            pair: l,
            cellDiffs
          }
        ]
      };
    });
}

function insertMovedRows(
  baseRows: TableDiffRow[],
  baseRightIndices: Array<number | null>,
  movedGroups: Array<{ rightIndex: number; rows: TableDiffRow[] }>
): TableDiffRow[] {
  if (!movedGroups.length) return baseRows;

  var result = baseRows.slice();
  var rightIndices = baseRightIndices.slice();

  movedGroups.forEach(function (group) {
    var insertAt = rightIndices.findIndex(function (index) {
      return index !== null && index > group.rightIndex;
    });

    if (insertAt === -1) {
      result.push(...group.rows);
      rightIndices.push(group.rightIndex);
    } else {
      result.splice(insertAt, 0, ...group.rows);
      rightIndices.splice(insertAt, 0, group.rightIndex);
    }
  });

  return result;
}

function buildCellDiffs(leftRow: TableRowNode | null, rightRow: TableRowNode | null, columns: string[]): Record<string, CellDiffInfo> {
  var out: Record<string, CellDiffInfo> = {};
  columns.forEach(function (column) {
    var leftText = cellTextFromRow(leftRow, column);
    var rightText = cellTextFromRow(rightRow, column);
    var leftNull = isNullCellValue(leftRow?.cells?.[column]);
    var rightNull = isNullCellValue(rightRow?.cells?.[column]);
    out[column] = {
      leftText,
      rightText,
      leftNull,
      rightNull,
      parts: diffParts(leftText, rightText)
    };
  });
  return out;
}

function isNullCellValue(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== 'object') return false;
  const maybeNode = value as { kind?: string; value?: unknown };
  return maybeNode.kind === 'value' && maybeNode.value === null;
}

function computeLISIndices(sequence: number[]): Set<number> {
  var tails: number[] = [];
  var tailsIndices: number[] = [];
  var prev = new Array(sequence.length).fill(-1);

  sequence.forEach(function (value, index) {
    var pos = lowerBound(tails, value);
    if (pos > 0) prev[index] = tailsIndices[pos - 1];
    tails[pos] = value;
    tailsIndices[pos] = index;
  });

  var result = new Set<number>();
  if (!tailsIndices.length) return result;

  var k = tailsIndices[tailsIndices.length - 1];
  while (k !== -1) {
    result.add(k);
    k = prev[k];
  }
  return result;
}

function lowerBound(list: number[], value: number): number {
  var low = 0;
  var high = list.length;
  while (low < high) {
    var mid = (low + high) >> 1;
    if (list[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

function similarityScore(l: TableRowNode | null, r: TableRowNode | null, columns: string[]) {
  if (!l || !r) return { same: false, similar: false, ratio: 1, similarity: 0 };
  if (rowsEqual(l, r, columns)) return { same: true, similar: true, ratio: 0, similarity: 1 };

  var similarity = rowSimilarity(l, r, columns);
  var ratio = 1 - similarity;
  return { same: false, similar: similarity >= 0.6, ratio, similarity };
}

function rowSimilarity(l: TableRowNode | null, r: TableRowNode | null, columns: string[]): number {
  if (!l || !r) return 0;

  var left = getRowSignature(l, columns);
  var right = getRowSignature(r, columns);
  var maxLen = Math.max(left.length, right.length);

  if (maxLen === 0) return 1;

  if (maxLen > 300) {
    return tokenSimilarity(left, right);
  }

  var ratio = levenshteinDistance(left, right) / maxLen;
  return Math.max(0, 1 - ratio);
}

function rowsEqual(l: TableRowNode | null, r: TableRowNode | null, columns: string[]): boolean {
  if (!l || !r) return false;
  for (let i = 0; i < columns.length; i += 1) {
    var column = columns[i];
    if (cellTextFromRow(l, column) !== cellTextFromRow(r, column)) return false;
  }
  return true;
}

function getRowSignature(row: TableRowNode, columns: string[]): string {
  var key = columns.join('\u0001');
  if (!row.__sigCache) row.__sigCache = {};
  if (row.__sigCache[key]) return row.__sigCache[key];
  var signature = columns.map(function (column) {
    return cellTextFromRow(row, column);
  }).join('|');
  row.__sigCache[key] = signature;
  return signature;
}

function tokenSimilarity(a: string, b: string): number {
  var left = tokenize(a);
  var right = tokenize(b);

  var leftKeys = Object.keys(left);
  var rightKeys = Object.keys(right);

  if (leftKeys.length === 0 && rightKeys.length === 0) return 1;

  let inter = 0;
  leftKeys.forEach(function (token) {
    if (right[token]) inter += 1;
  });

  var union = leftKeys.length + rightKeys.length - inter;
  return union === 0 ? 0 : inter / union;
}

function tokenize(text: string): Record<string, true> {
  var out: Record<string, true> = {};
  String(text)
    .toLowerCase()
    .split(/[^\w\u0400-\u04FF]+/)
    .forEach(function (token) {
      if (token) out[token] = true;
    });
  return out;
}

function logDecision(path: string, id: string, status: string, reason: string): void {
  try {
    if (!diffOptions.logDecisions) return;
    console.log(`[1C-DIFF] ${path} :: ${id} -> ${status}. Причина: ${reason}`);
  } catch {
    // ignore logging errors in restricted environments
  }
}

export function zeroCounts(): StatusCounts {
  return { changed: 0, added: 0, removed: 0, moved: 0, unchanged: 0 };
}

export function countStatuses(rows: TableDiffRow[]): StatusCounts {
  var counts = zeroCounts();
  rows.forEach(function (row) {
    counts[row.status] += 1;
  });
  return counts;
}
