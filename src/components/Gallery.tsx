import React from 'react';
import { useAudio } from '../context/AudioContext';
import { TrackCard } from './TrackCard';
import { Play } from 'lucide-react';

export const Gallery: React.FC = () => {
  const { tracks, play, isLoading } = useAudio();

  const tags = [
    { name: 'トレンド', active: true },
    { name: 'Synthwave', active: false },
    { name: 'Dark Techno', active: false },
    { name: 'Acid House', active: false },
    { name: 'Future Core', active: false },
    { name: 'サイバーパンク', active: false },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zen-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zen-bg text-zen-mist pt-24 pb-32 px-6 md:px-12 lg:px-24">
      {/* Hero Section */}
      <div className="mb-16 flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="max-w-2xl">
          <h1 className="text-5xl md:text-7xl font-headline font-bold text-white leading-tight tracking-tight">
            WEEKLY <span className="text-neon-cyan italic">BURST</span>
            <br />
            (ウィークリー・バースト)
          </h1>
          <p className="mt-6 text-lg text-zen-mist/70 font-light leading-relaxed">
            アンダーグラウンドから厳選されたハイエナジーなビート。
            <br />
            毎日午前0時に更新。
          </p>
        </div>
        <button
          onClick={() => play(0)}
          className="flex items-center gap-3 bg-neon-cyan text-black px-8 py-4 rounded-full font-bold text-sm tracking-wider hover:scale-105 transition-transform shadow-[0_0_30px_rgba(143,245,255,0.3)]"
        >
          <Play className="w-5 h-5" fill="currentColor" />
          シャッフル再生
        </button>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-3 mb-12">
        {tags.map((tag) => (
          <button
            key={tag.name}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              tag.active
                ? 'bg-neon-purple text-white shadow-[0_0_15px_rgba(214,116,255,0.4)]'
                : 'bg-surface border border-white/5 text-zen-mist/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tag.name}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8">
        {tracks.map((track, index) => (
          <TrackCard key={track.id} track={track} index={index} />
        ))}
      </div>
    </div>
  );
};
