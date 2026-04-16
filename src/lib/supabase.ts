import { createClient } from '@supabase/supabase-js';

const ENV = {
  staging: {
    url: 'https://xrtetfxvyicdqfpwnpzt.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhydGV0Znh2eWljZHFmcHducHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5OTA0ODMsImV4cCI6MjA5MDU2NjQ4M30.Y3v9FytVpOzCIYRvRitSoQeoPOaCHifnH6bRgoPEKBc',
  },
  production: {
    url: 'https://fbvdwhbsewhmkjomftjr.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZidmR3aGJzZXdobWtqb21mdGpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjM3ODAsImV4cCI6MjA5MDczOTc4MH0.33mIS7xoEh0gig0rseqwQ9TAw3qVEkmU3HvJA88eoNM',
  },
} as const;

function getCurrentEnv(): 'staging' | 'production' {
  if (typeof window === 'undefined') return 'staging';
  const host = window.location.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const isStaging = host === 'sound.stg.six43.co';
  const isVercelPreview =
    host.endsWith('.vercel.app') && host !== 'sound-board-azure.vercel.app';
  return isLocal || isStaging || isVercelPreview ? 'staging' : 'production';
}

const CURRENT_ENV = getCurrentEnv();

export const SUPABASE_URL = ENV[CURRENT_ENV].url;
export const SUPABASE_KEY = ENV[CURRENT_ENV].key;
export const STORAGE_BUCKET = 'media';
export const MEDIA_HOST = 'https://www.layman-design.com/six43';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
export const isStaging = CURRENT_ENV === 'staging';

export function audioUrl(filename: string): string {
  return `${MEDIA_HOST}/audio/${filename}`;
}

export function storageUrl(path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

export function fileExt(name: string | null): string {
  if (!name) return '';
  const m = name.match(/\.[^.]+$/);
  return m ? m[0] : '';
}

let _mediaKeyCache: string | null = null;

async function getMediaKey(): Promise<string> {
  if (_mediaKeyCache) return _mediaKeyCache;
  const res = await fetch('/api/upload-audio');
  const data = await res.json();
  if (!data.key) throw new Error('Failed to get upload key');
  _mediaKeyCache = data.key;
  return data.key;
}

export async function uploadAudioFile(
  filename: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<boolean> {
  const key = await getMediaKey();
  return new Promise((resolve) => {
    const form = new FormData();
    form.append('file', file);
    form.append('filename', filename);
    form.append('key', key);
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve(true);
      } else {
        console.error('Audio upload error:', filename, xhr.status, xhr.responseText);
        resolve(false);
      }
    });
    xhr.addEventListener('error', () => {
      console.error('Audio upload network error:', filename);
      resolve(false);
    });
    xhr.open('POST', `${MEDIA_HOST}/upload.php`);
    xhr.send(form);
  });
}

export async function uploadFile(
  path: string,
  file: File | Blob,
  onProgress?: (pct: number) => void
): Promise<boolean> {
  await sb.storage.from(STORAGE_BUCKET).remove([path]);
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve(true);
      } else {
        console.error('Upload error:', path, xhr.status, xhr.responseText);
        resolve(false);
      }
    });
    xhr.addEventListener('error', () => {
      console.error('Upload network error:', path);
      resolve(false);
    });
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_KEY}`);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('Cache-Control', 'no-cache');
    if (file instanceof File && file.type) xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

export async function deleteFile(path: string): Promise<void> {
  await sb.storage.from(STORAGE_BUCKET).remove([path]);
}

export function compressImage(
  file: File,
  maxSize = 512,
  quality = 0.8
): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let w = img.width,
        h = img.height;
      if (w > h) {
        if (w > maxSize) {
          h = (h * maxSize) / w;
          w = maxSize;
        }
      } else {
        if (h > maxSize) {
          w = (w * maxSize) / h;
          h = maxSize;
        }
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}
