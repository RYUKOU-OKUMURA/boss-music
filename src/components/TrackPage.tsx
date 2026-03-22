import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAudio } from '../context/AudioContext';
import { resolveCoverImageUrl } from '../lib/mediaUrls';
import { VinylDisc } from './VinylDisc';
import { Menu, Play, Pause, VolumeX } from 'lucide-react';

export const TrackPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tracks, currentTrackIndex, isPlaying, play, pause, isLoading, currentTime, duration, seek } = useAudio();

  const trackIndex = tracks.findIndex((t) => t.id === id);
  const track = tracks[trackIndex];

  useEffect(() => {
    if (!isLoading && !track) {
      navigate('/');
    }
  }, [track, navigate, isLoading]);

  if (isLoading) {
    return (
      <div className="bg-zen-bg min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-zen-accent/30 border-t-zen-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!track) return null;

  const isCurrent = currentTrackIndex === trackIndex;
  const displayTime = isCurrent ? currentTime : 0;
  const displayDuration = isCurrent && duration > 0 ? duration : 0;
  const progress = displayDuration > 0 ? (displayTime / displayDuration) * 100 : 0;

  const formatTime = (time: number) => {
    if (isNaN(time) || time === 0) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-zen-bg text-zen-mist font-body selection:bg-zen-accent/30 min-h-screen overflow-hidden flex items-center justify-center cursor-crosshair">
      <div className="fixed inset-0 z-0 landscape-gradient">
        <div className="fog-layer"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] mix-blend-overlay"></div>
        <div className="absolute bottom-0 left-0 right-0 h-[614px] opacity-20 pointer-events-none">
          <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1440 320">
            <path d="M0,192L48,197.3C96,203,192,213,288,192C384,171,480,117,576,122.7C672,128,768,192,864,197.3C960,203,1056,149,1152,144C1248,139,1344,181,1392,202.7L1440,224L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" fill="#ffffff" fillOpacity="0.1"></path>
          </svg>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-4xl h-screen flex flex-col items-center justify-center hover-trigger group">
        <VinylDisc isPlaying={isCurrent && isPlaying} coverImage={resolveCoverImageUrl(track)} alt={track.title} />

        <div className="hover-reveal absolute inset-0 flex flex-col items-center justify-center text-center space-y-8 pointer-events-none">
          <div className="space-y-2">
            <p className="text-xs tracking-[0.4em] text-zen-accent/70 font-light">
              {isCurrent && isPlaying ? '再生中' : '一時停止'}
            </p>
            <h1 className="text-5xl md:text-7xl font-headline font-light tracking-widest text-white">
              {track.title.split(' ')[0]} <span className="text-zen-accent">{track.title.split(' ').slice(1).join(' ')}</span>
            </h1>
            <p className="text-lg md:text-xl font-body font-extralight tracking-[0.2em] opacity-60">
              {track.artist}
            </p>
          </div>
          <div className="w-px h-24 bg-gradient-to-b from-white/20 to-transparent"></div>
          <p className="max-w-md text-sm md:text-base italic font-light leading-loose opacity-50 px-6">
            「{track.description}」
          </p>
        </div>

        <div className="absolute right-8 md:right-16 top-1/2 -translate-y-1/2 hidden md:flex flex-col items-center gap-12 opacity-20 hover:opacity-100 transition-opacity duration-700">
          <span className="vertical-text text-[10px] tracking-[0.8em] font-light uppercase">AMBIENT SPACE</span>
          <div className="w-px h-12 bg-white/40"></div>
          <span className="vertical-text text-[10px] tracking-[0.8em] font-light uppercase text-zen-accent">ライブトラック</span>
        </div>
      </div>

      <div className="fixed bottom-12 left-0 right-0 z-50 flex flex-col items-center gap-8">
        <div 
          className="w-64 md:w-96 h-[1px] bg-white/10 relative group cursor-pointer transition-all hover:h-[2px]"
          onClick={(e) => {
            if (!isCurrent) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            seek(percent * duration);
          }}
        >
          <div 
            className="absolute inset-y-0 left-0 bg-zen-accent/50 group-hover:bg-zen-accent transition-colors" 
            style={{ width: `${progress}%`, boxShadow: '0 0 10px #BC00FF' }}
          ></div>
          <div 
            className="absolute -top-6 -translate-x-1/2 text-[10px] opacity-0 group-hover:opacity-40 transition-opacity font-light whitespace-nowrap"
            style={{ left: `${progress}%` }}
          >
            {formatTime(displayTime)} / {formatTime(displayDuration)}
          </div>
        </div>
        <div className="flex items-center gap-16">
          <button className="text-white/20 hover:text-white transition-all duration-500 relative group">
            <Menu className="w-6 h-6 font-extralight" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 opacity-0 group-hover:opacity-100 transition-opacity zen-glass px-6 py-4 rounded-sm border border-white/5 min-w-[280px] pointer-events-none">
              <div className="space-y-4 text-left">
                <div>
                  <span className="text-[9px] block text-white/40 tracking-widest mb-1 uppercase">制作日</span>
                  <p className="text-xs font-light">{track.createdAt}</p>
                </div>
                <div>
                  <span className="text-[9px] block text-white/40 tracking-widest mb-1 uppercase">ジャンル</span>
                  <p className="text-xs font-light">{track.tags.join(', ')}</p>
                </div>
                <div>
                  <span className="text-[9px] block text-white/40 tracking-widest mb-1 uppercase">クレジット</span>
                  <p className="text-[10px] leading-relaxed font-light text-white/60">
                    メインプロデュース: {track.artist}.
                  </p>
                </div>
              </div>
            </div>
          </button>
          <button className="text-[10px] hover:text-zen-accent transition-colors underline underline-offset-4 decoration-white/10">プレイリストに追加</button>
          <button className="text-[10px] hover:text-zen-accent transition-colors underline underline-offset-4 decoration-white/10">共有する</button>
        </div>
      </div>

      <button
        onClick={() => {
          if (isCurrent && isPlaying) {
            pause();
          } else {
            play(trackIndex);
          }
        }}
        className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-white/30 hover:scale-105 transition-all duration-700 fixed bottom-32 left-1/2 -translate-x-1/2 z-50 shadow-[0_0_15px_rgba(188,0,255,0.3)]"
      >
        {isCurrent && isPlaying ? (
          <Pause className="w-8 h-8 font-extralight" fill="currentColor" />
        ) : (
          <Play className="w-8 h-8 font-extralight ml-1" fill="currentColor" />
        )}
      </button>

      <button className="text-white/20 hover:text-white transition-all duration-500 group relative">
        <VolumeX className="w-6 h-6 font-extralight fixed bottom-14 right-12 z-50" />
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 opacity-0 group-hover:opacity-100 h-24 w-px bg-white/10 transition-opacity">
          <div className="absolute bottom-0 left-0 w-full h-[80%] bg-zen-accent/40"></div>
        </div>
      </button>

      <div className="fixed inset-0 pointer-events-none shadow-[inset_0_0_200px_rgba(0,0,0,0.8)] z-20"></div>
    </div>
  );
};
