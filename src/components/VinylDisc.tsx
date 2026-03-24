import React from 'react';

interface VinylDiscProps {
  isPlaying: boolean;
  coverImage?: string;
  alt: string;
}

/** 黒レコード＋中央ジャケ＋トーンアーム。再生中のみレコード部分が回転 */
export const VinylDisc: React.FC<VinylDiscProps> = ({ isPlaying, coverImage, alt }) => {
  return (
    <div className="relative mx-auto flex aspect-square w-[min(86vw,24rem,min(76vw,calc(100dvh-17rem)))] max-w-full shrink-0 items-center justify-center md:w-[min(24rem,calc(100dvh-16rem))]">
      {/* トーンアーム（回転しない・ディスク縮小に合わせて比例） */}
      <svg
        className="pointer-events-none absolute -right-1 top-2 z-30 h-[11rem] w-[8.75rem] drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] md:-right-2 md:top-3 md:h-[13rem] md:w-[10.25rem]"
        viewBox="0 0 120 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M98 12c4 0 8 3 9 7l18 52c1 3 0 6-2 8L72 118c-2 2-5 2-8 1l-4-2"
          stroke="rgba(255,255,255,0.88)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M98 12 L108 8 L118 38 L104 42 Z"
          fill="rgba(245,245,245,0.95)"
          stroke="rgba(0,0,0,0.15)"
          strokeWidth="0.5"
        />
        <ellipse cx="72" cy="118" rx="10" ry="5" fill="rgba(30,30,30,0.95)" />
        <circle cx="68" cy="112" r="3" fill="rgba(255,255,255,0.4)" />
      </svg>

      {/* レコード本体（回転） */}
      <div
        className="relative w-full h-full rounded-full will-change-transform"
        style={{
          animation: 'spin-slow 24s linear infinite',
          animationPlayState: isPlaying ? 'running' : 'paused',
        }}
      >
        <div
          className="absolute inset-0 rounded-full shadow-[0_28px_56px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)]"
          style={{
            background: `
              repeating-radial-gradient(
                circle at center,
                #050505 0px,
                #050505 3px,
                #0c0c0c 3px,
                #0c0c0c 6px
              )
            `,
          }}
        />
        <div
          className="absolute inset-0 rounded-full pointer-events-none opacity-[0.35]"
          style={{
            background:
              'repeating-radial-gradient(circle at center, transparent 0, transparent 8px, rgba(255,255,255,0.04) 8px, rgba(255,255,255,0.04) 9px)',
          }}
        />
        {/* 中央ラベル（ジャケ） */}
        <div className="absolute inset-[20%] rounded-full overflow-hidden z-10 border border-black/50 shadow-[inset_0_0_20px_rgba(0,0,0,0.85)] ring-1 ring-white/10">
          {coverImage ? (
            <img src={coverImage} alt={alt} className="w-full h-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1a1a22] to-[#0a0a0f]">
              <span className="font-headline text-xs tracking-[0.2em] text-white/35 md:text-sm">NO COVER</span>
            </div>
          )}
        </div>
        {/* センターホール */}
        <div className="absolute left-1/2 top-1/2 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-[#0a0b0d] shadow-inner" />
      </div>
    </div>
  );
};
