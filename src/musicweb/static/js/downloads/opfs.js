/**
 * Origin Private File System storage for downloads.
 * OPFS is required (resumable Range downloads need partials).
 */

const AUDIO_DIR = "audio";
const COVERS_DIR = "covers";
const ALBUMS_DIR = "albums";
const ARTISTS_DIR = "artists";

/** @type {boolean | null} */
let opfsAvailable = null;

/** Error thrown when a resumable write is intentionally stopped (pause/cancel). */
export class DownloadWriteAbortError extends Error {
  /**
   * @param {string} reason
   * @param {{ keepPartial?: boolean }} [opts]
   */
  constructor(reason = "aborted", opts = {}) {
    super(reason);
    this.name = "DownloadWriteAbortError";
    this.keepPartial = opts.keepPartial !== false;
    this.reason = reason;
  }
}

export async function hasOpfs() {
  if (opfsAvailable != null) return opfsAvailable;
  try {
    opfsAvailable =
      typeof navigator !== "undefined" &&
      !!navigator.storage &&
      typeof navigator.storage.getDirectory === "function";
    if (opfsAvailable) await navigator.storage.getDirectory();
  } catch {
    opfsAvailable = false;
  }
  return opfsAvailable;
}

export async function requireOpfs() {
  if (!(await hasOpfs())) {
    throw new Error(
      "Downloads require Origin Private File System (OPFS). Use a recent Chromium, Safari, or Firefox build."
    );
  }
}

/**
 * @param {string[]} parts
 * @param {{ create?: boolean }} [opts]
 */
async function getDir(parts, opts = { create: true }) {
  await requireOpfs();
  let dir = await navigator.storage.getDirectory();
  for (const p of parts) {
    dir = await dir.getDirectoryHandle(p, { create: !!opts.create });
  }
  return dir;
}

/**
 * @param {string[]} dirParts
 * @param {string} fileName
 */
async function removeFile(dirParts, fileName) {
  try {
    const dir = await getDir(dirParts, { create: false });
    await dir.removeEntry(fileName);
  } catch {
    /* missing ok */
  }
}

function partialName(fileName) {
  return `${fileName}.partial`;
}

/**
 * @param {string[]} dirParts
 * @param {string} fileName
 * @returns {Promise<number>}
 */
export async function partialByteSize(dirParts, fileName) {
  if (!(await hasOpfs())) return 0;
  try {
    const dir = await getDir(dirParts, { create: false });
    const handle = await dir.getFileHandle(partialName(fileName), {
      create: false,
    });
    const file = await handle.getFile();
    return file.size || 0;
  } catch {
    return 0;
  }
}

/**
 * @param {string[]} dirParts
 * @param {string} fileName
 */
export async function removePartial(dirParts, fileName) {
  if (await hasOpfs()) {
    await removeFile(dirParts, partialName(fileName));
  }
}

/**
 * Promote partial → final name.
 * @param {string[]} dirParts
 * @param {string} fileName
 * @param {number} bytes
 */
async function finalizePartial(dirParts, fileName, bytes) {
  const partial = partialName(fileName);
  const dir = await getDir(dirParts, { create: true });

  if (typeof dir.move === "function") {
    try {
      await removeFile(dirParts, fileName);
      await dir.move(partial, fileName);
      return { backend: "opfs", path: [...dirParts, fileName].join("/"), bytes };
    } catch {
      /* fall through */
    }
  }

  await removeFile(dirParts, fileName);
  const partFile = await (await dir.getFileHandle(partial)).getFile();
  const finalHandle = await dir.getFileHandle(fileName, { create: true });
  const w = await finalHandle.createWritable();
  try {
    await w.write(await partFile.arrayBuffer());
    await w.close();
  } catch (err) {
    try {
      await w.abort();
    } catch {
      /* ignore */
    }
    throw err;
  }
  await removeFile(dirParts, partial);
  return { backend: "opfs", path: [...dirParts, fileName].join("/"), bytes };
}

/**
 * Stream a Response body into a writable, honoring abort + progress.
 * @returns {Promise<number>} bytes written in this call (not including prior offset)
 */
async function streamBodyToWritable(response, writable, {
  signal,
  onProgress,
  loadedStart = 0,
  total = null,
  keepPartialOnAbort = false,
}) {
  let loaded = loadedStart;
  if (onProgress) onProgress(loaded, total);

  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        throw new DownloadWriteAbortError(signal.reason || "aborted", {
          keepPartial: keepPartialOnAbort,
        });
      }
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      loaded += value.byteLength;
      if (onProgress) onProgress(loaded, total);
    }
  } else {
    if (signal?.aborted) {
      throw new DownloadWriteAbortError(signal.reason || "aborted", {
        keepPartial: keepPartialOnAbort,
      });
    }
    const buf = await response.arrayBuffer();
    await writable.write(buf);
    loaded = loadedStart + buf.byteLength;
    if (onProgress) onProgress(loaded, total ?? loaded);
  }
  return loaded;
}

/**
 * Write into OPFS via partial file, then promote to final name.
 * On failure, partial is removed (for non-resumable full writes).
 * @param {string[]} dirParts
 * @param {string} fileName
 * @param {(writable: FileSystemWritableFileStream) => Promise<number>} writeBody
 */
async function writeOpfsAtomic(dirParts, fileName, writeBody) {
  const partial = partialName(fileName);
  await removeFile(dirParts, partial);
  const dir = await getDir(dirParts, { create: true });
  const partialHandle = await dir.getFileHandle(partial, { create: true });
  const writable = await partialHandle.createWritable();
  let bytes = 0;
  try {
    bytes = await writeBody(writable);
    await writable.close();
  } catch (err) {
    try {
      await writable.abort();
    } catch {
      /* ignore */
    }
    await removeFile(dirParts, partial);
    throw err;
  }
  return finalizePartial(dirParts, fileName, bytes);
}

/**
 * @param {string[]} dirParts
 * @param {string} fileName
 * @param {Blob | ArrayBuffer | Uint8Array} data
 */
export async function writeBinary(dirParts, fileName, data) {
  await requireOpfs();
  const blob =
    data instanceof Blob
      ? data
      : new Blob([data instanceof Uint8Array ? data : new Uint8Array(data)]);
  return writeOpfsAtomic(dirParts, fileName, async (writable) => {
    await writable.write(blob);
    return blob.size;
  });
}

/**
 * Parse full size from Content-Range: bytes start-end/total
 * @param {string | null} header
 * @returns {number | null}
 */
function parseContentRangeTotal(header) {
  if (!header) return null;
  const m = /\/(\d+)\s*$/.exec(header);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Stream a Response body into OPFS (full or resumable).
 *
 * @param {string[]} dirParts
 * @param {string} fileName
 * @param {Response} response
 * @param {{
 *   startOffset?: number,
 *   onProgress?: (loaded: number, total: number | null) => void,
 *   signal?: AbortSignal,
 *   keepPartialOnAbort?: boolean,
 * }} [opts]
 * @returns {Promise<{ backend: string, path: string, bytes: number }>}
 */
export async function writeResponseToFile(dirParts, fileName, response, opts = {}) {
  await requireOpfs();

  const startOffset = Math.max(0, opts.startOffset || 0);
  const onProgress = opts.onProgress;
  const signal = opts.signal;
  const keepPartialOnAbort = opts.keepPartialOnAbort === true;

  if (signal?.aborted) {
    throw new DownloadWriteAbortError(signal.reason || "aborted", {
      keepPartial: keepPartialOnAbort,
    });
  }

  if (response.status === 416) {
    await removePartial(dirParts, fileName);
    const err = new Error("Range not satisfiable");
    err.name = "RangeNotSatisfiableError";
    throw err;
  }

  let offset = startOffset;
  if (startOffset > 0 && response.status === 200) {
    await removePartial(dirParts, fileName);
    offset = 0;
  }

  if (!(response.ok || response.status === 206)) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  let total = null;
  if (response.status === 206) {
    total = parseContentRangeTotal(response.headers.get("Content-Range"));
  } else {
    const cl = response.headers.get("Content-Length");
    if (cl) {
      const n = Number(cl);
      total = Number.isFinite(n) ? (offset > 0 ? offset + n : n) : null;
    }
  }

  // Non-resumable art path
  if (offset === 0 && !keepPartialOnAbort) {
    return writeOpfsAtomic(dirParts, fileName, async (writable) =>
      streamBodyToWritable(response, writable, {
        signal,
        onProgress,
        loadedStart: 0,
        total,
        keepPartialOnAbort: false,
      })
    );
  }

  const partial = partialName(fileName);
  const dir = await getDir(dirParts, { create: true });
  const partialHandle = await dir.getFileHandle(partial, { create: true });

  /** @type {FileSystemWritableFileStream} */
  let writable;
  if (offset > 0) {
    writable = await partialHandle.createWritable({ keepExistingData: true });
    await writable.seek(offset);
  } else {
    writable = await partialHandle.createWritable({ keepExistingData: false });
  }

  let loaded = offset;
  try {
    loaded = await streamBodyToWritable(response, writable, {
      signal,
      onProgress,
      loadedStart: offset,
      total,
      keepPartialOnAbort,
    });
    await writable.close();
  } catch (err) {
    try {
      await writable.abort();
    } catch {
      /* ignore */
    }
    if (err instanceof DownloadWriteAbortError) {
      if (!err.keepPartial) await removePartial(dirParts, fileName);
      throw err;
    }
    if (signal?.aborted) {
      if (!keepPartialOnAbort) await removePartial(dirParts, fileName);
      throw new DownloadWriteAbortError(signal.reason || "aborted", {
        keepPartial: keepPartialOnAbort,
      });
    }
    if (!keepPartialOnAbort) await removePartial(dirParts, fileName);
    const wrap = err instanceof Error ? err : new Error(String(err));
    /** @type {any} */ (wrap).keepPartial = keepPartialOnAbort;
    throw wrap;
  }

  if (total != null && loaded < total) {
    const err = new Error("Incomplete download");
    /** @type {any} */ (err).keepPartial = true;
    throw err;
  }

  return finalizePartial(dirParts, fileName, loaded);
}

/**
 * Full overwrite convenience (covers / art).
 * @param {string[]} dirParts
 * @param {string} fileName
 * @param {Response} response
 * @param {(loaded: number, total: number | null) => void} [onProgress]
 */
export async function writeFromResponse(dirParts, fileName, response, onProgress) {
  return writeResponseToFile(dirParts, fileName, response, {
    startOffset: 0,
    onProgress,
    keepPartialOnAbort: false,
  });
}

/**
 * @param {string[]} dirParts
 * @param {string} fileName
 * @returns {Promise<Blob | null>}
 */
export async function readBinary(dirParts, fileName) {
  if (!(await hasOpfs())) return null;
  try {
    const dir = await getDir(dirParts, { create: false });
    const handle = await dir.getFileHandle(fileName, { create: false });
    return await handle.getFile();
  } catch {
    return null;
  }
}

/**
 * @param {string[]} dirParts
 * @param {string} fileName
 */
export async function deleteBinary(dirParts, fileName) {
  if (!(await hasOpfs())) return;
  await removeFile(dirParts, fileName);
  await removeFile(dirParts, partialName(fileName));
}

export function audioDirParts() {
  return [AUDIO_DIR];
}

export function albumCoverDirParts() {
  return [COVERS_DIR, ALBUMS_DIR];
}

export function artistCoverDirParts() {
  return [COVERS_DIR, ARTISTS_DIR];
}

export function audioFileName(trackId, codec, ext) {
  return `${trackId}.${codec}.${ext}`;
}

export function albumCoverFileName(albumId, size) {
  return `${albumId}.${size}.webp`;
}

export function artistCoverFileName(artistId, size) {
  return `${artistId}.${size}.webp`;
}

export async function wipeOpfsDownloads() {
  if (!(await hasOpfs())) return;
  try {
    const root = await navigator.storage.getDirectory();
    for (const name of [AUDIO_DIR, COVERS_DIR]) {
      try {
        await root.removeEntry(name, { recursive: true });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}
