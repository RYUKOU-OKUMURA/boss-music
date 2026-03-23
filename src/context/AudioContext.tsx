import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { resolveAudioPlaybackUrl } from '../lib/mediaUrls';
import { resolveAudioSource, revokeObjectUrl } from '../lib/audioCache';

export interface Track {
  id: string;
  title: string;
  artist: string;
  description: string;
  createdAt: string;
  audioUrl: string;
  coverImage?: string;
  playable: boolean;
  tags: string[];
  order?: number;
  driveAudioFileId?: string;
  driveCoverFileId?: string;
}

interface TracksApiResponse {
  tracks: Track[];
}

interface AudioContextType {
  tracks: Track[];
  currentTrackIndex: number;
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  play: (index?: number) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  isLoading: boolean;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};

export const AudioProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const lastTrackIdRef = useRef<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    let cancelled = false;

    async function loadTracks() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/tracks');
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as TracksApiResponse;
        if (!cancelled) {
          setTracks(Array.isArray(data.tracks) ? data.tracks : []);
        }
      } catch (e) {
        console.error('Failed to load tracks', e);
        if (!cancelled) setTracks([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadTracks();

    const reload = () => {
      fetch('/api/tracks')
        .then((r) => r.json())
        .then((data: TracksApiResponse) => {
          setTracks(Array.isArray(data.tracks) ? data.tracks : []);
        })
        .catch(console.error);
    };
    window.addEventListener('boss-music-catalog-changed', reload);
    return () => {
      cancelled = true;
      window.removeEventListener('boss-music-catalog-changed', reload);
    };
  }, []);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume;
    }

    const audio = audioRef.current;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => next();
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [tracks.length]);

  useEffect(() => {
    if (!audioRef.current || tracks.length === 0) return;

    const track = tracks[currentTrackIndex];
    if (!track) return;

    const trackChanged = lastTrackIdRef.current !== track.id;

    if (!trackChanged) {
      if (isPlaying) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.error('Audio play failed:', error);
            setIsPlaying(false);
          });
        }
      } else {
        audioRef.current.pause();
      }
      return;
    }

    lastTrackIdRef.current = track.id;
    let cancelled = false;

    (async () => {
      const streamUrl = resolveAudioPlaybackUrl(track);
      const src = await resolveAudioSource(track.id, streamUrl);
      if (cancelled || !audioRef.current) return;

      if (blobUrlRef.current) {
        revokeObjectUrl(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      if (src.startsWith('blob:')) {
        blobUrlRef.current = src;
      }

      audioRef.current.src = src;
      audioRef.current.load();

      if (isPlayingRef.current) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.error('Audio play failed:', error);
            setIsPlaying(false);
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentTrackIndex, tracks, isPlaying]);

  const play = (index?: number) => {
    if (index !== undefined && index >= 0 && index < tracks.length) {
      setCurrentTrackIndex(index);
    }
    setIsPlaying(true);
  };

  const pause = () => {
    setIsPlaying(false);
  };

  const resume = () => {
    setIsPlaying(true);
  };

  const next = () => {
    if (tracks.length === 0) return;
    setCurrentTrackIndex((prev) => (prev + 1) % tracks.length);
    setIsPlaying(true);

    if (location.pathname.startsWith('/track/')) {
      const nextTrack = tracks[(currentTrackIndex + 1) % tracks.length];
      navigate(`/track/${nextTrack.id}`, { replace: true });
    }
  };

  const prev = () => {
    if (tracks.length === 0) return;
    setCurrentTrackIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
    setIsPlaying(true);

    if (location.pathname.startsWith('/track/')) {
      const prevTrack = tracks[(currentTrackIndex - 1 + tracks.length) % tracks.length];
      navigate(`/track/${prevTrack.id}`, { replace: true });
    }
  };

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const setVolume = (newVolume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
      setVolumeState(newVolume);
    }
  };

  const currentTrack = tracks[currentTrackIndex] || null;

  return (
    <AudioContext.Provider
      value={{
        tracks,
        currentTrackIndex,
        currentTrack,
        isPlaying,
        currentTime,
        duration,
        volume,
        play,
        pause,
        resume,
        next,
        prev,
        seek,
        setVolume,
        isLoading,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};
