import { describe, expect, it } from "vitest";
import {
  MSG_BLOB_PUT,
  MSG_DISK_INFO_OK,
  MSG_EJECT_OPTICAL,
  MSG_LIST_OPTICAL_DRIVES,
  MSG_OPTICAL_DRIVES,
  MSG_OPTICAL_ERROR,
  MSG_OPTICAL_MEDIA,
  MSG_READ_OPTICAL,
  MSG_RELEASE_DEVICE,
  MSG_WATCH_OPTICAL,
  PROTOCOL_VERSION,
  envelope,
} from "@/exclusive/protocol";

describe("exclusive protocol envelope", () => {
  it("includes type and version", () => {
    const body = envelope("hello", { token: "t" });
    expect(body.type).toBe("hello");
    expect(body.v).toBe(PROTOCOL_VERSION);
    expect(body.token).toBe("t");
  });

  it("blob types are non-empty and version stays 1", () => {
    expect(MSG_BLOB_PUT).toBe("blob_put");
    expect(MSG_DISK_INFO_OK).toBe("disk_info_ok");
    expect(MSG_RELEASE_DEVICE).toBe("release_device");
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it("optical type strings match the companion protocol", () => {
    expect(MSG_LIST_OPTICAL_DRIVES).toBe("list_optical_drives");
    expect(MSG_WATCH_OPTICAL).toBe("watch_optical");
    expect(MSG_READ_OPTICAL).toBe("read_optical");
    expect(MSG_EJECT_OPTICAL).toBe("eject_optical");
    expect(MSG_OPTICAL_DRIVES).toBe("optical_drives");
    expect(MSG_OPTICAL_MEDIA).toBe("optical_media");
    expect(MSG_OPTICAL_ERROR).toBe("optical_error");
    expect(envelope(MSG_LIST_OPTICAL_DRIVES).type).toBe("list_optical_drives");
  });
});
