// Self-hosted fonts (UX §1.2): exactly Space Grotesk 700 and Inter 400.
import '@fontsource/space-grotesk/700.css';
import '@fontsource/inter/400.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/command.css';
import './styles/overlays.css';
import './styles/pages.css';
import './i18n';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
