import React from 'react';
import clsx from 'clsx';

interface VinylDiscProps {
  isPlaying: boolean;
  coverImage?: string;
  alt: string;
}

export const VinylDisc: React.FC<VinylDiscProps> = ({ isPlaying, coverImage, alt }) => {
  return (
    <div className="relative w-64 h-64 md:w-96 md:h-96 rounded-full overflow-hidden border border-white/10 shadow-2xl transition-all duration-1000 group-hover:scale-105 group-hover:border-white/30 neon-glow border-zen-accent/30">
      {coverImage ? (
        <img
          src={coverImage}
          alt={alt}
          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-1000"
          style={{
            animation: 'spin-slow 20s linear infinite',
            animationPlayState: isPlaying ? 'running' : 'paused',
          }}
        />
      ) : (
        <div
          className="w-full h-full bg-[radial-gradient(circle_at_top,#8ff5ff33,transparent_55%),linear-gradient(135deg,#10141d,#05070b)] flex items-center justify-center text-white/60"
          style={{
            animation: 'spin-slow 20s linear infinite',
            animationPlayState: isPlaying ? 'running' : 'paused',
          }}
        >
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border border-white/15 bg-black/30 flex items-center justify-center text-center px-4 text-sm md:text-lg font-headline tracking-[0.25em]">
            NO COVER
          </div>
        </div>
      )}
      {/* Static lighting overlay to give it a physical feel while spinning */}
      <div className="absolute inset-0 bg-gradient-to-tr from-black/40 via-transparent to-white/10 pointer-events-none mix-blend-overlay"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-zen-bg/80 via-transparent to-transparent pointer-events-none"></div>
    </div>
  );
};
