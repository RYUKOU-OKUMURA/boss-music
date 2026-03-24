import React from 'react';
import { Play, Pause, Volume2, SkipBack, SkipForward } from 'lucide-react';
import { useAudio } from '../context/AudioContext';
import { formatTrackTime } from '../hooks/useTrackPagePlayback';
import type { TrackPageLayoutProps } from './trackPageLayoutTypes';
import { SpectrumVisualizer } from './SpectrumVisualizer';

/** 周波数バー（スペクトラム）ヒーロー + 既存コントロール */
export const TrackPageSpectrumLayout: React.FC<TrackPageLayoutProps> = ({
  track,
  coverImageUrl: _coverImageUrl,
  displayTime,
  displayDuration,
  progress,
  canChangeTrack,
  onPlayPause,
  goAdjacentTrack,
  onSeekBarClick,
  onSeekKeyDown,
  volume,
  onVolumeBarClick,
  isCurrent,
  isPlaying,
}) => {
  const { audioAnalyserRef } = useAudio();

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col items-center justify-center px-6 py-8">
      <div className="w-full max-w-[min(100%,36rem)]">
        <SpectrumVisualizer analyserRef={audioAnalyserRef} isPlaying={isCurrent && isPlaying} />

        <div className="mt-8 text-center md:mt-10">
          <h1 className="text-2xl font-light tracking-tight text-white md:text-3xl">{track.title}</h1>
          <p className="mt-3 text-base font-light text-fuchsia-200/45 md:text-lg">{track.artist}</p>
        </div>

        {track.description?.trim() ? (
          <p className="mt-5 line-clamp-3 text-center text-sm font-light leading-relaxed text-white/35 md:text-base">
            {track.description}
          </p>
        ) : null}
      </div>

      <div className="mt-10 w-full max-w-md md:max-w-lg">
        <div
          role="slider"
          tabIndex={0}
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="group relative h-0.5 w-full cursor-pointer bg-white/15"
          onClick={onSeekBarClick}
          onKeyDown={onSeekKeyDown}
        >
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-fuchsia-400/90 to-cyan-300/90 transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 flex justify-between font-mono text-xs tabular-nums text-white/35 md:text-sm">
          <span>{formatTrackTime(displayTime)}</span>
          <span>{formatTrackTime(displayDuration)}</span>
        </div>
      </div>

      <div className="mt-10 flex items-center justify-center gap-10 md:gap-14">
        <button
          type="button"
          onClick={() => goAdjacentTrack(-1)}
          disabled={!canChangeTrack}
          className="p-2 text-white/45 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-25"
          aria-label="前の曲"
        >
          <SkipBack className="h-10 w-10 md:h-11 md:w-11" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onPlayPause}
          className="rounded-full p-4 text-white shadow-[0_0_28px_rgba(217,70,239,0.25)] transition-transform hover:scale-105"
          aria-label={isCurrent && isPlaying ? '一時停止' : '再生'}
        >
          {isCurrent && isPlaying ? (
            <Pause className="h-16 w-16 md:h-[4.5rem] md:w-[4.5rem]" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play className="ml-1 h-16 w-16 md:h-[4.5rem] md:w-[4.5rem]" fill="currentColor" strokeWidth={0} />
          )}
        </button>
        <button
          type="button"
          onClick={() => goAdjacentTrack(1)}
          disabled={!canChangeTrack}
          className="p-2 text-white/45 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-25"
          aria-label="次の曲"
        >
          <SkipForward className="h-10 w-10 md:h-11 md:w-11" strokeWidth={2} />
        </button>
      </div>

      <div className="mt-10 flex w-full max-w-md items-center gap-4 md:max-w-lg">
        <Volume2 className="h-5 w-5 shrink-0 text-fuchsia-300/35" aria-hidden />
        <div
          className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/10"
          onClick={onVolumeBarClick}
          role="slider"
          tabIndex={0}
          aria-valuenow={Math.round(volume * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="音量"
        >
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-fuchsia-400/60 to-cyan-300/50"
            style={{ width: `${volume * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};
