import type { TrackRow } from '../services/catalog';

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
    driveAudioFileId: t.driveAudioFileId,
    driveCoverFileId: t.driveCoverFileId,
    audioUrl: `/api/media/audio/${encodeURIComponent(t.driveAudioFileId)}`,
    coverImage: `/api/media/image/${encodeURIComponent(t.driveCoverFileId)}`,
  };
}
