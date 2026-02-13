import { buildDiff } from './pipeline';
import { renderStructures, renderTables } from './render';
import type { DomRefs } from './types';

declare global {
  interface Window {
    setLeftVersion?: (jsonText: string | unknown) => void;
    setRightVersion?: (jsonText: string | unknown) => void;
    setVersions?: (leftJsonText: string | unknown, rightJsonText: string | unknown) => void;
  }
}

function byId<T extends HTMLElement>(id: string): T {
  var element = document.getElementById(id);
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
  var open = dom.infoPanel.style.display === 'block';
  dom.infoPanel.style.display = open ? 'none' : 'block';
  dom.infoPanel.setAttribute('aria-hidden', open ? 'true' : 'false');
}

function compare(dom: DomRefs): void {
  var diff = buildDiff({ left: dom.leftInput.value, right: dom.rightInput.value });

  if (diff.errors.length) {
    dom.jsonError.textContent = diff.errors.join(' | ');
    dom.jsonError.classList.remove('hidden');
  } else {
    dom.jsonError.textContent = '';
    dom.jsonError.classList.add('hidden');
  }

  if (!diff.left && !diff.right) {
    dom.structBody.innerHTML = '';
    dom.tablesBody.innerHTML = '';
    return;
  }

  renderStructures(diff.fields, dom);
  renderTables(diff.tables, dom);
}

export function initApp(): void {
  console.log('Init app')
  var dom = buildDomRefs();

  function setLeftVersion(jsonText: string | unknown): void {
    dom.leftInput.value = typeof jsonText === 'string' ? jsonText : JSON.stringify(jsonText, null, 2);
    compare(dom);
  }

  function setRightVersion(jsonText: string | unknown): void {
    dom.rightInput.value = typeof jsonText === 'string' ? jsonText : JSON.stringify(jsonText, null, 2);
    compare(dom);
  }

  function setVersions(leftJsonText: string | unknown, rightJsonText: string | unknown): void {
    setLeftVersion(leftJsonText);
    setRightVersion(rightJsonText);
  }

  dom.infoBtn.addEventListener('click', function () {
    toggleInfoPanel(dom);
  });

  if (typeof window !== 'undefined') {
    window.setLeftVersion = setLeftVersion;
    window.setRightVersion = setRightVersion;
    window.setVersions = setVersions;
  }
}
