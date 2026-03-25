import React, { useCallback } from 'react';
import { useAudioMain, useAudioTime } from '../context/AudioContext';
import { formatTrackTime } from '../hooks/useTrackPagePlayback';

export type TrackSeekVariant = 'vinyl' | 'illustration' | 'spectrum';

interface TrackSeekRowProps {
  isCurrent: boolean;
  variant: TrackSeekVariant;
  /** 例: spectrum は mt-10、他は mt-12 */
  className?: string;
}

/** currentTime のみ購読。親レイアウト（ジャケ・背景）は timeupdate で再レンダーしない */
export const TrackSeekRow: React.FC<TrackSeekRowProps> = ({
  isCurrent,
  variant,
  className = 'mt-12 w-full max-w-md md:max-w-lg',
}) => {
  const { duration, seek } = useAudioMain();
  const currentTime = useAudioTime();
  const displayTime = isCurrent ? currentTime : 0;
  const displayDuration = isCurrent && duration > 0 ? duration : 0;
  const progress = displayDuration > 0 ? (displayTime / displayDuration) * 100 : 0;

  const onSeekBarClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isCurrent || displayDuration <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      seek(percent * displayDuration);
    },
    [isCurrent, displayDuration, seek]
  );

  const onSeekKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isCurrent || displayDuration <= 0) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const delta = e.key === 'ArrowLeft' ? -5 : 5;
        seek(Math.max(0, Math.min(displayDuration, displayTime + delta)));
      }
    },
    [isCurrent, displayDuration, displayTime, seek]
  );

  const trackBg =
    variant === 'vinyl' ? 'bg-white/20' : 'bg-white/15';
  const fill =
    variant === 'vinyl'
      ? 'bg-white'
      : variant === 'illustration'
        ? 'bg-teal-300/80'
        : 'bg-gradient-to-r from-fuchsia-400/90 to-cyan-300/90';
  const timeCls = variant === 'vinyl' ? 'text-white/40' : 'text-white/35';

  return (
    <div className={className}>
      <div
        role="slider"
        tabIndex={0}
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`group relative h-0.5 w-full cursor-pointer ${trackBg}`}
        onClick={onSeekBarClick}
        onKeyDown={onSeekKeyDown}
      >
        <div
          className={`absolute inset-y-0 left-0 transition-[width] duration-150 ${fill}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className={`mt-3 flex justify-between font-mono text-xs tabular-nums md:text-sm ${timeCls}`}>
        <span>{formatTrackTime(displayTime)}</span>
        <span>{formatTrackTime(displayDuration)}</span>
      </div>
    </div>
  );
};
