import { cellTextFromRow } from './normalize';
import { countStatuses } from './diff';
import { diffParts, partsToHtml } from './utils';
import type { DomRefs, FieldRow, StatusCounts, TableDiff, TableDiffRow } from './types';

export function renderStructures(rows: FieldRow[], dom: DomRefs): void {
  dom.structBody.innerHTML = '';
  if (!rows.length) return;

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';

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

    if (row.status === 'changed') {
      const parts = diffParts(row.l ?? '', row.r ?? '');
      if (parts) {
        tdLeft.innerHTML = partsToHtml(parts, 'left') ?? '';
        tdRight.innerHTML = partsToHtml(parts, 'right') ?? '';
      } else {
        tdLeft.textContent = row.l ?? '—';
        tdRight.textContent = row.r ?? '—';
      }
    } else {
      tdLeft.textContent = row.l ?? '—';
      tdRight.textContent = row.r ?? '—';
    }

    tr.append(tdPath, tdLeft, tdRight);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  dom.structBody.appendChild(tableWrap);
}

export function renderTables(diffs: TableDiff[], dom: DomRefs): void {
  dom.tablesBody.innerHTML = '';

  diffs.forEach((tableDiff) => {
    const group = document.createElement('div');
    group.className = 'group table-group';
    group.dataset.open = 'true';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'group-toggle';
    toggle.textContent = tableDiff.title ? `${tableDiff.title} (${tableDiff.path})` : `Таблица: ${tableDiff.path}`;
    toggle.addEventListener('click', () => {
      group.dataset.open = group.dataset.open === 'true' ? 'false' : 'true';
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
    tableDiff.columns.forEach((column) => {
      const th = document.createElement('th');
      th.textContent = column;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let i = 0; i < tableDiff.rows.length; i += 1) {
      const row = tableDiff.rows[i];
      const next = tableDiff.rows[i + 1];

      if (row.status === 'removed' && row.pair && next && next.status === 'added' && next.groupId === row.groupId) {
        tbody.appendChild(renderTableRow(row, tableDiff.columns));
        tbody.appendChild(renderTableRow(next, tableDiff.columns));
        i += 1;
      } else if (row.status === 'changed') {
        tbody.appendChild(renderTableRowCombined(row, tableDiff.columns));
      } else {
        tbody.appendChild(renderTableRow(row, tableDiff.columns));
      }

      const nextRow = tableDiff.rows[i + 1];
      if (nextRow && nextRow.groupId !== row.groupId) {
        tbody.appendChild(renderSpacerRow(tableDiff.columns.length + 1));
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
  if (row.pair && row.status === 'removed') tr.className += ' pair-top';
  if (row.pair && row.status === 'added') tr.className += ' pair-bottom';

  const tdId = document.createElement('td');
  tdId.className = 'field-path';
  tdId.textContent = row.id;
  tr.appendChild(tdId);

  columns.forEach((column) => {
    const td = document.createElement('td');
    td.className = 'value';

    const val = cellTextFromRow(row.l ?? row.r, column);
    if ((row.status === 'removed' || row.status === 'added') && row.pair) {
      const leftVal = row.l ? cellTextFromRow(row.l, column) : cellTextFromRow(row.pair, column);
      const rightVal = row.r ? cellTextFromRow(row.r, column) : cellTextFromRow(row.pair, column);
      const parts = diffParts(leftVal, rightVal);
      if (parts) {
        td.innerHTML = row.status === 'removed' ? (partsToHtml(parts, 'left') ?? '') : (partsToHtml(parts, 'right') ?? '');
      } else {
        td.textContent = val || '—';
      }
    } else {
      td.textContent = val || '—';
    }

    tr.appendChild(td);
  });

  return tr;
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

    const leftVal = row.l ? cellTextFromRow(row.l, column) : '';
    const rightVal = row.r ? cellTextFromRow(row.r, column) : '';
    const parts = diffParts(leftVal, rightVal);

    if (leftVal === rightVal) {
      td.className += ' cell-compare-single';
      td.textContent = leftVal || rightVal || '—';
    } else {
      const left = document.createElement('div');
      left.className = 'cell-left';

      const right = document.createElement('div');
      right.className = 'cell-right';

      if (parts) {
        left.innerHTML = partsToHtml(parts, 'left') ?? '';
        right.innerHTML = partsToHtml(parts, 'right') ?? '';
      } else {
        left.textContent = leftVal || '—';
        right.textContent = rightVal || '—';
      }

      td.className += ' cell-compare';
      td.append(left, right);
    }

    tr.appendChild(td);
  });

  return tr;
}

function renderSpacerRow(colspan: number): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'row-spacer';
  const td = document.createElement('td');
  td.colSpan = colspan;
  tr.appendChild(td);
  return tr;
}

function renderGroupSummary(counts: StatusCounts): HTMLElement {
  const summary = document.createElement('div');
  summary.className = 'group-summary';
  summary.innerHTML =
    `<span class="chip changed"><strong>${counts.changed}</strong> изменено</span>` +
    `<span class="chip added"><strong>${counts.added}</strong> добавлено</span>` +
    `<span class="chip removed"><strong>${counts.removed}</strong> удалено</span>` +
    `<span class="chip unchanged"><strong>${counts.unchanged}</strong> без изменений</span>`;
  return summary;
}
