import { countStatuses } from './diff';
import { applyDiffHtml, getCellInfo, setTextContent } from './render-helpers';
import { DiffStatus } from './types';
import type { DiffPart, DomRefs, FieldRow, Side, StatusCounts, TableDiff, TableDiffRow } from './types';

export function renderStructures(rows: FieldRow[], dom: DomRefs): void {
  dom.structBody.innerHTML = '';
  if (!rows.length) return;

  const table = document.createElement('table');
  table.className = 'diff-table struct-table';

  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.className = `row-${row.status}`;

    const tdPath = document.createElement('td');
    tdPath.className = 'table-header';
    tdPath.textContent = row.key;

    const tdLeft = document.createElement('td');
    tdLeft.className = `value${row.l === null ? ' empty' : ''}`;

    const tdRight = document.createElement('td');
    tdRight.className = `value${row.r === null ? ' empty' : ''}`;

    if (row.status === DiffStatus.Changed) {
      const parts = row.parts ?? null;
      applyDiffHtml(tdLeft, parts, 'left', row.l ?? '—', false);
      applyDiffHtml(tdRight, parts, 'right', row.r ?? '—', false);
    } else {
      tdLeft.textContent = row.l ?? '—';
      tdRight.textContent = row.r ?? '—';
    }

    tr.append(tdPath, tdLeft, tdRight);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  dom.structBody.appendChild(table);
}

export function renderTables(diffs: TableDiff[], dom: DomRefs): void {
  dom.tablesBody.innerHTML = '';

  diffs.forEach((tableDiff) => {
    const columns = tableDiff.columns;
    const rows = tableDiff.rows;
    const group = document.createElement('div');
    group.className = 'group table-group';
    group.dataset.open = 'true';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'group-toggle';
    toggle.textContent = tableDiff.title
      ? `${tableDiff.title} (${tableDiff.path})`
      : `Таблица: ${tableDiff.path}`;
    toggle.addEventListener('click', () => {
      const isOpen = group.dataset.open === 'true';
      group.dataset.open = isOpen ? 'false' : 'true';
    });
    group.appendChild(toggle);

    const body = document.createElement('div');
    body.className = 'group-body';
    body.appendChild(renderGroupSummary(countStatuses(tableDiff.rows)));

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';

    const table = document.createElement('table');
    table.className = 'diff-table';

    const thead = document.createElement('thead');
    thead.className = 'table-header';
    const headRow = document.createElement('tr');
    const thId = document.createElement('th');
    thId.textContent = 'ID';
    headRow.appendChild(thId);
    columns.forEach((column) => {
      const th = document.createElement('th');
      th.textContent = column;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const next = rows[i + 1];

      if (
        row.status === DiffStatus.Removed &&
        row.pair &&
        next &&
        next.status === DiffStatus.Added &&
        next.groupId === row.groupId
      ) {
        tbody.appendChild(renderTableRow(row, columns));
        tbody.appendChild(renderTableRow(next, columns));
        i += 1;
      } else if (row.status === DiffStatus.Changed) {
        tbody.appendChild(renderTableRowCombined(row, columns));
      } else {
        tbody.appendChild(renderTableRow(row, columns));
      }
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    body.appendChild(wrap);
    group.appendChild(body);
    dom.tablesBody.appendChild(group);
  });
}

function renderTableRow(row: TableDiffRow, columns: string[]): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = `row-${row.status}`;
  if (row.pair && row.status === DiffStatus.Removed) {
    tr.className += ' pair-top';
  }
  if (row.pair && row.status === DiffStatus.Added) {
    tr.className += ' pair-bottom';
  }

  const tdId = document.createElement('td');
  tdId.className = 'field-path';
  if (row.status === DiffStatus.Moved && row.moveFromIndex !== undefined) {
    const moveHint = document.createElement('span');
    moveHint.className = 'move-hint';
    moveHint.textContent = `⤵ из ${row.moveFromIndex + 1}`;
    moveHint.title = `перемещено из позиции ${row.moveFromIndex + 1}`;
    tdId.appendChild(moveHint);
    tdId.append(' ');
  }
  tdId.append(row.id);
  tr.appendChild(tdId);

  columns.forEach((column) => {
    const td = document.createElement('td');
    td.className = 'value';

    const sourceRow = row.l ?? row.r;
    const sourceInfo = getCellInfo(sourceRow, column);
    const diffInfo = row.cellDiffs?.[column];
    const hasDiff = hasPartsDiff(diffInfo?.parts ?? null);
    const isPairRow =
      (row.status === DiffStatus.Removed || row.status === DiffStatus.Added || row.status === DiffStatus.Moved) &&
      row.pair;

    if (row.status === DiffStatus.Moved && row.pair && diffInfo && hasDiff) {
      const left = document.createElement('div');
      left.className = 'cell-left';

      const right = document.createElement('div');
      right.className = 'cell-right';
      if (diffInfo.leftNull) left.className += ' empty';
      if (diffInfo.rightNull) right.className += ' empty';

      applyDiffHtml(left, diffInfo.parts, 'left', diffInfo.leftText, diffInfo.leftNull);
      applyDiffHtml(right, diffInfo.parts, 'right', diffInfo.rightText, diffInfo.rightNull);

      td.className += ' cell-compare';
      td.append(left, right);
    } else if (isPairRow && diffInfo) {
      const side: Side = row.status === DiffStatus.Removed || row.moveRole === 'from' ? 'left' : 'right';
      const fallbackText = side === 'left' ? diffInfo.leftText : diffInfo.rightText;
      const isNull = side === 'left' ? diffInfo.leftNull : diffInfo.rightNull;
      applyDiffHtml(td, diffInfo.parts, side, fallbackText, isNull);
      if (isNull) td.className += ' empty';
    } else {
      setTextContent(td, sourceInfo.text, sourceInfo.isNull);
      if (sourceInfo.isNull) td.className += ' empty';
    }

    tr.appendChild(td);
  });

  return tr;
}

function hasPartsDiff(parts: DiffPart[] | null): boolean {
  if (!parts) return false;
  return parts.some((part) => part.type !== 'eq');
}

function renderTableRowCombined(row: TableDiffRow, columns: string[]): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = `row-${row.status}`;

  const tdId = document.createElement('td');
  tdId.className = 'field-path';
  tdId.textContent = row.id;
  tr.appendChild(tdId);

  columns.forEach((column) => {
    const td = document.createElement('td');
    td.className = 'value';

    const diffInfo = row.cellDiffs?.[column];
    const leftInfo = diffInfo
      ? { text: diffInfo.leftText, isNull: diffInfo.leftNull }
      : getCellInfo(row.l, column);
    const rightInfo = diffInfo
      ? { text: diffInfo.rightText, isNull: diffInfo.rightNull }
      : getCellInfo(row.r, column);
    const parts = diffInfo?.parts ?? null;

    if (leftInfo.text === rightInfo.text) {
      td.className += ' cell-compare-single';
      if (leftInfo.isNull && rightInfo.isNull) {
        td.className += ' empty';
        td.textContent = '';
      } else {
        td.textContent = leftInfo.text || rightInfo.text || '—';
      }
    } else {
      const left = document.createElement('div');
      left.className = 'cell-left';

      const right = document.createElement('div');
      right.className = 'cell-right';
      if (leftInfo.isNull) left.className += ' empty';
      if (rightInfo.isNull) right.className += ' empty';

      applyDiffHtml(left, parts, 'left', leftInfo.text, leftInfo.isNull);
      applyDiffHtml(right, parts, 'right', rightInfo.text, rightInfo.isNull);

      td.className += ' cell-compare';
      td.append(left, right);
    }

    tr.appendChild(td);
  });

  return tr;
}

function renderGroupSummary(counts: StatusCounts): HTMLElement {
  const summary = document.createElement('div');
  summary.className = 'group-summary';
  summary.appendChild(createChip('changed', counts.changed, 'изменено'));
  summary.appendChild(createChip('added', counts.added, 'добавлено'));
  summary.appendChild(createChip('removed', counts.removed, 'удалено'));
  summary.appendChild(createChip('moved', counts.moved, 'перемещено'));
  summary.appendChild(createChip('unchanged', counts.unchanged, 'без изменений'));
  return summary;
}

function createChip(cls: string, value: number, label: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = `chip ${cls}`;
  const strong = document.createElement('strong');
  strong.textContent = String(value);
  chip.appendChild(strong);
  chip.append(` ${label}`);
  return chip;
}
