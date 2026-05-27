import React, { useCallback } from 'react';
import { usePointerSlider } from '../hooks/usePointerSlider';
import { clamp01 } from '../lib/playback';

interface VolumeSliderProps {
  value: number;
  onChange: (volume: number) => void;
  className?: string;
  trackClassName?: string;
  fillClassName?: string;
  'aria-label'?: string;
}

export const VolumeSlider: React.FC<VolumeSliderProps> = ({
  value,
  onChange,
  className = '',
  trackClassName = 'relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/10 touch-none select-none',
  fillClassName = 'absolute left-0 top-0 h-full rounded-full bg-white/50',
  'aria-label': ariaLabel = '音量',
}) => {
  const handleChange = useCallback((ratio: number) => onChange(ratio), [onChange]);
  const { trackRef, trackProps } = usePointerSlider(handleChange);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.01 : 0.05;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      onChange(clamp01(value - step));
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      onChange(clamp01(value + step));
    }
  };

  return (
    <div
      ref={trackRef}
      {...trackProps}
      role="slider"
      tabIndex={0}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`${trackClassName} ${className}`.trim()}
    >
      <div className={fillClassName} style={{ width: `${value * 100}%` }} />
    </div>
  );
};
