import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
// Archivo is bundled with the app (no font CDN), so it also works on VMs without internet.
import '@fontsource-variable/archivo/standard.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
