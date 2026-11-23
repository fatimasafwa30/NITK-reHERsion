/**
 * VeraTrace — Hybrid API Client
 *
 * Automatically connects to the local VeraTrace Enterprise Backend (http://localhost:4000/api)
 * when running locally, and falls back seamlessly to client-side IndexedDB and LocalStorage
 * when deployed on static/cloud previews (e.g. Vercel).
 */

export const BACKEND_URL = (
  typeof window !== 'undefined' && window.localStorage?.getItem('veratrace_backend_url')
) || (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || ''
) || (
  typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:4000/api'
    : 'https://veratrace-app.vercel.app/api'
);

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

export async function apiFetch(endpoint: string, options: RequestInit = {}, tokenOverride?: string | null): Promise<any> {
  const online = await isBackendOnline(false);
  if (!online) {
    throw new Error('BACKEND_OFFLINE');
  }

  const url = endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const token = tokenOverride
    || (typeof window !== 'undefined' ? (window.localStorage?.getItem('veratrace_extension_token') || window.localStorage?.getItem('veratrace_token')) : null);
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
export async function sealEvidenceToBackend(caseId: string, formData: FormData, tokenOverride?: string | null): Promise<any> {
  return apiFetch(`/cases/${caseId}/evidence`, {
    method: 'POST',
    body: formData,
  }, tokenOverride);
}

/**
 * Generates a short-lived, single-use extension pairing token.
 */
export async function generateExtensionPairingToken(deviceName = 'Chrome MV3 Extension'): Promise<{
  success: boolean;
  pairingToken: string;
  expiresAt: string;
  expiresInSeconds: number;
  user: { userId: string; username: string };
}> {
  return apiFetch('/auth/extension-pairing-token', {
    method: 'POST',
    body: JSON.stringify({ deviceName }),
  });
}

/**
 * Retrieves the list of paired extension credentials for the active user.
 */
export async function getExtensionCredentials(): Promise<{ credentials: Array<any> }> {
  return apiFetch('/auth/extension-credentials');
}

/**
 * Revokes a paired extension credential.
 */
export async function revokeExtensionCredential(credentialId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/auth/extension-pair/${credentialId}`, {
    method: 'DELETE',
  });
}
