import type { Track } from '../context/AudioContext';

/** 再生ページのメインコンテンツ（Vinyl / Minimal）に共通で渡す props */
export interface TrackPageLayoutProps {
  track: Track;
  coverImageUrl: string;
  isCurrent: boolean;
  isPlaying: boolean;
  canChangeTrack: boolean;
  onPlayPause: () => void;
  goAdjacentTrack: (delta: -1 | 1) => void;
  volume: number;
  onVolumeBarClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** スペクトラムパターンが前面のときだけ true（可視化の RAF を制御する用途） */
  spectrumPanelActive?: boolean;
}
