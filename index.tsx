import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';

// Global error handlers for production
window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.error || event.message);
  // In a real production app, we would send this to Sentry/LogRocket here
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Rejection]', event.reason);
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);