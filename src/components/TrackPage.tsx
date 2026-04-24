import React, { useEffect } from 'react';
import { useTrackPageUi } from '../context/TrackPageUiContext';
import { resolveCoverImageUrl } from '../lib/mediaUrls';
import { useTrackPagePlayback } from '../hooks/useTrackPagePlayback';
import { TrackPageVinylLayout } from './TrackPageVinylLayout';
import { TrackPageIllustrationLayout } from './TrackPageIllustrationLayout';
import { TrackPageSpectrumLayout } from './TrackPageSpectrumLayout';
import { TrackPagePatternMenu } from './TrackPagePatternMenu';
import { ChevronLeft, Link2 } from 'lucide-react';

const ILLUSTRATION_HERO_SRC = '/track-ui/character-duo.png';

function preloadImageUrl(url: string) {
  if (!url) return;
  const img = new Image();
  img.src = url;
}

export const TrackPage: React.FC = () => {
  const { pattern } = useTrackPageUi();
  const m = useTrackPagePlayback();

  useEffect(() => {
    if (!m.track) return;
    const cover = resolveCoverImageUrl(m.track);
    preloadImageUrl(cover);
    preloadImageUrl(ILLUSTRATION_HERO_SRC);
  }, [m.track]);

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
    canChangeTrack: m.canChangeTrack,
    playbackScopeName: m.playbackScopeName,
    playbackPosition: m.playbackPosition,
    playbackTotal: m.playbackTotal,
    nextTrack: m.nextTrack,
    isRepeatEnabled: m.isRepeatEnabled,
    isShuffleEnabled: m.isShuffleEnabled,
    onPlayPause: m.onPlayPause,
    goAdjacentTrack: m.goAdjacentTrack,
    toggleRepeatEnabled: m.toggleRepeatEnabled,
    toggleShuffleEnabled: m.toggleShuffleEnabled,
    volume: m.volume,
    onVolumeBarClick: m.onVolumeBarClick,
    spectrumPanelActive: pattern === 'spectrum',
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-zen-bg font-body text-zen-mist selection:bg-zen-accent/30">
      <div className="pointer-events-none fixed inset-0 z-0 landscape-gradient">
        <div className="fog-layer" />
        <div className="absolute inset-0 bg-[url('/textures/carbon-fibre.png')] opacity-[0.03] mix-blend-overlay" />
      </div>

      <button
        type="button"
        onClick={m.goToLibrary}
        className="fixed left-6 top-6 z-[60] inline-flex items-center gap-2 text-xs font-light tracking-[0.2em] text-white/40 transition-colors hover:text-white/90 md:left-10 md:top-8 md:text-sm"
        aria-label="ライブラリに戻る"
      >
        <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={1.25} />
        <span className="hidden sm:inline">ライブラリに戻る</span>
        <span className="sm:hidden">戻る</span>
      </button>

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

      <div className="relative isolate z-10 flex min-h-[calc(100dvh-7rem)] w-full flex-col overflow-x-hidden overflow-y-auto">
        {pattern === 'vinyl' ? <TrackPageVinylLayout {...layoutProps} /> : null}
        {pattern === 'illustration' ? <TrackPageIllustrationLayout {...layoutProps} /> : null}
        {pattern === 'spectrum' ? <TrackPageSpectrumLayout {...layoutProps} /> : null}
      </div>

      <div className="pointer-events-none fixed inset-0 z-[5] shadow-[inset_0_0_120px_rgba(0,0,0,0.5)]" />
    </div>
  );
};
