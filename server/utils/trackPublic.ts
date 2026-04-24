import type { TrackRow } from '../services/tracksDb';

export function toPublicTrack(t: TrackRow) {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    description: t.description,
    createdAt: t.createdAt,
    tags: t.tags,
    playable: t.playable,
    order: t.order,
    audioUrl: t.audioUrl,
    coverImage: t.coverUrl ?? '',
  };
}
