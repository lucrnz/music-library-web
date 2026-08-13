/**
 * @typedef {object} SinkHandlers
 * @property {(t: number, d: number) => void} [onTime]
 * @property {(d: number) => void} [onDuration]
 * @property {() => void} [onEnded]
 * @property {(message: string, code?: string | null) => void} [onError]
 * @property {(paused: boolean) => void} [onPauseState]
 */

/**
 * @typedef {object} PlaybackSink
 * @property {'htmlAudio' | 'companion'} kind
 * @property {(h: SinkHandlers) => void} setHandlers
 * @property {(url: string) => Promise<void>} load
 * @property {() => void} pause
 * @property {() => void | Promise<void>} resume
 * @property {() => void} stop
 * @property {(seconds: number) => void} seek
 * @property {(v0to1: number) => void} setVolume
 * @property {boolean} paused
 * @property {number} currentTime
 * @property {number} duration
 * @property {number} [playbackRate]
 */

export {};
