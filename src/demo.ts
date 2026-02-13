import { initApp } from './app/index';
import { sampleLeft, sampleRight } from './app/sample';

initApp();

if (typeof window !== 'undefined' && window.setVersions) {
  window.setVersions(sampleLeft, sampleRight);
}
