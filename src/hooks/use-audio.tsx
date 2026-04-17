'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { QueueItem, RepeatMode } from '@/lib/types';

interface AudioContextValue {
  // State
  playQueue: QueueItem[];
  queueIndex: number;
  isPlaying: boolean;
  isPriorityPlaying: boolean;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  currentTime: number;
  duration: number;
  activeBtnId: string | null;
  currentTrackName: string | null;

  // Actions
  priorityPlay: (item: QueueItem) => void;
  addToQueue: (item: QueueItem) => void;
  togglePlayPause: () => void;
  skipNext: () => void;
  skipPrev: () => void;
  stopAll: (clearQueue?: boolean) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  removeFromQueue: (idx: number) => void;
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
}

const AudioCtx = createContext<AudioContextValue | null>(null);

const FADE_MS = 800;

export interface AudioErrorDetail {
  message: string;
  title?: string;
  url?: string;
  code?: number;
}

function mediaErrorText(code: number | undefined): string {
  switch (code) {
    case 1: return 'aborted';
    case 2: return 'network error';
    case 3: return 'decode error';
    case 4: return 'file not found or unsupported';
    default: return 'unknown error';
  }
}

function emitAudioError(detail: AudioErrorDetail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<AudioErrorDetail>('audio:error', { detail }));
  }
}

export function AudioProvider({ children }: { children: ReactNode }) {
  // Queue state
  const [playQueue, setPlayQueue] = useState<QueueItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPriorityPlaying, setIsPriorityPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeBtnId, setActiveBtnId] = useState<string | null>(null);
  const [currentTrackName, setCurrentTrackName] = useState<string | null>(null);

  const queueAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeInRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Priority play state: when a priority track ends, resume queue
  const priorityRef = useRef(false);
  // Saved queue position to resume after priority play
  const savedQueuePosRef = useRef<{ wasPlaying: boolean; time: number } | null>(null);

  // Mutable refs for latest state in callbacks
  const queueRef = useRef(playQueue);
  const indexRef = useRef(queueIndex);
  const playingRef = useRef(isPlaying);
  const shuffleRef = useRef(isShuffle);
  const repeatRef = useRef(repeatMode);

  queueRef.current = playQueue;
  indexRef.current = queueIndex;
  playingRef.current = isPlaying;
  shuffleRef.current = isShuffle;
  repeatRef.current = repeatMode;

  // Initialize audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    queueAudioRef.current = audio;

    const timer = setInterval(() => {
      if (audio.duration) {
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration);
      }
    }, 250);

    return () => {
      clearInterval(timer);
      audio.pause();
      audio.src = '';
    };
  }, []);

  function ensureAudioCtx() {
    if (audioCtxRef.current) return;
    const audio = queueAudioRef.current;
    if (!audio) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainNodeRef.current = gain;
    } catch (e) {
      console.warn('AudioContext failed:', e);
    }
  }

  function getVol() {
    return gainNodeRef.current ? gainNodeRef.current.gain.value : (queueAudioRef.current?.volume ?? 1);
  }

  function setVol(v: number) {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = v;
    else if (queueAudioRef.current) queueAudioRef.current.volume = v;
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      wakeLockRef.current.addEventListener('release', () => { wakeLockRef.current = null; });
    } catch { /* ok */ }
  }

  function releaseWakeLock() {
    if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null; }
  }

  function clearFades() {
    if (fadeRef.current) { clearInterval(fadeRef.current); fadeRef.current = null; }
    if (fadeInRef.current) { clearInterval(fadeInRef.current); fadeInRef.current = null; }
  }

  function fadeOut(cb?: () => void, resetTime = true) {
    const audio = queueAudioRef.current;
    if (!audio) return;
    clearFades();
    const steps = 20;
    const stepTime = FADE_MS / steps;
    let vol = getVol();
    const dec = vol / steps;
    fadeRef.current = setInterval(() => {
      vol -= dec;
      if (vol <= 0.01) {
        clearFades();
        setVol(0);
        audio.pause();
        if (resetTime) audio.currentTime = 0;
        cb?.();
      } else {
        setVol(vol);
      }
    }, stepTime);
  }

  function fadeIn() {
    clearFades();
    setVol(0);
    const steps = 20;
    const stepTime = FADE_MS / steps;
    const inc = 1 / steps;
    let vol = 0;
    fadeInRef.current = setInterval(() => {
      vol += inc;
      if (vol >= 1) {
        if (fadeInRef.current) clearInterval(fadeInRef.current);
        fadeInRef.current = null;
        setVol(1);
      } else {
        setVol(vol);
      }
    }, stepTime);
  }

  function shuffleRemaining(arr: QueueItem[], startIdx: number): QueueItem[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > startIdx; i--) {
      const j = startIdx + Math.floor(Math.random() * (i - startIdx + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function playTrack(item: QueueItem) {
    const audio = queueAudioRef.current;
    if (!audio) return;
    ensureAudioCtx();
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();

    audio.pause();
    audio.src = item.url;
    audio.currentTime = 0;
    setVol(0);

    const attemptPlay = () => {
      audio.play().then(() => fadeIn()).catch((e) => {
        if (e.name === 'NotAllowedError') {
          setIsPlaying(false);
          return;
        }
        console.error('Play error:', e);
        emitAudioError({
          message: `Play failed: ${e?.message || e?.name || 'unknown'}`,
          title: item.label || item.name,
          url: item.url,
        });
      });
    };

    if (audio.readyState >= 2) {
      attemptPlay();
    } else {
      const onReady = () => {
        audio.removeEventListener('canplay', onReady);
        audio.removeEventListener('error', onErr);
        attemptPlay();
      };
      const onErr = () => {
        audio.removeEventListener('canplay', onReady);
        audio.removeEventListener('error', onErr);
        const code = audio.error?.code;
        console.error('Audio load error', { code, url: item.url });
        emitAudioError({
          message: `Couldn't load audio (${mediaErrorText(code)})`,
          title: item.label || item.name,
          url: item.url,
          code,
        });
      };
      audio.addEventListener('canplay', onReady);
      audio.addEventListener('error', onErr);
    }

    setIsPlaying(true);
    setActiveBtnId(item.btnId ?? null);
    setCurrentTrackName(item.label || item.name || null);
    requestWakeLock();

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.label || item.name || 'Walk-Up Song',
        artist: 'Baseball SoundBoard',
      });
    }
  }

  function playQueueItem(queue: QueueItem[], idx: number) {
    if (idx < 0 || idx >= queue.length) {
      setIsPlaying(false);
      setCurrentTrackName(null);
      return;
    }
    playTrack(queue[idx]);
  }

  function resumeQueue() {
    const queue = queueRef.current;
    const idx = indexRef.current;
    if (idx < 0 || idx >= queue.length) {
      setIsPlaying(false);
      setActiveBtnId(null);
      setCurrentTrackName(null);
      releaseWakeLock();
      return;
    }
    // Resume from saved position or start of current track
    playTrack(queue[idx]);
  }

  // Handle ended event
  useEffect(() => {
    const audio = queueAudioRef.current;
    if (!audio) return;

    const onEnded = () => {
      // If a priority track just finished, resume the queue
      if (priorityRef.current) {
        priorityRef.current = false;
        setIsPriorityPlaying(false);
        setActiveBtnId(null);

        const queue = queueRef.current;
        const idx = indexRef.current;
        if (queue.length > 0 && idx >= 0 && idx < queue.length) {
          resumeQueue();
        } else {
          setIsPlaying(false);
          setCurrentTrackName(null);
          releaseWakeLock();
        }
        return;
      }

      // Normal queue ended behavior
      if (repeatRef.current === 'one') {
        audio.currentTime = 0;
        audio.play().then(() => fadeIn()).catch(() => {});
        return;
      }

      const queue = queueRef.current;
      const nextIdx = indexRef.current + 1;
      if (nextIdx >= queue.length) {
        if (repeatRef.current === 'all' && queue.length > 0) {
          const newQueue = shuffleRef.current ? shuffleRemaining(queue, 0) : queue;
          setPlayQueue(newQueue);
          setQueueIndex(0);
          playQueueItem(newQueue, 0);
        } else {
          setActiveBtnId(null);
          setIsPlaying(false);
          setCurrentTrackName(null);
          releaseWakeLock();
        }
        return;
      }
      let newQueue = queue;
      if (shuffleRef.current) {
        newQueue = shuffleRemaining(queue, nextIdx);
        setPlayQueue(newQueue);
      }
      setQueueIndex(nextIdx);
      playQueueItem(newQueue, nextIdx);
    };

    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, []);

  // Visibility change handler
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      const audio = queueAudioRef.current;
      if (!audio) return;
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().then(() => {
          if (playingRef.current && audio.paused) {
            setVol(1);
            audio.play().catch(() => {});
          }
        });
      }
      if (playingRef.current) requestWakeLock();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // --- Public actions ---

  const priorityPlay = useCallback((item: QueueItem) => {
    const audio = queueAudioRef.current;
    if (!audio) return;

    // If already playing a priority track for the same button, stop it
    if (priorityRef.current && item.btnId && item.btnId === activeBtnId) {
      // Stop priority, resume queue
      priorityRef.current = false;
      setIsPriorityPlaying(false);
      clearFades();

      const queue = queueRef.current;
      const idx = indexRef.current;
      if (queue.length > 0 && idx >= 0 && idx < queue.length) {
        fadeOut(() => resumeQueue());
      } else {
        fadeOut(() => {
          setIsPlaying(false);
          setActiveBtnId(null);
          setCurrentTrackName(null);
          releaseWakeLock();
        });
      }
      return;
    }

    // Save queue state if currently playing from queue (not priority)
    if (playingRef.current && !priorityRef.current && indexRef.current >= 0) {
      savedQueuePosRef.current = {
        wasPlaying: true,
        time: audio.currentTime,
      };
    }

    priorityRef.current = true;
    setIsPriorityPlaying(true);

    const doPlay = () => playTrack(item);

    if (playingRef.current && !audio.paused) {
      fadeOut(doPlay);
    } else {
      audio.pause();
      audio.currentTime = 0;
      doPlay();
    }
  }, [activeBtnId]);

  const addToQueue = useCallback((item: QueueItem) => {
    const queue = queueRef.current;

    if (queue.length === 0 && !priorityRef.current) {
      // Nothing playing at all — start playing this item
      setPlayQueue([item]);
      setQueueIndex(0);
      playQueueItem([item], 0);
      return;
    }

    // Just append to queue
    setPlayQueue([...queue, item]);

    // If queue was empty/finished and nothing is playing from queue, start it
    if (!priorityRef.current && (!playingRef.current || indexRef.current >= queue.length)) {
      const newQueue = [...queue, item];
      const newIdx = newQueue.length - 1;
      setPlayQueue(newQueue);
      setQueueIndex(newIdx);
      playQueueItem(newQueue, newIdx);
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    const audio = queueAudioRef.current;
    if (!audio) return;

    // If priority playing, pause/resume the priority track
    if (priorityRef.current) {
      if (playingRef.current) {
        fadeOut(() => {
          setIsPlaying(false);
          releaseWakeLock();
        }, false);
        setIsPlaying(false);
      } else {
        fadeIn();
        audio.play().catch(() => {});
        setIsPlaying(true);
        requestWakeLock();
      }
      return;
    }

    const queue = queueRef.current;
    const idx = indexRef.current;
    if (queue.length === 0 || idx < 0 || idx >= queue.length) return;

    if (playingRef.current) {
      setActiveBtnId(null);
      fadeOut(() => {
        setIsPlaying(false);
        releaseWakeLock();
      }, false);
      setIsPlaying(false);
    } else {
      fadeIn();
      audio.play().catch(() => {});
      setIsPlaying(true);
      setActiveBtnId(queue[idx].btnId ?? null);
      requestWakeLock();
    }
  }, []);

  const skipNext = useCallback(() => {
    const audio = queueAudioRef.current;
    if (!audio) return;
    clearFades();
    audio.pause();
    audio.currentTime = 0;
    setVol(1);

    // If priority playing, skip = end priority, resume queue
    if (priorityRef.current) {
      priorityRef.current = false;
      setIsPriorityPlaying(false);
      setActiveBtnId(null);
      const queue = queueRef.current;
      const idx = indexRef.current;
      if (queue.length > 0 && idx >= 0 && idx < queue.length) {
        resumeQueue();
      } else {
        setIsPlaying(false);
        setCurrentTrackName(null);
        releaseWakeLock();
      }
      return;
    }

    const queue = queueRef.current;
    if (queue.length === 0) return;

    const nextIdx = indexRef.current + 1;
    if (nextIdx >= queue.length) {
      if (repeatRef.current === 'all' || (shuffleRef.current && queue.length > 1)) {
        const newQueue = shuffleRef.current ? shuffleRemaining(queue, 0) : queue;
        setPlayQueue(newQueue);
        setQueueIndex(0);
        playQueueItem(newQueue, 0);
      } else {
        setActiveBtnId(null);
        setIsPlaying(false);
        setCurrentTrackName(null);
        releaseWakeLock();
      }
      return;
    }
    let newQueue = queue;
    if (shuffleRef.current) {
      newQueue = shuffleRemaining(queue, nextIdx);
      setPlayQueue(newQueue);
    }
    setQueueIndex(nextIdx);
    playQueueItem(newQueue, nextIdx);
  }, []);

  const skipPrev = useCallback(() => {
    const audio = queueAudioRef.current;
    if (!audio) return;
    clearFades();
    audio.pause();
    audio.currentTime = 0;
    setVol(1);

    // If priority playing, just restart the priority track
    if (priorityRef.current) {
      audio.play().then(() => fadeIn()).catch(() => {});
      return;
    }

    if (queueRef.current.length === 0) return;
    const prevIdx = Math.max(0, indexRef.current - 1);
    setQueueIndex(prevIdx);
    playQueueItem(queueRef.current, prevIdx);
  }, []);

  const stopAll = useCallback((clearQ = false) => {
    const audio = queueAudioRef.current;
    if (!audio) return;
    clearFades();
    priorityRef.current = false;
    setIsPriorityPlaying(false);
    setActiveBtnId(null);
    savedQueuePosRef.current = null;

    if (playingRef.current && !audio.paused) {
      fadeOut(() => {
        setIsPlaying(false);
        setCurrentTrackName(null);
        releaseWakeLock();
        if (clearQ) { setPlayQueue([]); setQueueIndex(-1); }
      });
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTrackName(null);
    releaseWakeLock();
    if (clearQ) { setPlayQueue([]); setQueueIndex(-1); }
  }, []);

  const toggleShuffle = useCallback(() => setIsShuffle((s) => !s), []);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((m) => (m === 'off' ? 'all' : m === 'all' ? 'one' : 'off'));
  }, []);

  const removeFromQueue = useCallback((idx: number) => {
    const queue = [...queueRef.current];
    const curIdx = indexRef.current;
    const audio = queueAudioRef.current;

    if (idx === curIdx && !priorityRef.current) {
      audio?.pause();
      if (audio) audio.currentTime = 0;
      queue.splice(idx, 1);
      if (curIdx >= queue.length) {
        setActiveBtnId(null);
        setIsPlaying(false);
        setCurrentTrackName(null);
        setQueueIndex(-1);
      } else {
        setPlayQueue(queue);
        playQueueItem(queue, curIdx);
      }
      setPlayQueue(queue);
    } else {
      queue.splice(idx, 1);
      setPlayQueue(queue);
      if (idx < curIdx) setQueueIndex(curIdx - 1);
    }
  }, []);

  const reorderQueue = useCallback((from: number, to: number) => {
    const queue = [...queueRef.current];
    const [item] = queue.splice(from, 1);
    queue.splice(to, 0, item);
    let newIdx = indexRef.current;
    if (from === newIdx) newIdx = to;
    else if (from < newIdx && to >= newIdx) newIdx--;
    else if (from > newIdx && to <= newIdx) newIdx++;
    setPlayQueue(queue);
    setQueueIndex(newIdx);
  }, []);

  const clearQueue = useCallback(() => {
    const audio = queueAudioRef.current;
    // If currently playing from queue (not priority), stop
    if (!priorityRef.current) {
      if (audio) { audio.pause(); audio.currentTime = 0; }
      setIsPlaying(false);
      setActiveBtnId(null);
      setCurrentTrackName(null);
    }
    setPlayQueue([]);
    setQueueIndex(-1);
  }, []);

  return (
    <AudioCtx.Provider
      value={{
        playQueue,
        queueIndex,
        isPlaying,
        isPriorityPlaying,
        isShuffle,
        repeatMode,
        currentTime,
        duration,
        activeBtnId,
        currentTrackName,
        priorityPlay,
        addToQueue,
        togglePlayPause,
        skipNext,
        skipPrev,
        stopAll,
        toggleShuffle,
        cycleRepeat,
        removeFromQueue,
        reorderQueue,
        clearQueue,
      }}
    >
      {children}
    </AudioCtx.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
}
