import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, onSnapshot, query, orderBy, getDocs, setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import trackData from '../data/tracks.json';

export interface Track {
  id: string;
  title: string;
  artist: string;
  description: string;
  createdAt: string;
  audioUrl: string;
  coverImage: string;
  playable: boolean;
  tags: string[];
  order?: number;
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

  // Fetch tracks from Firestore
  useEffect(() => {
    const seedDataIfEmpty = async () => {
      try {
        const tracksRef = collection(db, 'tracks');
        const snapshot = await getDocs(tracksRef);
        
        if (snapshot.empty) {
          console.log('Seeding initial tracks to Firestore...');
          const promises = trackData.tracks.map((track, index) => {
            const trackDoc = doc(tracksRef, track.id);
            return setDoc(trackDoc, { ...track, order: index });
          });
          await Promise.all(promises);
          console.log('Seeding complete.');
        }
      } catch (error) {
        console.error('Error seeding data:', error);
      }
    };

    seedDataIfEmpty().then(() => {
      const q = query(collection(db, 'tracks'), orderBy('order', 'asc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedTracks: Track[] = [];
        snapshot.forEach((doc) => {
          fetchedTracks.push({ id: doc.id, ...doc.data() } as Track);
        });
        setTracks(fetchedTracks);
        setIsLoading(false);
      }, (error) => {
        console.error('Error fetching tracks:', error);
        setIsLoading(false);
      });

      return () => unsubscribe();
    });
  }, []);

  // Initialize audio element
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

  // Handle track change and play/pause state
  useEffect(() => {
    if (!audioRef.current || tracks.length === 0) return;

    const track = tracks[currentTrackIndex];
    if (!track) return;

    let srcChanged = false;
    // Get the raw src attribute to compare with the relative URL
    const currentSrc = audioRef.current.getAttribute('src');
    if (currentSrc !== track.audioUrl) {
      audioRef.current.src = track.audioUrl;
      audioRef.current.load();
      srcChanged = true;
    }

    if (isPlaying) {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error("Audio play failed:", error);
          // Auto-play was prevented or network error
          setIsPlaying(false);
        });
      }
    } else if (!srcChanged) {
      audioRef.current.pause();
    }
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
    
    // Update URL if we are on a track page
    if (location.pathname.startsWith('/track/')) {
      const nextTrack = tracks[(currentTrackIndex + 1) % tracks.length];
      navigate(`/track/${nextTrack.id}`, { replace: true });
    }
  };

  const prev = () => {
    if (tracks.length === 0) return;
    setCurrentTrackIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
    setIsPlaying(true);
    
    // Update URL if we are on a track page
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

