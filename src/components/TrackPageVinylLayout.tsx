import React from 'react';
import { VinylDisc } from './VinylDisc';
import type { TrackPageLayoutProps } from './trackPageLayoutTypes';
import { TrackSeekRow } from './TrackSeekRow';
import { TrackPagePlaybackPanel } from './TrackPagePlaybackPanel';

export const TrackPageVinylLayout: React.FC<TrackPageLayoutProps> = ({
  track,
  coverImageUrl,
  isCurrent,
  isPlaying,
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
}) => {
  return (
    <div className="relative flex w-full flex-col items-center justify-start px-6 py-6 pb-12 md:py-8">
      <VinylDisc isPlaying={isCurrent && isPlaying} coverImage={coverImageUrl} alt={track.title} />

      <div className="mt-12 max-w-2xl px-2 text-center md:mt-14">
        <h1 className="text-3xl font-light italic leading-snug tracking-tight text-white md:text-4xl">
          {track.title}
        </h1>
        <p className="mt-4 text-base font-light text-white/45 md:text-lg">{track.artist}</p>
      </div>

      <TrackSeekRow variant="vinyl" isCurrent={isCurrent} />

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
