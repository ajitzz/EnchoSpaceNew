/// <reference types="vite-plugin-pwa/client" />
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './components/AuthContext';
import { CurrencyProvider } from './components/CurrencyContext';
import { ToastProvider } from './components/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { APIProvider } from '@vis.gl/react-google-maps';
import { HelmetProvider } from 'react-helmet-async';
import { SpeedInsights } from "@vercel/speed-insights/react";

// In development / preview, ensure service worker is unregistered to prevent stale cache / navigation interception
if ('serviceWorker' in navigator && (import.meta as any).env?.DEV) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      registration.unregister();
    }
  }).catch(console.error);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const clientId = process.env.VITE_GOOGLE_CLIENT_ID || (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '977982063830-0eq4c0i2oassrdmj71aevnktr17hasa7.apps.googleusercontent.com';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <GoogleOAuthProvider clientId={clientId}>
        <APIProvider apiKey={API_KEY} version="weekly">
          <HelmetProvider>
            <AuthProvider>
              <CurrencyProvider>
                <ToastProvider>
                  <App />
                  <SpeedInsights />
                </ToastProvider>
              </CurrencyProvider>
            </AuthProvider>
          </HelmetProvider>
        </APIProvider>
      </GoogleOAuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);