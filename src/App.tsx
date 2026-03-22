import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AudioProvider } from './context/AudioContext';
import { Layout } from './components/Layout';
import { Gallery } from './components/Gallery';
import { TrackPage } from './components/TrackPage';
import { Admin } from './components/Admin';

export default function App() {
  return (
    <Router>
      <AudioProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Gallery />} />
            <Route path="track/:id" element={<TrackPage />} />
            <Route path="admin" element={<Admin />} />
          </Route>
        </Routes>
      </AudioProvider>
    </Router>
  );
}
