import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  ReactNode,
  type RefObject,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { resolveAudioPlaybackUrl } from '../lib/mediaUrls';
import { resolveAudioSource, revokeObjectUrl } from '../lib/audioCache';
import { clamp, clamp01 } from '../lib/playback';

export interface Track {
  id: string;
  title: string;
  artist: string;
  description: string;
  createdAt: string;
  playlist: string;
  audioUrl: string;
  coverImage?: string;
  playable: boolean;
  tags: string[];
  order?: number;
}

interface TracksApiResponse {
  tracks: Track[];
}

type ScopedTrack = { track: Track; index: number };

interface PlayOptions {
  shuffle?: boolean;
}

/** timeupdate からの setState を間引き、再生中の Provider 再レンダーを抑える（最大約 5 回/秒） */
const TIME_UI_THROTTLE_MS = 200;

function buildShuffleScopeKey(scopedTracks: ScopedTrack[]): string {
  return scopedTracks.map(({ track }) => track.id).join('|');
}

function shuffledIndexes(indexes: number[]): number[] {
  const next = [...indexes];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

interface AudioContextType {
  tracks: Track[];
  currentTrackIndex: number;
  currentTrack: Track | null;
  activePlaylist: string | null;
  shuffleUpcomingTrack: Track | null;
  isRepeatEnabled: boolean;
  isShuffleEnabled: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  play: (index?: number, playlist?: string | null, options?: PlayOptions) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  setActivePlaylist: (playlist: string | null) => void;
  setRepeatEnabled: (enabled: boolean) => void;
  toggleRepeatEnabled: () => void;
  setShuffleEnabled: (enabled: boolean) => void;
  toggleShuffleEnabled: () => void;
  isLoading: boolean;
  /** Web Audio の Analyser（スペクトラム可視化用）。`MediaElementSource` は audio 要素につき 1 回だけ接続 */
  audioAnalyserRef: RefObject<AnalyserNode | null>;
}

/** `timeupdate` で毎秒更新される currentTime を購読しないコンポーネント向け（Gallery / TrackCard 等） */
export type AudioMainContextType = Omit<AudioContextType, 'currentTime'>;

const AudioMainContext = createContext<AudioMainContextType | undefined>(undefined);
/** currentTime のみ高頻度更新。メインと分離して再レンダー範囲を狭める */
const AudioTimeContext = createContext<number>(0);

export const useAudio = (): AudioContextType => {
  const main = useContext(AudioMainContext);
  const currentTime = useContext(AudioTimeContext);
  if (!main) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return { ...main, currentTime };
};

export const useAudioMain = (): AudioMainContextType => {
  const main = useContext(AudioMainContext);
  if (!main) {
    throw new Error('useAudioMain must be used within an AudioProvider');
  }
  return main;
};

/** 再生位置のみ購読（シークバー等）。Track ページのヘッダー・背景の再レンダーを避けるために分離 */
export const useAudioTime = (): number => {
  return useContext(AudioTimeContext);
};

export const AudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [activePlaylist, setActivePlaylistState] = useState<string | null>(null);
  const [isRepeatEnabled, setRepeatEnabled] = useState<boolean>(true);
  const [isShuffleEnabled, setShuffleEnabledState] = useState<boolean>(false);
  const [nextShuffleTrackIndex, setNextShuffleTrackIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const webAudioContextRef = useRef<AudioContext | null>(null);
  /** Web Audio グラフは audio 要素に対して1回だけ。Strict Mode の effect 再実行で二重 createMediaElementSource しないよう、切断はクリーンアップで行わない */
  const webAudioGraphInitializedRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const lastTrackIdRef = useRef<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const lastTimeUiEmitRef = useRef(0);
  const shuffleRemainingRef = useRef<number[]>([]);
  const shuffleHistoryRef = useRef<number[]>([]);
  const shuffleScopeKeyRef = useRef('');

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const currentTrack = tracks[currentTrackIndex] || null;
  const shuffleUpcomingTrack = nextShuffleTrackIndex !== null ? tracks[nextShuffleTrackIndex] ?? null : null;

  useEffect(() => {
    if (tracks.length === 0) {
      setCurrentTrackIndex(0);
      setNextShuffleTrackIndex(null);
      setDuration(0);
      setCurrentTime(0);
      return;
    }

    setCurrentTrackIndex((index) => clamp(index, 0, tracks.length - 1));
  }, [tracks.length]);

  const setActivePlaylist = useCallback((playlist: string | null) => {
    setActivePlaylistState(playlist?.trim() || null);
  }, []);

  const setShuffleEnabled = useCallback((enabled: boolean) => {
    setShuffleEnabledState(enabled);
    if (!enabled) {
      shuffleRemainingRef.current = [];
      shuffleHistoryRef.current = [];
      shuffleScopeKeyRef.current = '';
      setNextShuffleTrackIndex(null);
    }
  }, []);

  const getScopedTracks = useCallback(
    (playlist: string | null) => {
      const normalizedPlaylist = playlist?.trim() || null;
      if (!normalizedPlaylist) {
        return tracks.map((track, index) => ({ track, index }));
      }
      return tracks
        .map((track, index) => ({ track, index }))
        .filter(({ track }) => track.playlist === normalizedPlaylist);
    },
    [tracks]
  );

  const primeShuffleQueue = useCallback((scopedTracks: ScopedTrack[], currentIndex: number) => {
    shuffleScopeKeyRef.current = buildShuffleScopeKey(scopedTracks);
    shuffleHistoryRef.current = [];
    shuffleRemainingRef.current = shuffledIndexes(
      scopedTracks.map(({ index: scopedIndex }) => scopedIndex).filter((scopedIndex) => scopedIndex !== currentIndex)
    );
    setNextShuffleTrackIndex(shuffleRemainingRef.current[0] ?? null);
  }, []);

  const takeNextShuffleTrack = useCallback(
    (scopedTracks: ScopedTrack[], currentIndex: number, shouldRestart: boolean): ScopedTrack | null => {
      if (scopedTracks.length === 0) return null;
      if (scopedTracks.length === 1) return shouldRestart ? scopedTracks[0] : null;

      const scopeKey = buildShuffleScopeKey(scopedTracks);
      if (shuffleScopeKeyRef.current !== scopeKey) {
        primeShuffleQueue(scopedTracks, currentIndex);
      }

      shuffleRemainingRef.current = shuffleRemainingRef.current.filter((index) => index !== currentIndex);

      if (shuffleRemainingRef.current.length === 0) {
        if (!shouldRestart) return null;
        primeShuffleQueue(scopedTracks, currentIndex);
      }

      const nextIndex = shuffleRemainingRef.current.shift();
      setNextShuffleTrackIndex(shuffleRemainingRef.current[0] ?? null);
      if (nextIndex === undefined) return null;
      return scopedTracks.find(({ index }) => index === nextIndex) ?? null;
    },
    [primeShuffleQueue]
  );

  const play = useCallback((index?: number, playlist?: string | null, options?: PlayOptions) => {
    if (index !== undefined && index >= 0 && index < tracks.length) {
      setCurrentTrackIndex(index);
    }
    const nextPlaylist =
      playlist !== undefined
        ? playlist?.trim() || null
        : index !== undefined
          ? tracks[index]?.playlist?.trim() || null
          : activePlaylist;
    if (playlist !== undefined) {
      setActivePlaylistState(nextPlaylist);
    } else if (index !== undefined) {
      setActivePlaylistState(nextPlaylist);
    }
    if (options?.shuffle !== undefined) {
      setShuffleEnabledState(options.shuffle);
      if (!options.shuffle) {
        shuffleRemainingRef.current = [];
        shuffleHistoryRef.current = [];
        shuffleScopeKeyRef.current = '';
        setNextShuffleTrackIndex(null);
      }
    }
    const nextShuffleEnabled = options?.shuffle ?? isShuffleEnabled;
    if (nextShuffleEnabled && index !== undefined && index >= 0 && index < tracks.length) {
      const scopedTracks = getScopedTracks(nextPlaylist);
      primeShuffleQueue(scopedTracks, index);
    }
    setIsPlaying(true);
  }, [tracks, activePlaylist, isShuffleEnabled, getScopedTracks, primeShuffleQueue]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const toggleRepeatEnabled = useCallback(() => {
    setRepeatEnabled((enabled) => !enabled);
  }, []);

  const toggleShuffleEnabled = useCallback(() => {
    setShuffleEnabledState((enabled) => {
      const nextEnabled = !enabled;
      if (!nextEnabled) {
        shuffleRemainingRef.current = [];
        shuffleHistoryRef.current = [];
        shuffleScopeKeyRef.current = '';
        setNextShuffleTrackIndex(null);
      } else {
        primeShuffleQueue(getScopedTracks(activePlaylist), currentTrackIndex);
      }
      return nextEnabled;
    });
  }, [getScopedTracks, activePlaylist, currentTrackIndex, primeShuffleQueue]);

  const next = useCallback(() => {
    if (tracks.length === 0) return;
    const scopedTracks = getScopedTracks(activePlaylist);
    if (scopedTracks.length === 0) return;
    const currentScopedIndex = scopedTracks.findIndex(({ index }) => index === currentTrackIndex);
    const fromScopedIndex = currentScopedIndex >= 0 ? currentScopedIndex : 0;
    const nextScoped = isShuffleEnabled
      ? takeNextShuffleTrack(scopedTracks, currentTrackIndex, true)
      : scopedTracks[(fromScopedIndex + 1) % scopedTracks.length];
    if (!nextScoped) return;
    if (isShuffleEnabled) {
      shuffleHistoryRef.current.push(currentTrackIndex);
    }
    setCurrentTrackIndex(nextScoped.index);
    setIsPlaying(true);

    if (location.pathname.startsWith('/track/')) {
      navigate(`/track/${nextScoped.track.id}`, { replace: true });
    }
  }, [
    tracks.length,
    getScopedTracks,
    activePlaylist,
    currentTrackIndex,
    isShuffleEnabled,
    takeNextShuffleTrack,
    location.pathname,
    navigate,
  ]);

  const handleTrackEnded = useCallback(() => {
    if (tracks.length === 0) return;
    const scopedTracks = getScopedTracks(activePlaylist);
    if (scopedTracks.length === 0) return;
    const currentScopedIndex = scopedTracks.findIndex(({ index }) => index === currentTrackIndex);
    const isLastScopedTrack = currentScopedIndex === scopedTracks.length - 1;

    if (!isShuffleEnabled && !isRepeatEnabled && isLastScopedTrack) {
      setIsPlaying(false);
      return;
    }

    const fromScopedIndex = currentScopedIndex >= 0 ? currentScopedIndex : 0;
    const nextScoped = isShuffleEnabled
      ? takeNextShuffleTrack(scopedTracks, currentTrackIndex, isRepeatEnabled)
      : scopedTracks[(fromScopedIndex + 1) % scopedTracks.length];
    if (!nextScoped) {
      setIsPlaying(false);
      return;
    }
    if (isShuffleEnabled) {
      shuffleHistoryRef.current.push(currentTrackIndex);
    }
    setCurrentTrackIndex(nextScoped.index);
    setIsPlaying(true);

    if (location.pathname.startsWith('/track/')) {
      navigate(`/track/${nextScoped.track.id}`, { replace: true });
    }
  }, [
    tracks.length,
    getScopedTracks,
    activePlaylist,
    currentTrackIndex,
    isRepeatEnabled,
    isShuffleEnabled,
    takeNextShuffleTrack,
    location.pathname,
    navigate,
  ]);

  const prev = useCallback(() => {
    if (tracks.length === 0) return;
    const scopedTracks = getScopedTracks(activePlaylist);
    if (scopedTracks.length === 0) return;
    const currentScopedIndex = scopedTracks.findIndex(({ index }) => index === currentTrackIndex);
    const fromScopedIndex = currentScopedIndex >= 0 ? currentScopedIndex : 0;
    const previousShuffleIndex = isShuffleEnabled ? shuffleHistoryRef.current.pop() : undefined;
    const prevScoped =
      previousShuffleIndex !== undefined
        ? scopedTracks.find(({ index }) => index === previousShuffleIndex)
        : scopedTracks[(fromScopedIndex - 1 + scopedTracks.length) % scopedTracks.length];
    if (!prevScoped) return;
    if (isShuffleEnabled) {
      shuffleRemainingRef.current.unshift(currentTrackIndex);
      setNextShuffleTrackIndex(shuffleRemainingRef.current[0] ?? null);
    }
    setCurrentTrackIndex(prevScoped.index);
    setIsPlaying(true);

    if (location.pathname.startsWith('/track/')) {
      navigate(`/track/${prevScoped.track.id}`, { replace: true });
    }
  }, [tracks.length, getScopedTracks, activePlaylist, currentTrackIndex, isShuffleEnabled, location.pathname, navigate]);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      const durationLimit = Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0
        ? audioRef.current.duration
        : Number.POSITIVE_INFINITY;
      const nextTime = clamp(time, 0, durationLimit);
      audioRef.current.currentTime = nextTime;
      lastTimeUiEmitRef.current = performance.now();
      setCurrentTime(nextTime);
    }
  }, []);

  const setVolume = useCallback((newVolume: number) => {
    const nextVolume = clamp01(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = nextVolume;
    }
    setVolumeState(nextVolume);
  }, []);

  const mainContextValue = useMemo<AudioMainContextType>(
    () => ({
      tracks,
      currentTrackIndex,
      currentTrack,
      activePlaylist,
      shuffleUpcomingTrack,
      isRepeatEnabled,
      isShuffleEnabled,
      isPlaying,
      duration,
      volume,
      play,
      pause,
      resume,
      next,
      prev,
      seek,
      setVolume,
      setActivePlaylist,
      setRepeatEnabled,
      toggleRepeatEnabled,
      setShuffleEnabled,
      toggleShuffleEnabled,
      isLoading,
      audioAnalyserRef,
    }),
    [
      tracks,
      currentTrackIndex,
      currentTrack,
      activePlaylist,
      shuffleUpcomingTrack,
      isRepeatEnabled,
      isShuffleEnabled,
      isPlaying,
      duration,
      volume,
      play,
      pause,
      resume,
      next,
      prev,
      seek,
      setVolume,
      setActivePlaylist,
      setRepeatEnabled,
      toggleRepeatEnabled,
      setShuffleEnabled,
      toggleShuffleEnabled,
      isLoading,
    ]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTracks() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/tracks');
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as TracksApiResponse;
        const nextTracks = Array.isArray(data.tracks) ? data.tracks : [];
        if (!cancelled) {
          setTracks(nextTracks);
        }
      } catch (e) {
        console.error('Failed to load tracks', e);
        if (!cancelled) setTracks([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadTracks();

    const reload = () => {
      fetch('/api/tracks')
        .then((r) => r.json())
        .then((data: TracksApiResponse) => {
          setTracks(Array.isArray(data.tracks) ? data.tracks : []);
        })
        .catch(console.error);
    };
    window.addEventListener('boss-music-catalog-changed', reload);
    return () => {
      cancelled = true;
      window.removeEventListener('boss-music-catalog-changed', reload);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        revokeObjectUrl(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume;
    }

    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      const t = audio.currentTime;
      const now = performance.now();
      if (now - lastTimeUiEmitRef.current < TIME_UI_THROTTLE_MS) return;
      lastTimeUiEmitRef.current = now;
      setCurrentTime(t);
    };
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => handleTrackEnded();
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [tracks.length, handleTrackEnded]);

  /** HTMLAudioElement につき 1 回だけ: MediaElementSource → Analyser → destination */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!webAudioGraphInitializedRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof globalThis.AudioContext }).webkitAudioContext;
      if (!Ctor) {
        console.warn('Web Audio API (AudioContext) is not available');
        return;
      }

      try {
        const ctx = new Ctor();
        webAudioContextRef.current = ctx;

        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.22;
        /** 狭い範囲だと弱い高音が byte 上 0 に寄り、右側バーが動かないように見えやすい */
        analyser.minDecibels = -100;
        analyser.maxDecibels = -30;

        source.connect(analyser);
        analyser.connect(ctx.destination);
        audioAnalyserRef.current = analyser;
        webAudioGraphInitializedRef.current = true;
      } catch (e) {
        console.warn('Web Audio graph setup failed', e);
        return;
      }
    }

    const ctx = webAudioContextRef.current;
    const resumeCtx = () => {
      void ctx?.resume();
    };
    audio.addEventListener('play', resumeCtx);

    return () => {
      audio.removeEventListener('play', resumeCtx);
      /* グラフは切断しない: React Strict Mode が同じ audio で createMediaElementSource を再実行し得るため */
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current || tracks.length === 0) return;

    const track = tracks[currentTrackIndex];
    if (!track) return;

    const trackChanged = lastTrackIdRef.current !== track.id;

    if (!trackChanged) {
      if (isPlaying) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.error('Audio play failed:', error);
            setIsPlaying(false);
          });
        }
      } else {
        audioRef.current.pause();
      }
      return;
    }

    lastTrackIdRef.current = track.id;
    setCurrentTime(0);
    setDuration(0);
    let cancelled = false;

    (async () => {
      const streamUrl = resolveAudioPlaybackUrl(track);
      const src = await resolveAudioSource(track.id, streamUrl);
      if (cancelled || !audioRef.current) return;

      let srcOrigin = '';
      try {
        srcOrigin = new URL(src, window.location.href).origin;
      } catch {
        srcOrigin = 'invalid';
      }
      const pageOrigin = window.location.origin;
      const isCrossOrigin = srcOrigin !== 'invalid' && srcOrigin !== pageOrigin;

      if (blobUrlRef.current) {
        revokeObjectUrl(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      if (src.startsWith('blob:')) {
        blobUrlRef.current = src;
      }

      const audioEl = audioRef.current;
      if (isCrossOrigin) {
        audioEl.crossOrigin = 'anonymous';
      } else {
        audioEl.crossOrigin = null;
      }

      audioEl.src = src;
      audioEl.load();

      if (isPlayingRef.current) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.error('Audio play failed:', error);
            setIsPlaying(false);
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentTrackIndex, tracks, isPlaying]);

  return (
    <AudioMainContext.Provider value={mainContextValue}>
      <AudioTimeContext.Provider value={currentTime}>{children}</AudioTimeContext.Provider>
    </AudioMainContext.Provider>
  );
};
