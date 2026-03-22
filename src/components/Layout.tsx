import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navigation } from './Navigation';
import { GlobalPlayer } from './GlobalPlayer';

export const Layout: React.FC = () => {
  const location = useLocation();
  const isTrackPage = location.pathname.startsWith('/track/');

  return (
    <div className="min-h-screen bg-zen-bg text-zen-mist font-body selection:bg-zen-accent/30">
      {!isTrackPage && <Navigation />}
      <main>
        <Outlet />
      </main>
      <GlobalPlayer />
    </div>
  );
};
