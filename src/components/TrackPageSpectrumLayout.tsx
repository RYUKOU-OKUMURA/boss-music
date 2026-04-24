import React from 'react';
import { useAudioMain } from '../context/AudioContext';
import type { TrackPageLayoutProps } from './trackPageLayoutTypes';
import { SpectrumVisualizer } from './SpectrumVisualizer';
import { TrackSeekRow } from './TrackSeekRow';
import { TrackPagePlaybackPanel } from './TrackPagePlaybackPanel';

/** 周波数バー（スペクトラム）ヒーロー + 既存コントロール */
export const TrackPageSpectrumLayout: React.FC<TrackPageLayoutProps> = ({
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
  spectrumPanelActive = true,
}) => {
  const { audioAnalyserRef, isPlaying: audioIsPlaying } = useAudioMain();

  return (
    <div className="relative flex w-full flex-col items-center justify-start px-6 py-6 pb-12 md:py-8">
      <div className="w-full max-w-[min(100%,36rem)]">
        {/*
          Analyser はグローバルな audio 要素に接続済み。isCurrent && isPlaying だと
          トラック同期の一瞬や状態のずれでアイドル描画になり、右側が動かないように見えることがある。
        */}
        <SpectrumVisualizer
          analyserRef={audioAnalyserRef}
          isPlaying={audioIsPlaying}
          panelActive={spectrumPanelActive}
        />

        <div className="mt-8 text-center md:mt-10">
          <h1 className="text-2xl font-light tracking-tight text-white md:text-3xl">{track.title}</h1>
          <p className="mt-3 text-base font-light text-fuchsia-200/45 md:text-lg">{track.artist}</p>
        </div>
      </div>

      <TrackSeekRow variant="spectrum" isCurrent={isCurrent} className="mt-10 w-full max-w-md md:max-w-lg" />

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
