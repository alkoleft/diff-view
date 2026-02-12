import './style.css';
import { initApp } from './app/index';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Не найден контейнер #app');
}

initApp(root);
