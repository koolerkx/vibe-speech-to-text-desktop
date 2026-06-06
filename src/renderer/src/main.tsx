import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SettingsPage } from './SettingsPage';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

const isSettingsRoute = window.location.hash.replace('#', '') === 'settings';

createRoot(rootElement).render(
  <StrictMode>{isSettingsRoute ? <SettingsPage /> : <App />}</StrictMode>,
);
