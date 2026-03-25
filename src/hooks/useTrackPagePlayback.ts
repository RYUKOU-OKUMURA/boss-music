import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAudioMain } from '../context/AudioContext';
import type { Track } from '../context/AudioContext';

export function formatTrackTime(time: number) {
  if (isNaN(time) || time === 0) return '0:00';
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export interface UseTrackPagePlaybackResult {
  track: Track | null;
  trackIndex: number;
  isLoading: boolean;
  isCurrent: boolean;
  isPlaying: boolean;
  canChangeTrack: boolean;
  volume: number;
  shareFeedback: 'idle' | 'copied';
  goToLibrary: () => void;
  goAdjacentTrack: (delta: -1 | 1) => void;
  handleShare: () => Promise<void>;
  onPlayPause: () => void;
  onVolumeBarClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function useTrackPagePlayback(): UseTrackPagePlaybackResult {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    tracks,
    currentTrackIndex,
    isPlaying,
    play,
    pause,
    isLoading,
    volume,
    setVolume,
  } = useAudioMain();
  const [shareFeedback, setShareFeedback] = useState<'idle' | 'copied'>('idle');

  const trackIndex = tracks.findIndex((t) => t.id === id);
  const track = trackIndex >= 0 ? tracks[trackIndex] : undefined;

  useEffect(() => {
    if (!isLoading && !track) {
      navigate('/');
    }
  }, [track, navigate, isLoading]);

  const goToLibrary = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const goAdjacentTrack = useCallback(
    (delta: -1 | 1) => {
      if (tracks.length <= 1 || trackIndex < 0) return;
      const nextIndex = (trackIndex + delta + tracks.length) % tracks.length;
      const next = tracks[nextIndex];
      navigate(`/track/${next.id}`, { replace: true });
      play(nextIndex);
    },
    [tracks, trackIndex, navigate, play]
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
      window.setTimeout(() => setShareFeedback('idle'), 2000);
    } catch {
      /* noop */
    }
  }, [track?.title]);

  const isCurrent = currentTrackIndex === trackIndex;
  const canChangeTrack = tracks.length > 1;

  const onPlayPause = useCallback(() => {
    if (!track) return;
    if (isCurrent && isPlaying) {
      pause();
    } else {
      play(trackIndex);
    }
  }, [track, isCurrent, isPlaying, pause, play, trackIndex]);

  const onVolumeBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setVolume(p);
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
    shareFeedback,
    goToLibrary,
    goAdjacentTrack,
    handleShare,
    onPlayPause,
    onVolumeBarClick,
  };
}
