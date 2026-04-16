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
  isShuffle: boolean;
  repeatMode: RepeatMode;
  currentTime: number;
  duration: number;
  activeBtnId: string | null;

  // Actions
  playFromQueue: (queue: QueueItem[]) => void;
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

const AudioContext = createContext<AudioContextValue | null>(null);

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
  const [playQueue, setPlayQueue] = useState<QueueItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeBtnId, setActiveBtnId] = useState<string | null>(null);

  const queueAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeInRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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

  const playCurrentInQueueInternal = useCallback(
    (queue: QueueItem[], idx: number) => {
      const audio = queueAudioRef.current;
      if (!audio || idx < 0 || idx >= queue.length) {
        setIsPlaying(false);
        return;
      }
      ensureAudioCtx();
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();

      const item = queue[idx];
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
      requestWakeLock();

      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: item.label || item.name || 'Walk-Up Song',
          artist: 'Baseball SoundBoard',
        });
      }
    },
    []
  );

  // Handle ended event
  useEffect(() => {
    const audio = queueAudioRef.current;
    if (!audio) return;

    const onEnded = () => {
      if (repeatRef.current === 'one') {
        audio.currentTime = 0;
        audio.play().then(() => fadeIn()).catch(() => {});
        return;
      }
      // Advance
      const queue = queueRef.current;
      const nextIdx = indexRef.current + 1;
      if (nextIdx >= queue.length) {
        if (repeatRef.current === 'all' && queue.length > 0) {
          const newQueue = shuffleRef.current ? shuffleRemaining(queue, 0) : queue;
          setPlayQueue(newQueue);
          setQueueIndex(0);
          playCurrentInQueueInternal(newQueue, 0);
        } else if (shuffleRef.current && queue.length > 1) {
          const newQueue = shuffleRemaining(queue, 0);
          setPlayQueue(newQueue);
          setQueueIndex(0);
          playCurrentInQueueInternal(newQueue, 0);
        } else {
          setActiveBtnId(null);
          setIsPlaying(false);
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
      playCurrentInQueueInternal(newQueue, nextIdx);
    };

    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, [playCurrentInQueueInternal]);

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

  const playFromQueue = useCallback(
    (queue: QueueItem[]) => {
      const audio = queueAudioRef.current;
      if (!audio) return;

      const upcoming =
        indexRef.current >= 0 && indexRef.current < queueRef.current.length
          ? queueRef.current.slice(indexRef.current + 1)
          : [];
      const newQueue = [...queue, ...upcoming];

      const doPlay = () => {
        setActiveBtnId(null);
        setPlayQueue(newQueue);
        setQueueIndex(0);
        setIsPlaying(false);
        playCurrentInQueueInternal(newQueue, 0);
      };

      if (playingRef.current && !audio.paused) {
        fadeOut(doPlay);
      } else {
        audio.pause();
        audio.currentTime = 0;
        doPlay();
      }
    },
    [playCurrentInQueueInternal]
  );

  const addToQueue = useCallback(
    (item: QueueItem) => {
      const queue = queueRef.current;
      if (queue.length === 0 || indexRef.current < 0) {
        playFromQueue([item]);
        return;
      }
      if (!playingRef.current && indexRef.current >= queue.length - 1) {
        const newQueue = [...queue, item];
        const newIdx = newQueue.length - 1;
        setPlayQueue(newQueue);
        setQueueIndex(newIdx);
        playCurrentInQueueInternal(newQueue, newIdx);
        return;
      }
      setPlayQueue([...queue, item]);
    },
    [playFromQueue, playCurrentInQueueInternal]
  );

  const togglePlayPause = useCallback(() => {
    const audio = queueAudioRef.current;
    const queue = queueRef.current;
    const idx = indexRef.current;
    if (!audio || queue.length === 0 || idx < 0 || idx >= queue.length) return;

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
    const queue = queueRef.current;
    if (!audio || queue.length === 0) return;
    clearFades();
    audio.pause();
    audio.currentTime = 0;
    setVol(1);

    const nextIdx = indexRef.current + 1;
    if (nextIdx >= queue.length) {
      if (repeatRef.current === 'all' || (shuffleRef.current && queue.length > 1)) {
        const newQueue = shuffleRef.current ? shuffleRemaining(queue, 0) : queue;
        setPlayQueue(newQueue);
        setQueueIndex(0);
        playCurrentInQueueInternal(newQueue, 0);
      } else {
        setActiveBtnId(null);
        setIsPlaying(false);
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
    playCurrentInQueueInternal(newQueue, nextIdx);
  }, [playCurrentInQueueInternal]);

  const skipPrev = useCallback(() => {
    const audio = queueAudioRef.current;
    if (!audio || queueRef.current.length === 0) return;
    clearFades();
    audio.pause();
    audio.currentTime = 0;
    setVol(1);
    const prevIdx = Math.max(0, indexRef.current - 1);
    setQueueIndex(prevIdx);
    playCurrentInQueueInternal(queueRef.current, prevIdx);
  }, [playCurrentInQueueInternal]);

  const stopAll = useCallback((clearQ = false) => {
    const audio = queueAudioRef.current;
    if (!audio) return;
    clearFades();
    setActiveBtnId(null);
    if (playingRef.current && !audio.paused) {
      fadeOut(() => {
        setIsPlaying(false);
        releaseWakeLock();
        if (clearQ) { setPlayQueue([]); setQueueIndex(-1); }
      });
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    releaseWakeLock();
    if (clearQ) { setPlayQueue([]); setQueueIndex(-1); }
  }, []);

  const toggleShuffle = useCallback(() => setIsShuffle((s) => !s), []);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((m) => (m === 'off' ? 'all' : m === 'all' ? 'one' : 'off'));
  }, []);

  const removeFromQueue = useCallback(
    (idx: number) => {
      const queue = [...queueRef.current];
      const curIdx = indexRef.current;
      const audio = queueAudioRef.current;

      if (idx === curIdx) {
        audio?.pause();
        if (audio) audio.currentTime = 0;
        queue.splice(idx, 1);
        if (curIdx >= queue.length) {
          setActiveBtnId(null);
          setIsPlaying(false);
          setQueueIndex(-1);
        } else {
          setPlayQueue(queue);
          playCurrentInQueueInternal(queue, curIdx);
        }
        setPlayQueue(queue);
      } else {
        queue.splice(idx, 1);
        setPlayQueue(queue);
        if (idx < curIdx) setQueueIndex(curIdx - 1);
      }
    },
    [playCurrentInQueueInternal]
  );

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
    if (audio) { audio.pause(); audio.currentTime = 0; }
    setActiveBtnId(null);
    setPlayQueue([]);
    setQueueIndex(-1);
    setIsPlaying(false);
  }, []);

  return (
    <AudioContext.Provider
      value={{
        playQueue,
        queueIndex,
        isPlaying,
        isShuffle,
        repeatMode,
        currentTime,
        duration,
        activeBtnId,
        playFromQueue,
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
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
}
