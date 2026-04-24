import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAudioMain } from '../context/AudioContext';
import type { Track } from '../context/AudioContext';
import { pointerRatioInElement } from '../lib/playback';

export interface UseTrackPagePlaybackResult {
  track: Track | null;
  trackIndex: number;
  isLoading: boolean;
  isCurrent: boolean;
  isPlaying: boolean;
  canChangeTrack: boolean;
  volume: number;
  playbackScopeName: string;
  playbackPosition: number;
  playbackTotal: number;
  nextTrack: Track | null;
  isRepeatEnabled: boolean;
  isShuffleEnabled: boolean;
  shareFeedback: 'idle' | 'copied';
  goToLibrary: () => void;
  goAdjacentTrack: (delta: -1 | 1) => void;
  handleShare: () => Promise<void>;
  onPlayPause: () => void;
  toggleRepeatEnabled: () => void;
  toggleShuffleEnabled: () => void;
  onVolumeBarClick: (e: MouseEvent<HTMLDivElement>) => void;
}

export function useTrackPagePlayback(): UseTrackPagePlaybackResult {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const playlistParam = searchParams.get('playlist')?.trim() || null;
  const {
    tracks,
    currentTrackIndex,
    activePlaylist,
    setActivePlaylist,
    shuffleUpcomingTrack,
    isPlaying,
    play,
    pause,
    isLoading,
    volume,
    setVolume,
    isRepeatEnabled,
    toggleRepeatEnabled,
    isShuffleEnabled,
    toggleShuffleEnabled,
  } = useAudioMain();
  const [shareFeedback, setShareFeedback] = useState<'idle' | 'copied'>('idle');
  const shareFeedbackTimerRef = useRef<number | null>(null);

  const trackIndex = tracks.findIndex((t) => t.id === id);
  const track = trackIndex >= 0 ? tracks[trackIndex] : undefined;

  useEffect(() => {
    if (playlistParam) {
      setActivePlaylist(playlistParam);
    }
  }, [playlistParam, setActivePlaylist]);

  useEffect(() => {
    if (!isLoading && !track) {
      navigate('/');
    }
  }, [track, navigate, isLoading]);

  const goToLibrary = useCallback(() => {
    navigate({
      pathname: '/',
      search: playlistParam ? `?playlist=${encodeURIComponent(playlistParam)}` : '',
    });
  }, [navigate, playlistParam]);

  const goAdjacentTrack = useCallback(
    (delta: -1 | 1) => {
      if (tracks.length <= 1 || trackIndex < 0) return;
      const scopedPlaylist = activePlaylist ?? (currentTrackIndex === trackIndex ? null : track?.playlist ?? null);
      const scopedTracks = scopedPlaylist
        ? tracks.map((t, index) => ({ track: t, index })).filter(({ track: t }) => t.playlist === scopedPlaylist)
        : tracks.map((t, index) => ({ track: t, index }));
      if (scopedTracks.length <= 1) return;
      const currentScopedIndex = scopedTracks.findIndex(({ index }) => index === trackIndex);
      const fromScopedIndex = currentScopedIndex >= 0 ? currentScopedIndex : 0;
      const nextScoped = scopedTracks[(fromScopedIndex + delta + scopedTracks.length) % scopedTracks.length];
      if (!nextScoped) return;
      const nextIndex = nextScoped.index;
      const next = nextScoped.track;
      navigate(`/track/${next.id}`, { replace: true });
      play(nextIndex, scopedPlaylist);
    },
    [tracks, trackIndex, activePlaylist, currentTrackIndex, track?.playlist, navigate, play]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        goToLibrary();
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goAdjacentTrack(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goAdjacentTrack(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToLibrary, goAdjacentTrack]);

  useEffect(() => {
    return () => {
      if (shareFeedbackTimerRef.current !== null) {
        window.clearTimeout(shareFeedbackTimerRef.current);
      }
    };
  }, []);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const title = `${track?.title ?? ''} — BOSS-MUSIC`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareFeedback('copied');
      if (shareFeedbackTimerRef.current !== null) {
        window.clearTimeout(shareFeedbackTimerRef.current);
      }
      shareFeedbackTimerRef.current = window.setTimeout(() => {
        setShareFeedback('idle');
        shareFeedbackTimerRef.current = null;
      }, 2000);
    } catch {
      /* noop */
    }
  }, [track?.title]);

  const isCurrent = currentTrackIndex === trackIndex;
  const scopedPlaylistForControls = activePlaylist ?? (currentTrackIndex === trackIndex ? null : track?.playlist ?? null);
  const scopedTracks = scopedPlaylistForControls
    ? tracks.map((t, index) => ({ track: t, index })).filter(({ track: t }) => t.playlist === scopedPlaylistForControls)
    : tracks.map((t, index) => ({ track: t, index }));
  const scopedTrackCount = scopedTracks.length;
  const canChangeTrack = scopedTrackCount > 1;
  const scopedCurrentPosition = scopedTracks.findIndex(({ index }) => index === trackIndex);
  const playbackPosition = scopedCurrentPosition >= 0 ? scopedCurrentPosition + 1 : 0;
  const playbackScopeName = scopedPlaylistForControls ?? 'すべて';
  const sequentialNextTrack =
    scopedCurrentPosition >= 0 && scopedTracks.length > 0
      ? scopedTracks[(scopedCurrentPosition + 1) % scopedTracks.length]?.track ?? null
      : null;
  const isAtScopeEnd = scopedCurrentPosition === scopedTracks.length - 1;
  const nextTrack = isShuffleEnabled
    ? shuffleUpcomingTrack
    : !isRepeatEnabled && isAtScopeEnd
      ? null
      : sequentialNextTrack;

  const onPlayPause = useCallback(() => {
    if (!track) return;
    if (isCurrent && isPlaying) {
      pause();
    } else {
      play(trackIndex, activePlaylist);
    }
  }, [track, isCurrent, isPlaying, pause, play, trackIndex, activePlaylist]);

  const onVolumeBarClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      setVolume(pointerRatioInElement(e.clientX, e.currentTarget));
    },
    [setVolume]
  );

  return {
    track: track ?? null,
    trackIndex,
    isLoading,
    isCurrent,
    isPlaying,
    canChangeTrack,
    volume,
    playbackScopeName,
    playbackPosition,
    playbackTotal: scopedTrackCount,
    nextTrack,
    isRepeatEnabled,
    isShuffleEnabled,
    shareFeedback,
    goToLibrary,
    goAdjacentTrack,
    handleShare,
    onPlayPause,
    toggleRepeatEnabled,
    toggleShuffleEnabled,
    onVolumeBarClick,
  };
}
