import './style.css';
import { initApp } from './app/index';
import { sampleLeft, sampleRight } from './app/sample';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Не найден контейнер #app');
}

initApp(root);

if (typeof window !== 'undefined' && window.setVersions) {
  window.setVersions(sampleLeft, sampleRight);
}
