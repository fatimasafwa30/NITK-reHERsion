/**
 * VeraTrace — Hybrid API Client
 *
 * Automatically connects to the local VeraTrace Enterprise Backend (http://localhost:4000/api)
 * when running locally, and falls back seamlessly to client-side IndexedDB and LocalStorage
 * when deployed on static/cloud previews (e.g. Vercel).
 */

const BACKEND_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:4000/api'
  : 'https://veratrace-app.vercel.app/api';

let backendAvailable: boolean | null = null;

export async function isBackendOnline(): Promise<boolean> {
  if (backendAvailable !== null) return backendAvailable;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${BACKEND_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    backendAvailable = res.ok;
    return backendAvailable;
  } catch {
    backendAvailable = false;
    return false;
  }
}

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const online = await isBackendOnline();
  if (!online) {
    throw new Error('BACKEND_OFFLINE');
  }

  const url = endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': options.body instanceof FormData ? undefined : 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${res.status}`);
  }

  return res.json();
}
