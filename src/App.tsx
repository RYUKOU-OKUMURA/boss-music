import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AudioProvider } from './context/AudioContext';
import { TrackPageUiProvider } from './context/TrackPageUiContext';
import { Layout } from './components/Layout';
import { Gallery } from './components/Gallery';

/** トップは LCP のため同期 import。管理画面・トラックページは別チャンクで遅延読み込み */
const TrackPage = lazy(() => import('./components/TrackPage').then((m) => ({ default: m.TrackPage })));
const Admin = lazy(() => import('./components/Admin').then((m) => ({ default: m.Admin })));

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-zen-bg">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-zen-accent/30 border-t-zen-accent" />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AudioProvider>
        <TrackPageUiProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Gallery />} />
                <Route path="track/:id" element={<TrackPage />} />
                <Route path="admin" element={<Admin />} />
              </Route>
            </Routes>
          </Suspense>
        </TrackPageUiProvider>
      </AudioProvider>
    </Router>
  );
}
