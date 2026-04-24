import React from 'react';
import type { TrackPageLayoutProps } from './trackPageLayoutTypes';
import { TrackSeekRow } from './TrackSeekRow';
import { TrackPagePlaybackPanel } from './TrackPagePlaybackPanel';

const HERO_SRC = '/track-ui/character-duo.png';

/** 静止のイラストヒーロー UI（回転なし・カバー画像は使用しない） */
export const TrackPageIllustrationLayout: React.FC<TrackPageLayoutProps> = ({
  track,
  coverImageUrl: _coverImageUrl,
  canChangeTrack,
  onPlayPause,
  goAdjacentTrack,
  playbackScopeName,
  playbackPosition,
  playbackTotal,
  nextTrack,
  isRepeatEnabled,
  isShuffleEnabled,
  toggleRepeatEnabled,
  toggleShuffleEnabled,
  volume,
  onVolumeBarClick,
  isCurrent,
  isPlaying,
}) => {
  return (
    <div className="relative flex w-full flex-col items-center justify-start px-6 py-6 pb-12 md:py-8">
      <div className="mx-auto w-full max-w-[min(100%,24rem,min(86vw,calc(100dvh-19rem)))]">
        <div className="overflow-hidden rounded-2xl border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.55)] ring-1 ring-teal-500/15 md:rounded-3xl">
          <img
            src={HERO_SRC}
            alt=""
            className="aspect-square w-full object-cover"
            decoding="async"
          />
        </div>

        <div className="mt-10 text-center md:mt-12">
          <h1 className="text-2xl font-light tracking-tight text-white md:text-3xl">{track.title}</h1>
          <p className="mt-3 text-base font-light text-teal-200/50 md:text-lg">{track.artist}</p>
        </div>
      </div>

      <TrackSeekRow variant="illustration" isCurrent={isCurrent} />

      <TrackPagePlaybackPanel
        isCurrent={isCurrent}
        isPlaying={isPlaying}
        canChangeTrack={canChangeTrack}
        playbackScopeName={playbackScopeName}
        playbackPosition={playbackPosition}
        playbackTotal={playbackTotal}
        nextTrack={nextTrack}
        isRepeatEnabled={isRepeatEnabled}
        isShuffleEnabled={isShuffleEnabled}
        onPlayPause={onPlayPause}
        goAdjacentTrack={goAdjacentTrack}
        toggleRepeatEnabled={toggleRepeatEnabled}
        toggleShuffleEnabled={toggleShuffleEnabled}
        volume={volume}
        onVolumeBarClick={onVolumeBarClick}
      />
    </div>
  );
};
