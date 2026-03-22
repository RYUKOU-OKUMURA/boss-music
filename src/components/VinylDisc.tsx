import React from 'react';
import clsx from 'clsx';

interface VinylDiscProps {
  isPlaying: boolean;
  coverImage: string;
  alt: string;
}

export const VinylDisc: React.FC<VinylDiscProps> = ({ isPlaying, coverImage, alt }) => {
  return (
    <div className="relative w-64 h-64 md:w-96 md:h-96 rounded-full overflow-hidden border border-white/10 shadow-2xl transition-all duration-1000 group-hover:scale-105 group-hover:border-white/30 neon-glow border-zen-accent/30">
      <img
        src={coverImage}
        alt={alt}
        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-1000"
        style={{
          animation: 'spin-slow 20s linear infinite',
          animationPlayState: isPlaying ? 'running' : 'paused'
        }}
      />
      {/* Static lighting overlay to give it a physical feel while spinning */}
      <div className="absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-white/10 pointer-events-none mix-blend-overlay"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-zen-bg/80 via-transparent to-transparent pointer-events-none"></div>
    </div>
  );
};
