// Formatting helpers. Hashes, IDs and timestamps are the product's primary
// data, so they get deliberate treatment rather than raw strings.

/** Split a hex digest into 8-character blocks for legibility. */
export function hashBlocks(hash, size = 8) {
  if (!hash) return [];
  return hash.match(new RegExp(`.{1,${size}}`, 'g')) || [];
}

/** Indexes of the blocks that differ between two digests. */
export function differingBlocks(a, b, size = 8) {
  const left = hashBlocks(a, size);
  const right = hashBlocks(b, size);
  const length = Math.max(left.length, right.length);
  const out = new Set();
  for (let i = 0; i < length; i += 1) {
    if (left[i] !== right[i]) out.add(i);
  }
  return out;
}

export function shortHash(hash) {
  if (!hash) return '—';
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

const DATE = { year: 'numeric', month: 'short', day: '2-digit' };
const TIME = { hour: '2-digit', minute: '2-digit', hour12: false };

export function formatDate(iso) {
  if (!iso) return 'Date uncertain';
  return new Date(iso).toLocaleDateString('en-GB', DATE);
}

export function formatDateTime(iso) {
  if (!iso) return 'Date uncertain';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', DATE)} · ${d.toLocaleTimeString('en-GB', TIME)}`;
}

/** Absolute, unambiguous stamp for the dossier and integrity report. */
export function formatStamp(iso) {
  if (!iso) return 'not recorded';
  return new Date(iso).toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

export function relativeDay(iso) {
  if (!iso) return 'unknown';
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? 'last month' : `${months} months ago`;
}

export function fileKind(mimeType = '', fileName = '') {
  const ext = fileName.includes('.') ? fileName.split('.').pop().toUpperCase() : '';
  if (mimeType.startsWith('image/')) return ext || 'IMAGE';
  if (mimeType.startsWith('audio/')) return ext || 'AUDIO';
  if (mimeType.startsWith('video/')) return ext || 'VIDEO';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('text/')) return ext || 'TEXT';
  return ext || 'FILE';
}

export const CASE_STATUS_LABEL = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  CLOSED: 'Closed',
};

export const VERIFICATION_LABEL = {
  UNVERIFIED: 'Not re-verified',
  MATCH: 'Unchanged',
  MISMATCH: 'Changed',
  ERROR: 'Check failed',
};
