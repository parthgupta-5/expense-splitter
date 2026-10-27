import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import 'antd/dist/reset.css';
import './styles.css';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import { AppProvider } from './state/AppContext';
import { routeAuthRedirect } from './lib/authRedirect';

routeAuthRedirect();

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </ErrorBoundary>,
);
