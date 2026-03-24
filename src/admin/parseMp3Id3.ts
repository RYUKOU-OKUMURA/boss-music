import { MAX_IMAGE_BYTES } from './constants';

const ALLOWED_COVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type ParseMp3Id3Result = {
  title?: string;
  artist?: string;
  coverFile?: File;
  warning?: string;
};

function extensionForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'img';
}

function normalizeArtist(common: {
  artist?: string;
  artists?: string[];
}): string | undefined {
  const single = common.artist?.trim();
  if (single) return single;
  const joined = common.artists?.map((a) => a.trim()).filter(Boolean).join(', ');
  return joined?.trim() || undefined;
}

/**
 * MP3 の ID3（および music-metadata が解釈する共通タグ）からタイトル・アーティスト・表紙画像を取り出す。
 * ブラウザでは music-metadata の core エントリ（parseBlob）を動的 import する。
 */
export async function parseMp3Metadata(file: File): Promise<ParseMp3Id3Result> {
  const { parseBlob, selectCover } = await import('music-metadata');

  let metadata;
  try {
    metadata = await parseBlob(file, { duration: false });
  } catch {
    return {};
  }

  const { common } = metadata;
  const title = common.title?.trim() || undefined;
  const artist = normalizeArtist(common);

  const picture = selectCover(common.picture);
  if (!picture) {
    return { title, artist };
  }

  const mime = picture.format.trim().toLowerCase();
  if (!ALLOWED_COVER_TYPES.has(mime)) {
    return { title, artist };
  }

  const size = picture.data.byteLength;
  if (size > MAX_IMAGE_BYTES) {
    return {
      title,
      artist,
      warning: `埋め込みジャケット画像が大きすぎます（${(size / (1024 * 1024)).toFixed(1)}MB / 上限 ${MAX_IMAGE_BYTES / (1024 * 1024)}MB）。手動で画像を選んでください。`,
    };
  }

  const ext = extensionForMime(mime);
  const blob = new Blob([picture.data], { type: mime });
  const coverFile = new File([blob], `cover.${ext}`, { type: mime });

  return { title, artist, coverFile };
}
