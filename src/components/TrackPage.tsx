import React from 'react';
import { Link } from 'react-router-dom';
import { useTrackPageUi } from '../context/TrackPageUiContext';
import { resolveCoverImageUrl } from '../lib/mediaUrls';
import { useTrackPagePlayback } from '../hooks/useTrackPagePlayback';
import { TrackPageVinylLayout } from './TrackPageVinylLayout';
import { TrackPageIllustrationLayout } from './TrackPageIllustrationLayout';
import { TrackPagePatternMenu } from './TrackPagePatternMenu';
import { ChevronLeft, Link2 } from 'lucide-react';

export const TrackPage: React.FC = () => {
  const { pattern } = useTrackPageUi();
  const m = useTrackPagePlayback();

  if (m.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zen-bg">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zen-accent/30 border-t-zen-accent"></div>
      </div>
    );
  }

  if (!m.track) return null;

  const layoutProps = {
    track: m.track,
    coverImageUrl: resolveCoverImageUrl(m.track),
    isCurrent: m.isCurrent,
    isPlaying: m.isPlaying,
    displayTime: m.displayTime,
    displayDuration: m.displayDuration,
    progress: m.progress,
    canChangeTrack: m.canChangeTrack,
    onPlayPause: m.onPlayPause,
    goAdjacentTrack: m.goAdjacentTrack,
    onSeekBarClick: m.onSeekBarClick,
    onSeekKeyDown: m.onSeekKeyDown,
    volume: m.volume,
    onVolumeBarClick: m.onVolumeBarClick,
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-zen-bg font-body text-zen-mist selection:bg-zen-accent/30">
      <div className="pointer-events-none fixed inset-0 z-0 landscape-gradient">
        <div className="fog-layer" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] mix-blend-overlay" />
      </div>

      <Link
        to="/"
        className="fixed left-6 top-6 z-[60] inline-flex items-center gap-2 text-xs font-light tracking-[0.2em] text-white/40 transition-colors hover:text-white/90 md:left-10 md:top-8 md:text-sm"
        aria-label="ライブラリに戻る"
      >
        <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={1.25} />
        <span className="hidden sm:inline">ライブラリに戻る</span>
        <span className="sm:hidden">戻る</span>
      </Link>

      <div className="fixed right-6 top-6 z-[60] flex items-center gap-3 md:right-10 md:top-8">
        <TrackPagePatternMenu placement="track" />
        <button
          type="button"
          onClick={() => void m.handleShare()}
          className="inline-flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-white/80"
          aria-label="この曲のリンクを共有"
        >
          <Link2 className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span className="hidden sm:inline">{m.shareFeedback === 'copied' ? 'コピーしました' : '共有'}</span>
        </button>
      </div>

      {pattern === 'vinyl' ? (
        <TrackPageVinylLayout {...layoutProps} />
      ) : (
        <TrackPageIllustrationLayout {...layoutProps} />
      )}

      <div className="pointer-events-none fixed inset-0 z-[5] shadow-[inset_0_0_120px_rgba(0,0,0,0.5)]" />
    </div>
  );
};
