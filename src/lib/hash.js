// Real SHA-256 over the real bytes of a real file, in the browser.
// The file never leaves the device; nothing is uploaded anywhere.

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hashingAvailable() {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

/**
 * Hash a File with progress reporting.
 * Reads the file in chunks so the progress state is honest rather than faked,
 * then digests the assembled bytes with crypto.subtle.
 *
 * @param {File} file
 * @param {(ratio: number) => void} [onProgress] 0..1
 * @returns {Promise<string>} lowercase hex SHA-256
 */
export async function sha256File(file, onProgress) {
  if (!hashingAvailable()) {
    throw new Error('This browser cannot compute SHA-256 hashes locally.');
  }

  let bytes;

  if (typeof file.stream === 'function') {
    const reader = file.stream().getReader();
    const chunks = [];
    let read = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      read += value.byteLength;
      if (onProgress && file.size) onProgress(Math.min(read / file.size, 0.99));
    }
    bytes = new Uint8Array(read);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  } else {
    bytes = new Uint8Array(await file.arrayBuffer());
    if (onProgress) onProgress(0.99);
  }

  const digest = await crypto.subtle.digest('SHA-256', bytes);
  if (onProgress) onProgress(1);
  return toHex(digest);
}
