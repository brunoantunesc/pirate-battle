import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/client';
import { initMocks } from './mocks/browser';
import { App } from './App';
import './style.css';

async function boot() {
  await initMocks();
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>,
  );
}
void boot().catch(() => {
  const root = document.getElementById('root')!;
  root.textContent = 'The local service could not start. Reload to retry.';
  const retry = document.createElement('button');
  retry.textContent = 'Reload';
  retry.onclick = () => location.reload();
  root.append(retry);
});
