import React from 'react';
import { Pause, Play, Repeat2, Shuffle, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { resolveCoverImageUrl } from '../lib/mediaUrls';
import type { Track } from '../context/AudioContext';

interface TrackPagePlaybackPanelProps {
  isCurrent: boolean;
  isPlaying: boolean;
  canChangeTrack: boolean;
  playbackScopeName: string;
  playbackPosition: number;
  playbackTotal: number;
  nextTrack: Track | null;
  isRepeatEnabled: boolean;
  isShuffleEnabled: boolean;
  onPlayPause: () => void;
  goAdjacentTrack: (delta: -1 | 1) => void;
  toggleRepeatEnabled: () => void;
  toggleShuffleEnabled: () => void;
  volume: number;
  onVolumeBarClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  accentClassName?: string;
}

export const TrackPagePlaybackPanel: React.FC<TrackPagePlaybackPanelProps> = ({
  isCurrent,
  isPlaying,
  canChangeTrack,
  playbackScopeName,
  playbackPosition,
  playbackTotal,
  nextTrack,
  isRepeatEnabled,
  isShuffleEnabled,
  onPlayPause,
  goAdjacentTrack,
  toggleRepeatEnabled,
  toggleShuffleEnabled,
  volume,
  onVolumeBarClick,
  accentClassName = 'text-neon-cyan',
}) => {
  const nextCover = nextTrack ? resolveCoverImageUrl(nextTrack) : '';

  return (
    <div className="mt-10 flex w-full max-w-xl flex-col items-center px-2">
      <div className="mb-5 flex min-h-6 max-w-full items-center gap-2 text-xs font-medium text-white/45">
        <span className="max-w-[12rem] truncate text-white/70">{playbackScopeName}</span>
        <span className="text-white/25">/</span>
        <span>
          {playbackPosition || 0} / {playbackTotal || 0}
        </span>
      </div>

      <div className="flex items-center justify-center gap-5 sm:gap-8 md:gap-10">
        <button
          type="button"
          onClick={toggleShuffleEnabled}
          className={`p-2 transition-colors ${isShuffleEnabled ? 'text-neon-purple' : 'text-white/35 hover:text-white/80'}`}
          aria-pressed={isShuffleEnabled}
          aria-label={isShuffleEnabled ? 'シャッフルをオフにする' : 'シャッフルをオンにする'}
        >
          <Shuffle className="h-6 w-6" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => goAdjacentTrack(-1)}
          disabled={!canChangeTrack}
          className="p-2 text-white/50 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-25"
          aria-label="前の曲"
        >
          <SkipBack className="h-9 w-9 md:h-10 md:w-10" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onPlayPause}
          className="p-4 text-white transition-transform hover:scale-105"
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
          className="p-2 text-white/50 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-25"
          aria-label="次の曲"
        >
          <SkipForward className="h-9 w-9 md:h-10 md:w-10" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={toggleRepeatEnabled}
          className={`p-2 transition-colors ${isRepeatEnabled ? accentClassName : 'text-white/35 hover:text-white/80'}`}
          aria-pressed={isRepeatEnabled}
          aria-label={isRepeatEnabled ? 'プレイリストリピートをオフにする' : 'プレイリストリピートをオンにする'}
        >
          <Repeat2 className="h-6 w-6" strokeWidth={2} />
        </button>
      </div>

      <div className="mt-8 flex w-full max-w-md items-center gap-4 md:max-w-lg">
        <Volume2 className="h-5 w-5 shrink-0 text-white/35" aria-hidden />
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
          <div className="absolute left-0 top-0 h-full rounded-full bg-white/50" style={{ width: `${volume * 100}%` }} />
        </div>
      </div>

      <div className="mt-8 flex min-h-16 w-full max-w-md items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-left">
        {nextTrack ? (
          <>
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-white/10">
              {nextCover ? <img src={nextCover} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">次の曲</p>
              <p className="mt-1 truncate text-sm font-bold text-white">{nextTrack.title}</p>
              <p className="truncate text-xs text-white/45">{nextTrack.artist}</p>
            </div>
          </>
        ) : (
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">次の曲</p>
            <p className="mt-1 text-sm font-bold text-white/60">次の曲なし</p>
          </div>
        )}
      </div>
    </div>
  );
};
