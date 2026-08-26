import { describe, expect, it } from "vitest";
import {
  MSG_BLOB_PUT,
  MSG_DISK_INFO_OK,
  MSG_RELEASE_DEVICE,
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
});
