/**
 * Mirror of musicweb.exclusive.protocol (Python). Keep in sync.
 * @see src/musicweb/exclusive/protocol.py
 */

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 18765;
export const HEARTBEAT_INTERVAL_MS = 5000;
export const CONTROLLER_TTL_S = 15;

/** Client → server */
export const MSG_HELLO = "hello";
export const MSG_HEARTBEAT = "heartbeat";
export const MSG_LIST_DEVICES = "list_devices";
export const MSG_SET_DEVICE = "set_device";
export const MSG_LOAD = "load";
export const MSG_PLAY = "play";
export const MSG_PAUSE = "pause";
export const MSG_RESUME = "resume";
export const MSG_SEEK = "seek";
export const MSG_STOP = "stop";
export const MSG_SET_VOLUME = "set_volume";

/** Server → client */
export const MSG_HELLO_OK = "hello_ok";
export const MSG_HELLO_REJECT = "hello_reject";
export const MSG_STATUS = "status";
export const MSG_DEVICES = "devices";
export const MSG_TIME = "time";
export const MSG_PAUSE_EVENT = "pause";
export const MSG_EOF = "eof";
export const MSG_ERROR = "error";

export const ROLE_CONTROLLER = "controller";
export const ROLE_READONLY = "readonly";

/**
 * @param {string} type
 * @param {Record<string, unknown>} [fields]
 */
export function envelope(type, fields = {}) {
  return { v: PROTOCOL_VERSION, type, ...fields };
}
