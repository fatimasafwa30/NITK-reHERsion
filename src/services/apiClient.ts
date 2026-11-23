/**
 * VeraTrace — Hybrid API Client
 *
 * Automatically connects to the local VeraTrace Enterprise Backend (http://localhost:4000/api)
 * when running locally, and falls back seamlessly to client-side IndexedDB and LocalStorage
 * when deployed on static/cloud previews (e.g. Vercel).
 */

export const BACKEND_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:4000/api'
  : 'https://veratrace-app.vercel.app/api';

let backendAvailable: boolean | null = null;
let lastCheckTime = 0;
const CHECK_TTL_MS = 5000;

export async function isBackendOnline(forceRefresh = false): Promise<boolean> {
  const now = Date.now();
  if (!forceRefresh && backendAvailable !== null && now - lastCheckTime < CHECK_TTL_MS) {
    return backendAvailable;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${BACKEND_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    backendAvailable = res.ok;
    lastCheckTime = Date.now();
    return backendAvailable;
  } catch {
    backendAvailable = false;
    lastCheckTime = Date.now();
    return false;
  }
}

function getCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )veratrace_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const online = await isBackendOnline(false);
  if (!online) {
    throw new Error('BACKEND_OFFLINE');
  }

  const url = endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const token = typeof window !== 'undefined' ? window.localStorage?.getItem('veratrace_token') : null;
  const csrfToken = getCsrfCookie();

  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Seals an evidence file and incident metadata into the VeraTrace backend vault.
 */
export async function sealEvidenceToBackend(caseId: string, formData: FormData): Promise<any> {
  return apiFetch(`/cases/${caseId}/evidence`, {
    method: 'POST',
    body: formData,
  });
}
