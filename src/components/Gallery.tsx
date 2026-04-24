import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAudioMain } from '../context/AudioContext';
import { TrackCard } from './TrackCard';
import { Play } from 'lucide-react';

function trackMatchesQuery(
  track: { title: string; artist: string; description: string; tags: string[] },
  queryLower: string
): boolean {
  const haystack = [track.title, track.artist, track.description, ...track.tags].join(' ').toLowerCase();
  return haystack.includes(queryLower);
}

export const Gallery: React.FC = () => {
  const { tracks, play, isLoading } = useAudioMain();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryRaw = searchParams.get('q')?.trim() ?? '';
  const queryLower = queryRaw.toLowerCase();
  const selectedPlaylist = searchParams.get('playlist')?.trim() || null;

  const playlists = useMemo(() => {
    const seen = new Set<string>();
    return tracks
      .map((track) => track.playlist?.trim() || 'BGM')
      .filter((playlist) => {
        if (seen.has(playlist)) return false;
        seen.add(playlist);
        return true;
      });
  }, [tracks]);

  const filteredTracks = useMemo(() => {
    const playlistTracks = selectedPlaylist ? tracks.filter((t) => t.playlist === selectedPlaylist) : tracks;
    if (!queryRaw) return playlistTracks;
    return playlistTracks.filter((t) => trackMatchesQuery(t, queryLower));
  }, [tracks, selectedPlaylist, queryRaw, queryLower]);

  const shuffleStartIndex = useMemo(() => {
    if (filteredTracks.length === 0) return 0;
    const i = tracks.findIndex((t) => t.id === filteredTracks[0].id);
    return i >= 0 ? i : 0;
  }, [filteredTracks, tracks]);

  const selectPlaylist = (playlist: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (playlist) {
          next.set('playlist', playlist);
        } else {
          next.delete('playlist');
        }
        return next;
      },
      { replace: true }
    );
  };

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
            BOSS-MUSIC <span className="text-neon-cyan italic">LIBRARY</span>
          </h1>
          <p className="mt-6 text-lg text-zen-mist/70 font-light leading-relaxed">
            アンダーグラウンドから厳選されたハイエナジーなビート。
            <br />
            毎日午前0時に更新。
          </p>
        </div>
        <button
          onClick={() => play(shuffleStartIndex, selectedPlaylist)}
          disabled={filteredTracks.length === 0}
          className="flex items-center gap-3 bg-neon-cyan text-black px-8 py-4 rounded-full font-bold text-sm tracking-wider hover:scale-105 transition-transform shadow-[0_0_30px_rgba(143,245,255,0.3)]"
        >
          <Play className="w-5 h-5" fill="currentColor" />
          {selectedPlaylist ? `${selectedPlaylist} を再生` : 'ライブラリを再生'}
        </button>
      </div>

      {/* Playlists */}
      <div className="flex flex-wrap gap-3 mb-12">
        <button
          onClick={() => selectPlaylist(null)}
          className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
            selectedPlaylist === null
              ? 'bg-neon-purple text-white shadow-[0_0_15px_rgba(214,116,255,0.4)]'
              : 'bg-surface border border-white/5 text-zen-mist/70 hover:bg-white/10 hover:text-white'
          }`}
        >
          すべて
        </button>
        {playlists.map((playlist) => (
          <button
            key={playlist}
            onClick={() => selectPlaylist(playlist)}
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              selectedPlaylist === playlist
                ? 'bg-neon-purple text-white shadow-[0_0_15px_rgba(214,116,255,0.4)]'
                : 'bg-surface border border-white/5 text-zen-mist/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {playlist}
          </button>
        ))}
      </div>

      {/* Search results (URL ?q= でナビと同期) */}
      {queryRaw ? (
        <p className="text-sm text-zen-mist/70 mb-6">
          「{queryRaw}」の検索結果 — {filteredTracks.length} 件
        </p>
      ) : null}

      {queryRaw && filteredTracks.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-surface/50 px-8 py-16 text-center text-zen-mist/60">
          該当する曲が見つかりませんでした。別のキーワードで試してください。
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 md:gap-8">
          {filteredTracks.map((track) => {
            const index = tracks.findIndex((t) => t.id === track.id);
            return <TrackCard key={track.id} track={track} index={index} playbackPlaylist={selectedPlaylist} />;
          })}
        </div>
      )}
    </div>
  );
};
