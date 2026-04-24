import type { MouseEvent } from 'react';
import type { Track } from '../context/AudioContext';

/** 再生ページのメインコンテンツ（Vinyl / Minimal）に共通で渡す props */
export interface TrackPageLayoutProps {
  track: Track;
  coverImageUrl: string;
  isCurrent: boolean;
  isPlaying: boolean;
  canChangeTrack: boolean;
  playbackScopeName: string;
  playbackPosition: number;
  playbackTotal: number;
  nextTrack: Track | null;
  isRepeatEnabled: boolean;
  isShuffleEnabled: boolean;
  onPlayPause: () => void;
  goAdjacentTrack: (delta: -1 | 1) => void;
  toggleRepeatEnabled: () => void;
  toggleShuffleEnabled: () => void;
  volume: number;
  onVolumeBarClick: (e: MouseEvent<HTMLDivElement>) => void;
  /** スペクトラムパターンが前面のときだけ true（可視化の RAF を制御する用途） */
  spectrumPanelActive?: boolean;
}
