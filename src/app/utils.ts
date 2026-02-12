import type { DiffPart, Side } from './types';

export function createMatrix<T>(rows: number, cols: number, fill: T): T[][] {
  const matrix: T[][] = new Array(rows);
  for (let r = 0; r < rows; r += 1) {
    const row: T[] = new Array(cols);
    for (let c = 0; c < cols; c += 1) row[c] = fill;
    matrix[r] = row;
  }
  return matrix;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function diffParts(s1: unknown, s2: unknown): DiffPart[] | null {
  const left = s1 == null ? '' : String(s1);
  const right = s2 == null ? '' : String(s2);
  const n = left.length;
  const m = right.length;

  if (!isFiniteNumber(n) || !isFiniteNumber(m)) return null;
  if (n === 0 && m === 0) return [];
  if (n * m > 200000) return null;
  if (n > 4000 || m > 4000) return null;

  const matrix = createMatrix(n + 1, m + 1, 0);
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      if (left[i - 1] === right[j - 1]) matrix[i][j] = matrix[i - 1][j - 1] + 1;
      else matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
    }
  }

  const result: DiffPart[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (left[i - 1] === right[j - 1]) {
      result.push({ type: 'eq', value: left[i - 1] });
      i -= 1;
      j -= 1;
    } else if (matrix[i - 1][j] >= matrix[i][j - 1]) {
      result.push({ type: 'del', value: left[i - 1] });
      i -= 1;
    } else {
      result.push({ type: 'add', value: right[j - 1] });
      j -= 1;
    }
  }

  while (i > 0) {
    result.push({ type: 'del', value: left[i - 1] });
    i -= 1;
  }
  while (j > 0) {
    result.push({ type: 'add', value: right[j - 1] });
    j -= 1;
  }

  result.reverse();
  return result;
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  const dp = createMatrix(n + 1, m + 1, 0);
  for (let i = 0; i <= n; i += 1) dp[i][0] = i;
  for (let j = 0; j <= m; j += 1) dp[0][j] = j;

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[n][m];
}

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (s) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[s] as string));
}

export function partsToHtml(parts: DiffPart[] | null, side: Side): string | null {
  if (!parts) return null;
  return parts
    .map((part) => {
      if (part.type === 'eq') return escapeHtml(part.value);
      if (side === 'left' && part.type === 'add') return '';
      if (side === 'right' && part.type === 'del') return '';
      const cls = part.type === 'add' ? 'diff-add' : 'diff-del';
      return `<span class="${cls}">${escapeHtml(part.value)}</span>`;
    })
    .join('');
}

export function shorten(str: unknown, max: number): string {
  if (typeof str !== 'string') return String(str);
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1)}…`;
}
