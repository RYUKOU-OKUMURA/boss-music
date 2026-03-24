import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AudioProvider } from './context/AudioContext';
import { TrackPageUiProvider } from './context/TrackPageUiContext';
import { Layout } from './components/Layout';
import { Gallery } from './components/Gallery';
import { TrackPage } from './components/TrackPage';
import { Admin } from './components/Admin';

export default function App() {
  return (
    <Router>
      <AudioProvider>
        <TrackPageUiProvider>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Gallery />} />
              <Route path="track/:id" element={<TrackPage />} />
              <Route path="admin" element={<Admin />} />
            </Route>
          </Routes>
        </TrackPageUiProvider>
      </AudioProvider>
    </Router>
  );
}
