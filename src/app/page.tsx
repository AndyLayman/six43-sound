'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAudio } from '@/hooks/use-audio';
import { useAuth } from '@/hooks/use-auth';
import { useLiveGame } from '@/hooks/use-live-game';
import {
  sb,
  audioUrl,
  storageUrl,
  fileExt,
  uploadAudioFile,
  uploadFile,
  deleteFile,
  compressImage,
  isStaging,
} from '@/lib/supabase';
import type { Sound, Player, LibrarySong, QueueItem } from '@/lib/types';

// --- Waveform component for playing buttons ---
const EQ_BARS = [
  { speed: '0.6s', delay: '0s', min: '4px', max: '24px' },
  { speed: '0.5s', delay: '0.15s', min: '6px', max: '30px' },
  { speed: '0.7s', delay: '0.05s', min: '3px', max: '18px' },
  { speed: '0.45s', delay: '0.2s', min: '5px', max: '28px' },
  { speed: '0.55s', delay: '0.1s', min: '4px', max: '22px' },
  { speed: '0.65s', delay: '0.25s', min: '6px', max: '26px' },
  { speed: '0.5s', delay: '0.08s', min: '3px', max: '20px' },
];

function Waveform() {
  return (
    <div className="waveform">
      {EQ_BARS.map((b, i) => (
        <div
          key={i}
          className="eq-bar"
          style={{
            '--eq-speed': b.speed,
            '--eq-delay': b.delay,
            '--eq-min': b.min,
            '--eq-max': b.max,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// --- Time formatting ---
function fmtTime(s: number): string {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
}

// --- Toast ---
function useToast() {
  const [toasts, setToasts] = useState<{ id: number; message: string; type: string }[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, type = 'info') => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.map((tt) => (tt.id === id ? { ...tt, type: tt.type + ' fading' } : tt)));
    }, 3000);
    setTimeout(() => {
      setToasts((t) => t.filter((tt) => tt.id !== id));
    }, 3500);
  }, []);

  return { toasts, showToast };
}

export default function SoundboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  // --- Data state ---
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [librarySongs, setLibrarySongs] = useState<LibrarySong[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState('');

  // --- UI state ---
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<'upload' | 'roster'>('upload');
  const [mainTab, setMainTab] = useState<'game' | 'library'>('game');
  const [libraryFilter, setLibraryFilter] = useState('');
  const [addSongModalOpen, setAddSongModalOpen] = useState(false);
  const [extraControlsOpen, setExtraControlsOpen] = useState(false);
  const [isLight, setIsLight] = useState(false);

  // --- Roster form ---
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newNumber, setNewNumber] = useState('');

  // --- Add song form ---
  const [songFile, setSongFile] = useState<File | null>(null);
  const [songTitle, setSongTitle] = useState('');
  const [songArtist, setSongArtist] = useState('');
  const [songCategories, setSongCategories] = useState<string[]>(['between-innings']);
  const [savingSong, setSavingSong] = useState(false);

  const sfxInputRef = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);

  const { toasts, showToast } = useToast();
  const audio = useAudio();
  const { liveState } = useLiveGame(players);

  // --- Theme ---
  useEffect(() => {
    const stored = localStorage.getItem('padres-theme');
    if (stored === 'light') {
      setIsLight(true);
      document.body.classList.add('light');
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setIsLight((prev) => {
      const next = !prev;
      document.body.classList.toggle('light', next);
      localStorage.setItem('padres-theme', next ? 'light' : 'dark');
      return next;
    });
  }, []);

  // --- Load all data ---
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        // Load sounds
        const { data: soundRows } = await sb.from('sounds').select('*').order('sort_order');
        const loadedSounds: Sound[] = [];
        if (soundRows) {
          for (const s of soundRows) {
            const ext = fileExt(s.file_name);
            const url = audioUrl(`sfx-${s.id}${ext}`);
            loadedSounds.push({ id: s.id, fileName: s.file_name, label: s.label, sortOrder: s.sort_order, url });
          }
        }

        // Load players
        const { data: playerRows } = await sb.from('players').select('*').order('sort_order');
        const loadedPlayers: Player[] = [];
        if (playerRows) {
          for (const p of playerRows) {
            const player: Player = {
              id: p.id,
              firstName: p.first_name || '',
              lastName: p.last_name || '',
              name: ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || p.name,
              number: p.number,
              active: p.active !== false,
              photoFile: p.photo_file || null,
              photoUrl: p.photo_file ? storageUrl(`player-${p.id}-photo`) : null,
              introFile: p.intro_file || null,
              introUrl: p.intro_file ? audioUrl(`player-${p.id}-intro${fileExt(p.intro_file)}`) : null,
              songFile: p.song_file || null,
              songUrl: p.song_file ? audioUrl(`player-${p.id}-song${fileExt(p.song_file)}`) : null,
              comboFile: p.combo_file || null,
              comboUrl: p.combo_file ? audioUrl(`player-${p.id}-combo${fileExt(p.combo_file)}`) : null,
              sortOrder: p.sort_order,
            };
            loadedPlayers.push(player);
          }
        }

        // Load library
        const { data: libRows } = await sb.from('library').select('*').order('sort_order');
        const loadedLibrary: LibrarySong[] = [];
        if (libRows) {
          for (const s of libRows) {
            const ext = fileExt(s.file_name);
            const url = audioUrl(`library-${s.id}${ext}`);
            loadedLibrary.push({ id: s.id, title: s.title, artist: s.artist || '', category: s.category || 'other', fileName: s.file_name, url });
          }
        }

        if (!cancelled) {
          setSounds(loadedSounds);
          setPlayers(loadedPlayers);
          setLibrarySongs(loadedLibrary);

          // Preload audio
          const allUrls = [
            ...loadedSounds.map((s) => s.url),
            ...loadedPlayers.flatMap((p) => [p.introUrl, p.songUrl, p.comboUrl].filter(Boolean) as string[]),
            ...loadedLibrary.map((s) => s.url),
          ];
          let loaded = 0;
          setLoadProgress(`0 / ${allUrls.length}`);

          await Promise.race([
            Promise.all(
              allUrls.map(
                (url) =>
                  new Promise<void>((resolve) => {
                    const a = new Audio(url);
                    a.preload = 'auto';
                    const timeout = setTimeout(resolve, 5000);
                    const done = () => { clearTimeout(timeout); loaded++; setLoadProgress(`${loaded} / ${allUrls.length}`); resolve(); };
                    a.addEventListener('canplay', done, { once: true });
                    a.addEventListener('error', done, { once: true });
                    a.load();
                  })
              )
            ),
            new Promise<void>((resolve) => setTimeout(resolve, 15000)),
          ]);

          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, []);

  // --- Staging badge ---
  useEffect(() => {
    if (isStaging) {
      document.title = '[STAGE] Soundboard';
    }
  }, []);

  // --- Online/offline toasts ---
  useEffect(() => {
    const onOffline = () => showToast('You are offline', 'error');
    const onOnline = () => showToast('Back online', 'success');
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [showToast]);

  // --- Settings nav ---
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // --- SFX handling ---
  async function handleSfxFiles(files: FileList) {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('audio/')) continue;
      const { data, error } = await sb.from('sounds').insert({
        file_name: file.name,
        label: file.name.replace(/\.[^.]+$/, ''),
        sort_order: sounds.length,
      }).select().single();
      if (error || !data) { console.error('Insert sound error:', error); continue; }
      const ext = fileExt(file.name);
      const sfxFilename = `sfx-${data.id}${ext}`;
      await uploadAudioFile(sfxFilename, file);
      const url = audioUrl(sfxFilename);
      setSounds((prev) => [...prev, { id: data.id, fileName: data.file_name, label: data.label, sortOrder: data.sort_order, url }]);
    }
  }

  async function updateSoundLabel(id: string, label: string) {
    setSounds((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)));
    await sb.from('sounds').update({ label }).eq('id', id);
  }

  async function deleteSound(id: string) {
    setSounds((prev) => prev.filter((s) => s.id !== id));
    await sb.from('sounds').delete().eq('id', id);
    await deleteFile(`sfx-${id}`);
  }

  // --- Player handling ---
  async function addPlayer() {
    if (!newFirstName && !newLastName) return;
    const name = (newFirstName + ' ' + newLastName).trim();
    const { data, error } = await sb.from('players').insert({
      name,
      first_name: newFirstName,
      last_name: newLastName,
      number: newNumber || '?',
      sort_order: players.length,
    }).select().single();
    if (error || !data) { console.error('Insert player error:', error); return; }
    const player: Player = {
      id: data.id, firstName: data.first_name, lastName: data.last_name, name, number: data.number,
      active: true, photoFile: null, photoUrl: null,
      introFile: null, introUrl: null, songFile: null, songUrl: null,
      comboFile: null, comboUrl: null, sortOrder: data.sort_order,
    };
    setPlayers((prev) => [...prev, player]);
    setNewFirstName(''); setNewLastName(''); setNewNumber('');
    firstNameRef.current?.focus();
  }

  async function toggleBench(id: string) {
    setPlayers((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const updated = { ...p, active: !p.active };
      savePlayerToDB(updated);
      return updated;
    }));
  }

  async function savePlayerToDB(p: Player) {
    const payload: Record<string, any> = {
      id: p.id, name: (p.firstName + ' ' + p.lastName).trim(),
      first_name: p.firstName, last_name: p.lastName,
      number: p.number, active: p.active,
      photo_file: p.photoFile, intro_file: p.introFile,
      song_file: p.songFile, combo_file: p.comboFile,
      sort_order: p.sortOrder,
    };
    const { error } = await sb.from('players').upsert(payload);
    if (error) {
      delete payload.active;
      await sb.from('players').upsert(payload);
    }
  }

  async function updatePlayerNumber(id: string, number: string) {
    setPlayers((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const updated = { ...p, number };
      savePlayerToDB(updated);
      return updated;
    }));
  }

  async function handlePlayerFileUpload(playerId: string, type: 'photo' | 'intro' | 'song' | 'combo', file: File) {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;

    if (type === 'photo') {
      const compressed = await compressImage(file);
      const blob = new File([compressed], 'photo.jpg', { type: 'image/jpeg' });
      const ok = await uploadFile(`player-${playerId}-photo`, blob);
      if (ok) {
        setPlayers((prev) => prev.map((p) => {
          if (p.id !== playerId) return p;
          const updated = { ...p, photoFile: file.name, photoUrl: storageUrl(`player-${playerId}-photo`) };
          savePlayerToDB(updated);
          return updated;
        }));
      }
    } else {
      const ext = fileExt(file.name);
      const filename = `player-${playerId}-${type}${ext}`;
      const ok = await uploadAudioFile(filename, file);
      if (ok) {
        const url = audioUrl(filename);
        setPlayers((prev) => prev.map((p) => {
          if (p.id !== playerId) return p;
          const updated = { ...p, [`${type}File`]: file.name, [`${type}Url`]: url };
          savePlayerToDB(updated);
          return updated;
        }));
      }
    }
  }

  function reorderPlayers(fromIndex: number, toIndex: number) {
    setPlayers((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      copy.splice(toIndex, 0, moved);
      // Save order
      copy.forEach((p, i) => {
        p.sortOrder = i;
        sb.from('players').upsert({
          id: p.id, name: (p.firstName + ' ' + p.lastName).trim(),
          first_name: p.firstName, last_name: p.lastName,
          number: p.number, photo_file: p.photoFile,
          intro_file: p.introFile, song_file: p.songFile,
          combo_file: p.comboFile, sort_order: i,
        });
      });
      return copy;
    });
  }

  // --- Library ---
  async function saveSong() {
    if (!songFile) { showToast('Please select an audio file', 'error'); return; }
    setSavingSong(true);
    const title = songTitle.trim() || songFile.name.replace(/\.[^.]+$/, '');
    const artist = songArtist.trim();
    const category = songCategories.length ? songCategories.join(',') : 'other';
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ext = fileExt(songFile.name);
    const libFilename = `library-${id}${ext}`;
    const uploaded = await uploadAudioFile(libFilename, songFile);
    if (!uploaded) { setSavingSong(false); showToast('Upload failed', 'error'); return; }

    const { error } = await sb.from('library').insert({ id, title, artist, category, file_name: songFile.name, sort_order: librarySongs.length });
    if (error) { setSavingSong(false); showToast('Save failed: ' + error.message, 'error'); return; }

    const url = audioUrl(libFilename);
    setLibrarySongs((prev) => [...prev, { id, title, artist, category, fileName: songFile.name, url }]);
    setAddSongModalOpen(false);
    setSavingSong(false);
    setSongFile(null); setSongTitle(''); setSongArtist('');
    setSongCategories(['between-innings']);
  }

  async function deleteLibrarySong(id: string) {
    const song = librarySongs.find((s) => s.id === id);
    const ext = song?.fileName ? fileExt(song.fileName) : '';
    await sb.from('library').delete().eq('id', id);
    await deleteFile(`library-${id}${ext}`);
    if (ext) await deleteFile(`library-${id}`);
    setLibrarySongs((prev) => prev.filter((s) => s.id !== id));
  }

  // --- Play helpers ---
  function playSfx(sound: Sound, btnId: string) {
    if (audio.activeBtnId === btnId) {
      audio.stopAll();
    } else {
      audio.playFromQueue([{ url: sound.url, name: sound.label || sound.fileName, label: sound.label || sound.fileName, btnId }]);
    }
  }

  function playPlayerAudio(player: Player, type: 'intro' | 'song' | 'combo', btnId: string) {
    if (audio.activeBtnId === btnId) {
      audio.stopAll();
      return;
    }
    const url = player[`${type}Url`];
    if (!url) return;
    const labels: Record<string, string> = { intro: 'Intro', song: 'Walk-up Song', combo: 'Full Intro + Song' };
    audio.playFromQueue([{ url, name: `${player.name} — ${labels[type]}`, label: `${player.name} — ${labels[type]}`, btnId }]);
  }

  function playLibrarySong(song: LibrarySong) {
    audio.playFromQueue([{ url: song.url, name: song.title }]);
  }

  function playAllLibrary() {
    if (librarySongs.length === 0) return;
    const queue: QueueItem[] = librarySongs.map((s) => ({ url: s.url, name: s.title }));
    if (audio.isShuffle) {
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
    }
    audio.playFromQueue(queue);
  }

  // --- Batter display ---
  const activePlayers = players.filter((p) => p.active);
  const isOurBatting = liveState.currentHalf === 'bottom';
  const atBatIdx = liveState.lineup.length > 0 ? liveState.currentBatterIndex % liveState.lineup.length : -1;
  const onDeckIdx = liveState.lineup.length > 0 ? (liveState.currentBatterIndex + 1) % liveState.lineup.length : -1;
  const atBatPlayer = atBatIdx >= 0 ? players.find((p) => p.id === liveState.lineup[atBatIdx]?.player_id) : null;
  const onDeckPlayer = onDeckIdx >= 0 ? players.find((p) => p.id === liveState.lineup[onDeckIdx]?.player_id) : null;
  const showBanner = !!liveState.gameId && liveState.lineup.length > 0;

  // --- Filtered library ---
  const q = libraryFilter.toLowerCase();
  const filteredLibrary = q
    ? librarySongs.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || s.category.includes(q))
    : librarySongs;

  // --- Render ---
  if (authLoading || !user) {
    return (
      <div className="loading-overlay">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/Logo-White.svg" alt="Sound" style={{ height: 40, width: 'auto', marginBottom: 8 }} />
        <div className="load-text">Checking authentication...</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-overlay">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={isLight ? '/logos/Logo-Black.svg' : '/logos/Logo-White.svg'} alt="Sound" style={{ height: 40, width: 'auto', marginBottom: 8 }} />
        <div className="load-text">Loading sounds...</div>
        <div className="load-progress">{loadProgress}</div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header style={{ background: 'var(--bg-deep)', textAlign: 'center', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, position: 'relative', borderBottom: '1px solid var(--border)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={isLight ? '/logos/Sound-Black.svg' : '/logos/Sound-White.svg'} alt="Sound" style={{ height: 24, width: 'auto' }} />
        {isStaging && <span className="stg-badge" style={{ background: 'oklab(0.769006 0.0640422 0.176756 / 0.2)', color: '#ffb900', border: '1px solid oklab(0.769006 0.0640422 0.176756 / 0.3)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5, textTransform: 'uppercase' as const }}>STG</span>}
        <button className={`settings-toggle ${settingsOpen ? 'active' : ''}`} onClick={settingsOpen ? closeSettings : openSettings} title="Settings">
          <i className="iconoir-settings" style={{ fontSize: 18 }} />
        </button>
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle light/dark mode">
          <i className={isLight ? 'iconoir-half-moon' : 'iconoir-sun-light'} style={{ fontSize: 18 }} />
        </button>
      </header>

      {/* Settings Nav */}
      <nav className={settingsOpen ? 'visible' : ''}>
        <button className={settingsPage === 'upload' ? 'active' : ''} onClick={() => setSettingsPage('upload')}>Upload</button>
        <button className={settingsPage === 'roster' ? 'active' : ''} onClick={() => setSettingsPage('roster')}>Roster</button>
        <button onClick={signOut} style={{ color: 'var(--danger)' }}>Sign Out</button>
      </nav>

      {/* Main Tabs */}
      <nav className={`main-tabs ${settingsOpen ? 'hidden' : ''}`}>
        <button className={mainTab === 'game' ? 'active' : ''} onClick={() => setMainTab('game')}>
          <i className="iconoir-gamepad" style={{ fontSize: 16 }} /> Game
        </button>
        <button className={mainTab === 'library' ? 'active' : ''} onClick={() => setMainTab('library')}>
          <i className="iconoir-book-stack" style={{ fontSize: 16 }} /> Music Library
        </button>
      </nav>

      {/* Upload Page */}
      {settingsOpen && settingsPage === 'upload' && (
        <div className="page active">
          <div className="section-title">Sound Effects</div>
          <div
            className="drop-zone"
            onClick={() => sfxInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
            onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); handleSfxFiles(e.dataTransfer.files); }}
          >
            <p>Drag & drop MP3 files here</p>
            <small>or click to browse</small>
          </div>
          <input ref={sfxInputRef} type="file" className="file-input" accept="audio/*" multiple onChange={(e) => { if (e.target.files) handleSfxFiles(e.target.files); e.target.value = ''; }} />
          <ul className="upload-list">
            {sounds.map((entry) => (
              <li key={entry.id} className="upload-item">
                <span className="file-name">{entry.fileName}</span>
                <input type="text" defaultValue={entry.label} placeholder="Button label..." onChange={(e) => updateSoundLabel(entry.id, e.target.value)} />
                <button className="remove-btn" onClick={() => deleteSound(entry.id)}>&times;</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Roster Page */}
      {settingsOpen && settingsPage === 'roster' && (
        <div className="page active">
          <div className="section-title">Add Player</div>
          <div className="add-player-row">
            <input ref={firstNameRef} type="text" placeholder="First name" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addPlayer(); }} />
            <input type="text" placeholder="Last name" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addPlayer(); }} />
            <input type="text" placeholder="#" style={{ maxWidth: 60, textAlign: 'center' }} value={newNumber} onChange={(e) => setNewNumber(e.target.value)} />
            <button onClick={addPlayer}>Add Player</button>
          </div>
          <div className="section-title">Roster</div>
          {players.length === 0 && <div className="empty-state" style={{ marginTop: 24 }}>No players added yet.</div>}
          {players.map((p, idx) => (
            <div
              key={p.id}
              className={`player-card ${p.active ? '' : 'benched'}`}
              draggable
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(idx)); }}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
              onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); const from = parseInt(e.dataTransfer.getData('text/plain')); if (from !== idx) reorderPlayers(from, idx); }}
            >
              <div className="player-header">
                <span className="drag-handle"><i className="iconoir-menu" style={{ fontSize: 16 }} /></span>
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="player-photo" src={p.photoUrl} alt={p.name} />
                ) : (
                  <div className="player-photo-placeholder"><i className="iconoir-camera" style={{ fontSize: 16 }} /></div>
                )}
                <input
                  type="text"
                  className="player-number-input"
                  defaultValue={p.number}
                  placeholder="#"
                  title="Player number"
                  onChange={(e) => updatePlayerNumber(p.id, e.target.value)}
                />
                <div className="player-name-display">{p.firstName} <strong>{p.lastName}</strong></div>
                <button className="bench-toggle" onClick={() => toggleBench(p.id)} title={p.active ? 'Bench player' : 'Activate player'}>
                  <i className={p.active ? 'iconoir-user-badge-check' : 'iconoir-user-xmark'} style={{ fontSize: 14 }} />
                  {p.active ? ' Active' : ' Benched'}
                </button>
              </div>
              {(['photo', 'intro', 'song', 'combo'] as const).map((type) => {
                const fileField = type === 'photo' ? p.photoFile : p[`${type}File`];
                const label = type === 'photo' ? 'Photo:' : type === 'intro' ? 'Intro:' : type === 'song' ? 'Walk-up:' : 'Combined:';
                const accept = type === 'photo' ? 'image/*' : 'audio/*';
                return (
                  <div key={type} className="player-audio-row">
                    <label>{label}</label>
                    <span className={`file-label ${fileField ? '' : 'empty'}`}>{fileField || (type === 'photo' ? 'No photo' : 'No file')}</span>
                    <input type="file" accept={accept} className="file-input" id={`file-${p.id}-${type}`} onChange={(e) => { if (e.target.files?.[0]) handlePlayerFileUpload(p.id, type, e.target.files[0]); }} />
                    <button className="small-btn" onClick={() => document.getElementById(`file-${p.id}-${type}`)?.click()}>Upload</button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Play Page */}
      {!settingsOpen && (
        <div className="page active">
          {/* Game Tab */}
          {mainTab === 'game' && (
            <div className="tab-content active">
              <div className="section-title">Soundboard</div>
              <div className="board-wrap">
                <div className="board">
                  {sounds.map((entry) => {
                    const btnId = `sfx-${entry.id}`;
                    const isActive = audio.activeBtnId === btnId;
                    return (
                      <button key={entry.id} className={`sound-btn ${isActive ? 'playing' : ''}`} onClick={() => playSfx(entry, btnId)}>
                        {isActive ? (
                          <><Waveform /><i className="iconoir-pause pause-icon" /></>
                        ) : (
                          <span className="btn-label">{entry.label || entry.fileName}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {sounds.length === 0 && (
                <div className="empty-state" style={{ marginTop: 20 }}>
                  No sounds yet. <a onClick={() => { openSettings(); setSettingsPage('upload'); }}>Upload some MP3s</a> to get started.
                </div>
              )}

              <div className="lineup-section">
                <div className="section-title">Lineup</div>

                {/* Live Batter Banner */}
                {showBanner && (
                  <div className={`live-batter-banner ${showBanner ? 'visible' : ''}`}>
                    {!isOurBatting ? (
                      <div className="batter-slot">
                        <span className="batter-tag defense">Defense</span>
                        <span className="batter-name">Top of {liveState.currentInning}</span>
                      </div>
                    ) : (
                      <>
                        <div className="batter-slot">
                          <span className="batter-tag at-bat">Batting</span>
                          {atBatPlayer && <><span className="batter-number">#{atBatPlayer.number}</span><span className="batter-name">{atBatPlayer.firstName} {atBatPlayer.lastName}</span></>}
                        </div>
                        <div className="divider" />
                        <div className="batter-slot">
                          <span className="batter-tag on-deck">On Deck</span>
                          {onDeckPlayer && <><span className="batter-number">#{onDeckPlayer.number}</span><span className="batter-name">{onDeckPlayer.firstName} {onDeckPlayer.lastName}</span></>}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <div className="lineup-grid">
                  {activePlayers.map((p) => {
                    const introBtnId = `intro-${p.id}`;
                    const songBtnId = `song-${p.id}`;
                    const comboBtnId = `combo-${p.id}`;
                    const isAtBat = atBatPlayer?.id === p.id && isOurBatting;
                    const isOnDeck = onDeckPlayer?.id === p.id && isOurBatting;
                    return (
                      <div key={p.id} className={`lineup-card ${isAtBat ? 'at-bat' : ''} ${isOnDeck ? 'on-deck' : ''}`}>
                        <div className="lc-name">
                          {p.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="lc-photo" src={p.photoUrl} alt={p.name} />
                          ) : (
                            <div className="lc-photo-placeholder"><i className="iconoir-camera" style={{ fontSize: 16 }} /></div>
                          )}
                          <div className="player-number">{p.number}</div>
                          {p.firstName} <strong>{p.lastName}</strong>
                        </div>
                        <div className="lc-buttons">
                          <button
                            className={`lc-btn lc-btn-sq ${audio.activeBtnId === introBtnId ? 'playing' : ''}`}
                            disabled={!p.introUrl}
                            title="Intro"
                            onClick={() => playPlayerAudio(p, 'intro', introBtnId)}
                          >
                            {audio.activeBtnId === introBtnId ? <Waveform /> : <i className="iconoir-microphone" style={{ fontSize: 16 }} />}
                          </button>
                          <button
                            className={`lc-btn lc-btn-sq ${audio.activeBtnId === songBtnId ? 'playing' : ''}`}
                            disabled={!p.songUrl}
                            title="Song"
                            onClick={() => playPlayerAudio(p, 'song', songBtnId)}
                          >
                            {audio.activeBtnId === songBtnId ? <Waveform /> : <i className="iconoir-music-double-note" style={{ fontSize: 16 }} />}
                          </button>
                          <button
                            className={`lc-btn combo-btn full ${audio.activeBtnId === comboBtnId ? 'playing' : ''}`}
                            disabled={!p.comboUrl}
                            title="Combined"
                            onClick={() => playPlayerAudio(p, 'combo', comboBtnId)}
                          >
                            {audio.activeBtnId === comboBtnId ? <Waveform /> : <i className="iconoir-play" style={{ fontSize: 20 }} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {activePlayers.length === 0 && (
                  <div className="empty-state" style={{ marginTop: 20 }}>
                    No players yet. <a onClick={() => { openSettings(); setSettingsPage('roster'); }}>Add players on the Roster page</a>.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Music Library Tab */}
          {mainTab === 'library' && (
            <div className="tab-content active">
              <div className="section-title">Song Library</div>
              <div className="library-controls">
                <div className="library-search">
                  <i className="iconoir-search" style={{ fontSize: 16, color: 'var(--text-dim)' }} />
                  <input type="text" placeholder="Search songs..." value={libraryFilter} onChange={(e) => setLibraryFilter(e.target.value)} />
                </div>
                <button className="small-btn primary play-all-btn" onClick={playAllLibrary}>
                  <i className="iconoir-play" style={{ fontSize: 14 }} /><span className="btn-label"> Play All</span>
                </button>
                <button className="small-btn add-song-btn" onClick={() => setAddSongModalOpen(true)}>
                  <i className="iconoir-plus" style={{ fontSize: 14 }} /><span className="btn-label"> Add Song</span>
                </button>
              </div>
              <div className="library-list">
                {filteredLibrary.map((song) => (
                  <div key={song.id} className="library-item">
                    <div className="song-info">
                      <div className="song-title">{song.title}</div>
                      {song.artist && <div className="song-meta">{song.artist}</div>}
                    </div>
                    <div className="song-actions">
                      <button title="Add to Queue" onClick={() => audio.addToQueue({ url: song.url, name: song.title })}>
                        <i className="iconoir-playlist-plus" style={{ fontSize: 14 }} />
                      </button>
                      <button title="Play" onClick={() => playLibrarySong(song)}>
                        <i className="iconoir-play" style={{ fontSize: 14 }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {filteredLibrary.length === 0 && (
                <div className="empty-state" style={{ marginTop: 20 }}>
                  No songs in the library yet. Add songs for between innings, warmups, and more.
                </div>
              )}

              {/* Queue */}
              {audio.playQueue.length > 0 && audio.queueIndex >= 0 && (
                <div className="queue-section">
                  <div className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Queue</span>
                    <button className="small-btn danger" onClick={audio.clearQueue} style={{ fontSize: 'var(--text-xs)' }}>Clear</button>
                  </div>
                  <div className="queue-list">
                    {/* Current */}
                    {audio.queueIndex >= 0 && audio.queueIndex < audio.playQueue.length && (
                      <div className="queue-item current">
                        <span className="queue-drag" style={{ visibility: 'hidden' }}><i className="iconoir-menu" style={{ fontSize: 14 }} /></span>
                        <span className="queue-pos" style={{ color: 'var(--clay)' }}><i className="iconoir-play" style={{ fontSize: 10 }} /></span>
                        <span className="queue-name" style={{ color: 'var(--clay)', fontWeight: 600 }}>{audio.playQueue[audio.queueIndex].name || 'Unknown'}</span>
                      </div>
                    )}
                    {audio.playQueue.map((item, i) => {
                      if (i <= audio.queueIndex) return null;
                      return (
                        <div key={i} className="queue-item">
                          <span className="queue-drag"><i className="iconoir-menu" style={{ fontSize: 14 }} /></span>
                          <span className="queue-pos">{i - audio.queueIndex}</span>
                          <span className="queue-name">{item.name || 'Unknown'}</span>
                          <button className="queue-remove" title="Remove" onClick={() => audio.removeFromQueue(i)}>
                            <i className="iconoir-xmark" style={{ fontSize: 12 }} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Now Playing */}
      <div className="now-playing">
        <div className="progress-bar" style={{ width: audio.duration ? `${(audio.currentTime / audio.duration) * 100}%` : '0%' }} />
        <div className="np-row">
          <div className="track-info">
            <div className="track-name">
              {audio.queueIndex >= 0 && audio.queueIndex < audio.playQueue.length
                ? audio.playQueue[audio.queueIndex].label || audio.playQueue[audio.queueIndex].name
                : 'Nothing playing'}
            </div>
            <div className="track-meta">
              <span className="track-status">
                {audio.queueIndex >= 0 && audio.queueIndex < audio.playQueue.length
                  ? (audio.isPlaying ? 'Playing' : 'Paused')
                  : 'Tap a button to play'}
              </span>
              <span className="time-display">{fmtTime(audio.currentTime)} / {fmtTime(audio.duration)}</span>
            </div>
          </div>
          <div className="controls">
            <button onClick={audio.skipPrev} title="Previous"><i className="iconoir-skip-prev" style={{ fontSize: 16 }} /></button>
            <button className="play-pause" onClick={audio.togglePlayPause} title="Play/Pause">
              <i className={audio.isPlaying ? 'iconoir-pause' : 'iconoir-play'} style={{ fontSize: audio.isPlaying ? 24 : 20 }} />
            </button>
            <button onClick={audio.skipNext} title="Next"><i className="iconoir-skip-next" style={{ fontSize: 16 }} /></button>
            <button className={`more-toggle ${extraControlsOpen ? 'open' : ''}`} onClick={() => setExtraControlsOpen((o) => !o)} title="More">
              <i className="iconoir-nav-arrow-up" style={{ fontSize: 14 }} />
            </button>
          </div>
        </div>
        <div className={`extra-controls ${extraControlsOpen ? 'visible' : ''}`}>
          <button className={audio.isShuffle ? 'active' : ''} onClick={audio.toggleShuffle} title="Shuffle">
            <i className="iconoir-shuffle" style={{ fontSize: 16 }} />
          </button>
          <button className={audio.repeatMode !== 'off' ? 'active' : ''} onClick={audio.cycleRepeat} title="Repeat">
            <i className={audio.repeatMode === 'one' ? 'iconoir-repeat-once' : 'iconoir-repeat'} style={{ fontSize: 16 }} />
          </button>
        </div>
      </div>

      {/* Add Song Modal */}
      {addSongModalOpen && (
        <div className="modal-overlay visible" onClick={(e) => { if (e.target === e.currentTarget) setAddSongModalOpen(false); }}>
          <div className="modal">
            <h3>Add Song</h3>
            <div className="form-group">
              <label>Audio File</label>
              <input type="file" accept="audio/*" onChange={(e) => setSongFile(e.target.files?.[0] || null)} />
            </div>
            <div className="form-group">
              <label>Song Title</label>
              <input type="text" placeholder="Enter song title" value={songTitle} onChange={(e) => setSongTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Artist</label>
              <input type="text" placeholder="Enter artist name" value={songArtist} onChange={(e) => setSongArtist(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Category</label>
              <div className="category-chips">
                {[
                  { value: 'between-innings', label: 'Between Innings' },
                  { value: 'warmup', label: 'Warmup' },
                  { value: 'pre-game', label: 'Pre-Game' },
                  { value: 'post-game', label: 'Post-Game' },
                  { value: 'other', label: 'Other' },
                ].map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    className={`chip ${songCategories.includes(cat.value) ? 'active' : ''}`}
                    onClick={() => setSongCategories((prev) => prev.includes(cat.value) ? prev.filter((c) => c !== cat.value) : [...prev, cat.value])}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="small-btn" onClick={() => setAddSongModalOpen(false)}>Cancel</button>
              <button className="small-btn primary" onClick={saveSong} disabled={savingSong}>
                <i className="iconoir-upload" style={{ fontSize: 14 }} /> {savingSong ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </>
  );
}
