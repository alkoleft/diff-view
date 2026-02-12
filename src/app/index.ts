import { buildFieldRows, buildTableDiffs } from './diff';
import { collect, parseJson } from './normalize';
import { renderStructures, renderTables } from './render';
import { sampleLeft, sampleRight } from './sample';
import type { DomRefs, TableNode } from './types';

declare global {
  interface Window {
    setLeftVersion?: (jsonText: string | unknown) => void;
    setRightVersion?: (jsonText: string | unknown) => void;
    setVersions?: (leftJsonText: string | unknown, rightJsonText: string | unknown) => void;
    loadSample?: () => void;
  }
}

const markup = `
  <div class="layout">
    <button type="button" class="info-btn" id="infoBtn" aria-label="О инструменте">ⓘ</button>
    <div class="info-panel" id="infoPanel" aria-hidden="true">
      <h4>Назначение</h4>
      <p>Визуальное сравнение сериализованных объектов 1С (структуры и таблицы) с акцентом на поиск изменений.</p>
      <h4>Возможности</h4>
      <ul>
        <li>Сравнение структур с подсветкой отличий.</li>
        <li>Сравнение табличных частей с выравниванием строк.</li>
        <li>Поддержка вложенных структур и таблиц.</li>
        <li>Подсветка изменений внутри ячеек.</li>
      </ul>
      <h4>Алгоритмы</h4>
      <ul>
        <li>Выравнивание строк таблиц: динамическое программирование.</li>
        <li>Сходство строк: расстояние Левенштейна (Вагнер-Фишер).</li>
        <li>Подсветка изменений: LCS по символам.</li>
      </ul>
    </div>
    <div class="hidden">
      <textarea id="leftInput"></textarea>
      <textarea id="rightInput"></textarea>
    </div>
    <div class="results">
      <div id="jsonError" class="value hidden" role="alert" aria-live="polite"></div>
      <div id="structBody"></div>
      <div id="tablesBody"></div>
    </div>
  </div>
`;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Не найден элемент #${id}`);
  return element as T;
}

function buildDomRefs(): DomRefs {
  return {
    leftInput: byId<HTMLTextAreaElement>('leftInput'),
    rightInput: byId<HTMLTextAreaElement>('rightInput'),
    structBody: byId<HTMLElement>('structBody'),
    tablesBody: byId<HTMLElement>('tablesBody'),
    jsonError: byId<HTMLElement>('jsonError'),
    infoBtn: byId<HTMLButtonElement>('infoBtn'),
    infoPanel: byId<HTMLElement>('infoPanel')
  };
}

function toggleInfoPanel(dom: DomRefs): void {
  const open = dom.infoPanel.style.display === 'block';
  dom.infoPanel.style.display = open ? 'none' : 'block';
  dom.infoPanel.setAttribute('aria-hidden', open ? 'true' : 'false');
}

function compare(dom: DomRefs): void {
  const leftParsed = parseJson(dom.leftInput.value);
  const rightParsed = parseJson(dom.rightInput.value);

  const leftRoot = leftParsed?.node ?? null;
  const rightRoot = rightParsed?.node ?? null;

  const errors: string[] = [];
  if (leftParsed?.error) errors.push(`Левая версия: ${leftParsed.error}`);
  if (rightParsed?.error) errors.push(`Правая версия: ${rightParsed.error}`);

  if (errors.length) {
    dom.jsonError.textContent = errors.join(' | ');
    dom.jsonError.classList.remove('hidden');
  } else {
    dom.jsonError.textContent = '';
    dom.jsonError.classList.add('hidden');
  }

  if (!leftRoot && !rightRoot) {
    dom.structBody.innerHTML = '';
    dom.tablesBody.innerHTML = '';
    return;
  }

  const leftFields = new Map<string, unknown>();
  const rightFields = new Map<string, unknown>();
  const leftTables = new Map<string, TableNode>();
  const rightTables = new Map<string, TableNode>();

  if (leftRoot) collect(leftRoot, '', leftFields, leftTables);
  if (rightRoot) collect(rightRoot, '', rightFields, rightTables);

  renderStructures(buildFieldRows(leftFields, rightFields), dom);
  renderTables(buildTableDiffs(leftTables, rightTables), dom);
}

export function initApp(root: HTMLElement): void {
  root.innerHTML = markup;
  const dom = buildDomRefs();

  const setLeftVersion = (jsonText: string | unknown): void => {
    dom.leftInput.value = typeof jsonText === 'string' ? jsonText : JSON.stringify(jsonText, null, 2);
    compare(dom);
  };

  const setRightVersion = (jsonText: string | unknown): void => {
    dom.rightInput.value = typeof jsonText === 'string' ? jsonText : JSON.stringify(jsonText, null, 2);
    compare(dom);
  };

  const setVersions = (leftJsonText: string | unknown, rightJsonText: string | unknown): void => {
    setLeftVersion(leftJsonText);
    setRightVersion(rightJsonText);
  };

  const loadSample = (): void => {
    setVersions(sampleLeft, sampleRight);
  };

  dom.infoBtn.addEventListener('click', () => toggleInfoPanel(dom));

  if (typeof window !== 'undefined') {
    window.setLeftVersion = setLeftVersion;
    window.setRightVersion = setRightVersion;
    window.setVersions = setVersions;
    window.loadSample = loadSample;
  }
}
