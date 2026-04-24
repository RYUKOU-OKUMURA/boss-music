import React, { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { Track } from '../context/AudioContext';
import { useAudioMain } from '../context/AudioContext';
import { TrackCard } from './TrackCard';
import { ArrowRight, Folder, Music2, Pause, Play, Shuffle } from 'lucide-react';
import { resolveCoverImageUrl } from '../lib/mediaUrls';

function trackMatchesQuery(
  track: { title: string; artist: string; description: string; tags: string[] },
  queryLower: string
): boolean {
  const haystack = [track.title, track.artist, track.description, ...track.tags].join(' ').toLowerCase();
  return haystack.includes(queryLower);
}

export const Gallery: React.FC = () => {
  const { tracks, currentTrack, isPlaying, play, pause, setActivePlaylist, isLoading } = useAudioMain();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryRaw = searchParams.get('q')?.trim() ?? '';
  const queryLower = queryRaw.toLowerCase();
  const selectedPlaylist = searchParams.get('playlist')?.trim() || null;
  const featuredTrack = tracks[0] ?? null;

  useEffect(() => {
    setActivePlaylist(selectedPlaylist);
  }, [selectedPlaylist, setActivePlaylist]);

  const playlists = useMemo(() => {
    const grouped = new Map<string, { count: number; tracks: Track[] }>();
    tracks.forEach((track) => {
      const playlist = track.playlist?.trim() || 'BGM';
      const current = grouped.get(playlist) ?? { count: 0, tracks: [] };
      current.count += 1;
      current.tracks.push(track);
      grouped.set(playlist, current);
    });
    return Array.from(grouped.entries()).map(([name, value]) => ({ name, count: value.count, tracks: value.tracks.slice(0, 3) }));
  }, [tracks]);

  const filteredTracks = useMemo(() => {
    const playlistTracks = selectedPlaylist ? tracks.filter((t) => t.playlist === selectedPlaylist) : tracks;
    if (!queryRaw) return playlistTracks;
    return playlistTracks.filter((t) => trackMatchesQuery(t, queryLower));
  }, [tracks, selectedPlaylist, queryRaw, queryLower]);

  const startIndex = useMemo(() => {
    if (filteredTracks.length === 0) return 0;
    const i = tracks.findIndex((t) => t.id === filteredTracks[0].id);
    return i >= 0 ? i : 0;
  }, [filteredTracks, tracks]);

  const startPlaylistPlayback = (shuffle: boolean) => {
    if (filteredTracks.length === 0) return;
    const firstTrack = shuffle
      ? filteredTracks[Math.floor(Math.random() * filteredTracks.length)]
      : filteredTracks[0];
    const index = firstTrack ? tracks.findIndex((t) => t.id === firstTrack.id) : startIndex;
    play(index >= 0 ? index : startIndex, selectedPlaylist, { shuffle });
  };

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

  const openTrackPage = (track: Track) => {
    navigate({ pathname: `/track/${track.id}`, search: location.search });
  };

  const playFeatured = () => {
    if (!featuredTrack) return;
    const featuredIndex = tracks.findIndex((track) => track.id === featuredTrack.id);
    if (currentTrack?.id === featuredTrack.id && isPlaying) {
      pause();
      return;
    }
    play(featuredIndex >= 0 ? featuredIndex : 0, featuredTrack.playlist);
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
      <div className="mb-16 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-neon-cyan/80">BOSS-MUSIC LIBRARY</p>
          <h1 className="mt-4 text-5xl md:text-7xl font-headline font-bold text-white leading-tight tracking-tight">
            BOSS-MUSIC <span className="text-neon-cyan italic">LIBRARY</span>
          </h1>
          <p className="mt-6 text-lg text-zen-mist/70 font-light leading-relaxed">
            Featured、Playlists、All Tracks で整理されたハイエナジーなビート。
            <br />
            毎日午前0時に更新。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => startPlaylistPlayback(false)}
            disabled={filteredTracks.length === 0}
            className="flex items-center gap-3 bg-neon-cyan text-black px-8 py-4 rounded-full font-bold text-sm tracking-wider hover:scale-105 transition-transform shadow-[0_0_30px_rgba(143,245,255,0.3)] disabled:opacity-40 disabled:hover:scale-100"
          >
            <Play className="w-5 h-5" fill="currentColor" />
            {selectedPlaylist ? `${selectedPlaylist} を再生` : 'ライブラリを再生'}
          </button>
          <button
            onClick={() => startPlaylistPlayback(true)}
            disabled={filteredTracks.length === 0}
            className="flex items-center gap-3 rounded-full border border-neon-purple/50 bg-neon-purple/10 px-8 py-4 text-sm font-bold tracking-wider text-white transition-transform hover:scale-105 hover:bg-neon-purple/20 disabled:opacity-40 disabled:hover:scale-100"
          >
            <Shuffle className="w-5 h-5" />
            シャッフル再生
          </button>
        </div>
      </div>

      <section className="mb-16">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-white/55">Featured</h2>
          <span className="text-xs text-zen-mist/40">tracks[0]</span>
        </div>
        {featuredTrack ? (
          <div className="grid gap-6 overflow-hidden rounded-[1.25rem] border border-white/10 bg-surface/70 p-4 md:grid-cols-[minmax(0,280px)_1fr] md:p-6">
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40 aspect-square">
              {resolveCoverImageUrl(featuredTrack) ? (
                <img
                  src={resolveCoverImageUrl(featuredTrack)}
                  alt={featuredTrack.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top,#8ff5ff1f,transparent_50%),linear-gradient(135deg,#111521,#05070b)]">
                  <div className="rounded-full border border-white/15 bg-black/30 px-6 py-5 text-center font-headline text-2xl font-bold text-white/80">
                    {featuredTrack.title.slice(0, 2).toUpperCase()}
                  </div>
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col justify-between gap-5">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-neon-purple/80">Featured Track</p>
                <h3 className="mt-3 truncate font-headline text-3xl font-bold text-white md:text-4xl">
                  {featuredTrack.title}
                </h3>
                <p className="mt-2 text-sm font-medium text-zen-mist/60">{featuredTrack.artist}</p>
                <p className="mt-5 max-w-2xl text-sm leading-7 text-zen-mist/70 md:text-base">
                  {featuredTrack.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={playFeatured}
                  className="inline-flex items-center gap-3 rounded-full bg-neon-cyan px-6 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.03] shadow-[0_0_30px_rgba(143,245,255,0.28)]"
                >
                  {currentTrack?.id === featuredTrack.id && isPlaying ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
                  {currentTrack?.id === featuredTrack.id && isPlaying ? '一時停止' : '再生'}
                </button>
                <button
                  type="button"
                  onClick={() => openTrackPage(featuredTrack)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-white transition-colors hover:border-neon-cyan/40 hover:bg-neon-cyan/10"
                >
                  詳細ページ
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[1.25rem] border border-white/10 bg-surface/50 px-8 py-16 text-center text-zen-mist/60">
            まだトラックがありません。
          </div>
        )}
      </section>

      <section className="mb-16">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-white/55">Playlists</h2>
          {selectedPlaylist ? (
            <button
              type="button"
              onClick={() => selectPlaylist(null)}
              className="text-xs font-medium text-neon-cyan hover:text-neon-cyan/80"
            >
              すべて表示
            </button>
          ) : (
            <span className="text-xs text-zen-mist/40">棚から選択</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <button
            type="button"
            onClick={() => selectPlaylist(null)}
            className={`group flex min-h-40 flex-col gap-4 rounded-lg border p-4 text-left transition-all ${
              selectedPlaylist === null
                ? 'border-neon-cyan/60 bg-neon-cyan/10 shadow-[0_0_22px_rgba(143,245,255,0.15)]'
                : 'border-white/10 bg-surface hover:border-white/25 hover:bg-white/10'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <Folder
                className={`h-7 w-7 ${selectedPlaylist === null ? 'text-neon-cyan' : 'text-zen-mist/55 group-hover:text-white/80'}`}
                fill="currentColor"
                fillOpacity={0.18}
              />
              <span className="flex items-center gap-1 text-xs text-zen-mist/50">
                <Music2 className="h-3 w-3" />
                {tracks.length}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {[...tracks.slice(0, 3)].map((track, index) => {
                const coverImage = resolveCoverImageUrl(track);
                return (
                  <div key={`${track.id}-${index}`} className="relative aspect-square overflow-hidden rounded-md border border-white/10 bg-black/20">
                    {coverImage ? (
                      <img src={coverImage} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#121727,#05070b)] text-[11px] font-bold text-white/70">
                        {track.title.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <span>
              <span className="block truncate text-sm font-bold text-white">すべて</span>
              <span className="mt-1 block text-xs text-zen-mist/50">全曲をまとめて見る</span>
            </span>
          </button>

          {playlists.map((playlist) => {
            const active = selectedPlaylist === playlist.name;
            return (
              <button
                key={playlist.name}
                type="button"
                onClick={() => selectPlaylist(playlist.name)}
                className={`group flex min-h-40 flex-col gap-4 rounded-lg border p-4 text-left transition-all ${
                  active
                    ? 'border-neon-purple/70 bg-neon-purple/10 shadow-[0_0_22px_rgba(214,116,255,0.14)]'
                    : 'border-white/10 bg-surface hover:border-white/25 hover:bg-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Folder
                    className={`h-7 w-7 ${active ? 'text-neon-purple' : 'text-zen-mist/55 group-hover:text-white/80'}`}
                    fill="currentColor"
                    fillOpacity={0.2}
                  />
                  <span className="flex items-center gap-1 text-xs text-zen-mist/50">
                    <Music2 className="h-3 w-3" />
                    {playlist.count}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {playlist.tracks.map((track, index) => {
                    const coverImage = resolveCoverImageUrl(track);
                    return (
                      <div key={`${playlist.name}-${track.id}-${index}`} className="relative aspect-square overflow-hidden rounded-md border border-white/10 bg-black/20">
                        {coverImage ? (
                          <img src={coverImage} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#121727,#05070b)] text-[11px] font-bold text-white/70">
                            {track.title.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <span>
                  <span className="block truncate text-sm font-bold text-white">{playlist.name}</span>
                  <span className="mt-1 block text-xs text-zen-mist/50">プレイリストを絞り込む</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-white/55">All Tracks</h2>
            {queryRaw ? (
              <p className="mt-2 text-sm text-zen-mist/70">
                「{queryRaw}」の検索結果 — {filteredTracks.length} 件
              </p>
            ) : (
              <p className="mt-2 text-sm text-zen-mist/40">
                {selectedPlaylist ? `${selectedPlaylist} の曲を表示中` : 'ライブラリ全体を表示中'}
              </p>
            )}
          </div>
        </div>

        {queryRaw && filteredTracks.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-surface/50 px-8 py-16 text-center text-zen-mist/60">
            該当する曲が見つかりませんでした。別のキーワードで試してください。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3 md:gap-8 lg:grid-cols-4 xl:grid-cols-5">
            {filteredTracks.map((track) => {
              const index = tracks.findIndex((t) => t.id === track.id);
              return <TrackCard key={track.id} track={track} index={index} playbackPlaylist={selectedPlaylist} />;
            })}
          </div>
        )}
      </section>
    </div>
  );
};
