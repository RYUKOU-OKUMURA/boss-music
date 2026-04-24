import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAudioMain } from '../context/AudioContext';
import { TrackCard } from './TrackCard';
import { Folder, Music2, Play } from 'lucide-react';

function trackMatchesQuery(
  track: { title: string; artist: string; description: string; tags: string[] },
  queryLower: string
): boolean {
  const haystack = [track.title, track.artist, track.description, ...track.tags].join(' ').toLowerCase();
  return haystack.includes(queryLower);
}

export const Gallery: React.FC = () => {
  const { tracks, play, setActivePlaylist, isLoading } = useAudioMain();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryRaw = searchParams.get('q')?.trim() ?? '';
  const queryLower = queryRaw.toLowerCase();
  const selectedPlaylist = searchParams.get('playlist')?.trim() || null;

  useEffect(() => {
    setActivePlaylist(selectedPlaylist);
  }, [selectedPlaylist, setActivePlaylist]);

  const playlists = useMemo(() => {
    const counts = new Map<string, number>();
    tracks.forEach((track) => {
      const playlist = track.playlist?.trim() || 'BGM';
      counts.set(playlist, (counts.get(playlist) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
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
    setActivePlaylist(playlist);
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

      {/* Playlist folders */}
      <div className="mb-12">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-white/55">プレイリストフォルダ</h2>
          {selectedPlaylist ? (
            <button
              type="button"
              onClick={() => selectPlaylist(null)}
              className="text-xs font-medium text-neon-cyan hover:text-neon-cyan/80"
            >
              すべて表示
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <button
            type="button"
            onClick={() => selectPlaylist(null)}
            className={`group flex min-h-24 flex-col justify-between rounded-lg border p-4 text-left transition-all ${
              selectedPlaylist === null
                ? 'border-neon-cyan/60 bg-neon-cyan/10 shadow-[0_0_22px_rgba(143,245,255,0.15)]'
                : 'border-white/10 bg-surface hover:border-white/25 hover:bg-white/10'
            }`}
          >
            <Folder
              className={`h-7 w-7 ${selectedPlaylist === null ? 'text-neon-cyan' : 'text-zen-mist/55 group-hover:text-white/80'}`}
              fill="currentColor"
              fillOpacity={0.18}
            />
            <span>
              <span className="block truncate text-sm font-bold text-white">すべて</span>
              <span className="mt-1 flex items-center gap-1 text-xs text-zen-mist/50">
                <Music2 className="h-3 w-3" />
                {tracks.length} 曲
              </span>
            </span>
          </button>

          {playlists.map((playlist) => {
            const active = selectedPlaylist === playlist.name;
            return (
              <button
                key={playlist.name}
                type="button"
                onClick={() => selectPlaylist(playlist.name)}
                className={`group flex min-h-24 flex-col justify-between rounded-lg border p-4 text-left transition-all ${
                  active
                    ? 'border-neon-purple/70 bg-neon-purple/10 shadow-[0_0_22px_rgba(214,116,255,0.14)]'
                    : 'border-white/10 bg-surface hover:border-white/25 hover:bg-white/10'
                }`}
              >
                <Folder
                  className={`h-7 w-7 ${active ? 'text-neon-purple' : 'text-zen-mist/55 group-hover:text-white/80'}`}
                  fill="currentColor"
                  fillOpacity={0.2}
                />
                <span>
                  <span className="block truncate text-sm font-bold text-white">{playlist.name}</span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-zen-mist/50">
                    <Music2 className="h-3 w-3" />
                    {playlist.count} 曲
                  </span>
                </span>
              </button>
            );
          })}
        </div>
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
