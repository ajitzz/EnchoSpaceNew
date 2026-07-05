/// <reference types="vite-plugin-pwa/client" />
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './components/AuthContext';
import { CurrencyProvider } from './components/CurrencyContext';
import { ToastProvider } from './components/ToastContext';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { registerSW } from 'virtual:pwa-register';
import { APIProvider } from '@vis.gl/react-google-maps';
import { HelmetProvider } from 'react-helmet-async';
import { SpeedInsights } from "@vercel/speed-insights/react";

// Register service worker
const pwaFeature = 'virtual:pwa-register';
if (pwaFeature || 'serviceWorker' in navigator) {
  const updateSW = registerSW({
    onNeedRefresh() {
      if (confirm('New content available. Reload?')) {
        updateSW(true);
      }
    },
    onOfflineReady() {
      console.log('App ready to work offline');
    },
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const clientId =
  process.env.VITE_GOOGLE_CLIENT_ID ||
  (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
  'dummy-client-id';

// Add this Google Maps API key
const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
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
  </React.StrictMode>
);