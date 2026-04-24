import React from 'react';
import { useAudio } from '../context/AudioContext';
import { resolveCoverImageUrl } from '../lib/mediaUrls';
import { Play, Pause, SkipBack, SkipForward, Volume2, Maximize2, Repeat2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export const GlobalPlayer: React.FC = () => {
  const { currentTrack, activePlaylist, isPlaying, play, pause, next, prev, currentTime, duration, volume, setVolume, seek } = useAudio();
  const location = useLocation();

  // Hide global player on track page since it has its own controls
  if (location.pathname.startsWith('/track/')) {
    return null;
  }

  if (!currentTrack) return null;

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-xl border-t border-white/5 px-6 py-3 flex items-center justify-between">
      {/* Track Info */}
      <div className="flex items-center gap-4 w-1/3">
        <div className="w-12 h-12 rounded-md overflow-hidden relative group">
          <img src={resolveCoverImageUrl(currentTrack)} alt={currentTrack.title} className="w-full h-full object-cover" />
          <Link to={`/track/${currentTrack.id}`} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Maximize2 className="w-4 h-4 text-white" />
          </Link>
        </div>
        <div>
          <Link to={`/track/${currentTrack.id}`} className="text-sm font-bold text-white hover:underline">
            {currentTrack.title}
          </Link>
          <p className="text-xs text-zen-mist/60">{currentTrack.artist}</p>
          <p className="text-[10px] text-neon-cyan/70 mt-1 flex items-center gap-1">
            <Repeat2 className="w-3 h-3" />
            {activePlaylist ?? 'すべて'} をリピート
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-2 w-1/3">
        <div className="flex items-center gap-6">
          <button onClick={prev} className="text-zen-mist/60 hover:text-white transition-colors">
            <SkipBack className="w-5 h-5" fill="currentColor" />
          </button>
          <button
            onClick={() => isPlaying ? pause() : play()}
            className="w-10 h-10 rounded-full bg-neon-cyan flex items-center justify-center text-black hover:scale-105 transition-transform shadow-[0_0_15px_rgba(143,245,255,0.4)]"
          >
            {isPlaying ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5 ml-1" fill="currentColor" />}
          </button>
          <button onClick={next} className="text-zen-mist/60 hover:text-white transition-colors">
            <SkipForward className="w-5 h-5" fill="currentColor" />
          </button>
        </div>
        <div className="w-full flex items-center gap-3 text-xs text-zen-mist/40 font-mono">
          <span>{formatTime(currentTime)}</span>
          <div 
            className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer relative group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const percent = (e.clientX - rect.left) / rect.width;
              seek(percent * duration);
            }}
          >
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-neon-cyan to-neon-green rounded-full group-hover:from-neon-cyan group-hover:to-neon-cyan transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center justify-end gap-4 w-1/3">
        <Volume2 className="w-4 h-4 text-zen-mist/60" />
        <div 
          className="w-24 h-1 bg-white/10 rounded-full cursor-pointer relative"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setVolume(percent);
          }}
        >
          <div 
            className="absolute top-0 left-0 h-full bg-neon-cyan rounded-full"
            style={{ width: `${volume * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};
