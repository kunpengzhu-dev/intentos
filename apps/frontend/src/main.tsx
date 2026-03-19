import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyBootOrbCssVars } from './lib/applyBootOrbCssVars';
import './styles.css';

applyBootOrbCssVars();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
