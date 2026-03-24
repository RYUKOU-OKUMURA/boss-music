import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type TrackPageUiPattern = 'vinyl' | 'illustration' | 'spectrum';

const STORAGE_KEY = 'boss-music-track-page-ui';

function readStoredPattern(): TrackPageUiPattern {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'vinyl' || raw === 'illustration' || raw === 'spectrum') return raw;
    /** 旧値 `minimal` をイラストパターンへ移行 */
    if (raw === 'minimal') {
      localStorage.setItem(STORAGE_KEY, 'illustration');
      return 'illustration';
    }
  } catch {
    /* ignore */
  }
  return 'vinyl';
}

function writeStoredPattern(p: TrackPageUiPattern) {
  try {
    localStorage.setItem(STORAGE_KEY, p);
  } catch {
    /* ignore */
  }
}

interface TrackPageUiContextValue {
  pattern: TrackPageUiPattern;
  setPattern: (p: TrackPageUiPattern) => void;
}

const TrackPageUiContext = createContext<TrackPageUiContextValue | undefined>(undefined);

export const TrackPageUiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pattern, setPatternState] = useState<TrackPageUiPattern>(() => readStoredPattern());

  const setPattern = useCallback((p: TrackPageUiPattern) => {
    setPatternState(p);
    writeStoredPattern(p);
  }, []);

  const value = useMemo(() => ({ pattern, setPattern }), [pattern, setPattern]);

  return <TrackPageUiContext.Provider value={value}>{children}</TrackPageUiContext.Provider>;
};

export function useTrackPageUi(): TrackPageUiContextValue {
  const ctx = useContext(TrackPageUiContext);
  if (!ctx) {
    throw new Error('useTrackPageUi must be used within TrackPageUiProvider');
  }
  return ctx;
}
