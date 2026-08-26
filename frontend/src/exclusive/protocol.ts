/**
 * Mirror of musicweb.exclusive.protocol (Python). Keep in sync.
 * @see src/musicweb/exclusive/protocol.py
 */

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 18765;
export const HEARTBEAT_INTERVAL_MS = 5000;
/** Idle un-hog after this many seconds with no inbound traffic and nothing loaded. */
export const CONTROLLER_TTL_S = 60;

/** Client → server */
export const MSG_HELLO = "hello";
export const MSG_HEARTBEAT = "heartbeat";
export const MSG_LIST_DEVICES = "list_devices";
export const MSG_SET_DEVICE = "set_device";
export const MSG_LOAD = "load";
export const MSG_PAUSE = "pause";
export const MSG_RESUME = "resume";
export const MSG_SEEK = "seek";
export const MSG_STOP = "stop";
export const MSG_SET_VOLUME = "set_volume";
export const MSG_BLOB_PUT = "blob_put";
export const MSG_BLOB_ABORT = "blob_abort";
export const MSG_BLOB_DELETE = "blob_delete";
export const MSG_BLOB_STAT = "blob_stat";
export const MSG_DISK_INFO = "disk_info";

/** Server → client */
export const MSG_HELLO_OK = "hello_ok";
export const MSG_HELLO_REJECT = "hello_reject";
export const MSG_STATUS = "status";
export const MSG_DEVICES = "devices";
export const MSG_TIME = "time";
export const MSG_PAUSE_EVENT = "pause";
export const MSG_EOF = "eof";
export const MSG_ERROR = "error";
export const MSG_BLOB_PROGRESS = "blob_progress";
export const MSG_BLOB_DONE = "blob_done";
export const MSG_BLOB_ERROR = "blob_error";
export const MSG_BLOB_STAT_OK = "blob_stat_ok";
export const MSG_DISK_INFO_OK = "disk_info_ok";

export const ROLE_CONTROLLER = "controller";
export const ROLE_READONLY = "readonly";

export function envelope(
  type: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return { v: PROTOCOL_VERSION, type, ...fields };
}
