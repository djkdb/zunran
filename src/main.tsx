import { initializeStorage } from './platform/storage';
import { recordStudy } from './platform/study';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { registerSW } from './pwa';

initializeStorage().then(() => {
recordStudy('open');
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

registerSW();
}).catch(() => {
  const root = document.getElementById('root')!;
  root.textContent = '저장 데이터를 읽지 못했습니다. 앱을 닫고 다시 실행해 주세요. 기존 기록을 덮어쓰지 않았습니다.';
});
window.addEventListener('zunran-storage-error', () => {
  if (document.getElementById('storage-warning')) return;
  const warning = document.createElement('div');
  warning.id = 'storage-warning';
  warning.setAttribute('role', 'alert');
  warning.textContent = '저장하지 못했습니다. 앱을 종료하면 최근 진행이 사라질 수 있습니다.';
  document.body.append(warning);
});
