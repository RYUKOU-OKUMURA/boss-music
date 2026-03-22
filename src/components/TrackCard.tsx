import React from 'react';
import { useAudio, Track } from '../context/AudioContext';
import { resolveCoverImageUrl } from '../lib/mediaUrls';
import { Play, Pause } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

export const TrackCard: React.FC<{ track: Track; index: number }> = ({ track, index }) => {
  const { currentTrack, isPlaying, play, pause } = useAudio();
  const isCurrent = currentTrack?.id === track.id;

  return (
    <div className="group relative bg-surface-container rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:bg-surface-bright flex flex-col">
      <div className="relative aspect-square overflow-hidden">
        <img
          src={resolveCoverImageUrl(track)}
          alt={track.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <button
            onClick={(e) => {
              e.preventDefault();
              isCurrent && isPlaying ? pause() : play(index);
            }}
            className="w-14 h-14 rounded-full bg-neon-cyan text-black flex items-center justify-center transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-[0_0_20px_rgba(143,245,255,0.5)]"
          >
            {isCurrent && isPlaying ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6 ml-1" fill="currentColor" />}
          </button>
        </div>
        
        {/* Badges */}
        <div className="absolute top-3 right-3 flex gap-2">
          {track.playable && (
            <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-neon-green/20 text-neon-green rounded-full backdrop-blur-md border border-neon-green/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
              再生可能
            </span>
          )}
          {index === 4 && (
            <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-neon-purple/20 text-neon-purple rounded-full backdrop-blur-md border border-neon-purple/30 flex items-center gap-1">
              ★ プレミアム
            </span>
          )}
        </div>
      </div>
      
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <Link to={`/track/${track.id}`} className="text-lg font-headline font-bold text-white hover:text-neon-cyan transition-colors line-clamp-1">
            {track.title}
          </Link>
          <p className="text-sm text-zen-mist/60 mt-1 line-clamp-1">{track.artist}</p>
        </div>
      </div>
    </div>
  );
};
