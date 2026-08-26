import { afterEach, describe, expect, it, vi } from "vitest";

class FakeWS {
  static instances: FakeWS[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  closeCalls = 0;

  constructor(public url: string) {
    FakeWS.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.closeCalls += 1;
    this.onclose?.();
  }
}

vi.stubGlobal("WebSocket", FakeWS);

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
}));
vi.mock("@/diag/log", () => ({ emit: vi.fn() }));
vi.mock("@/exclusive/capability", () => ({
  canUseCompanionDownloads: () => false,
}));
vi.mock("@/downloads/state", () => ({
  downloads: { enabled: false },
}));

import { checkCompanionToken } from "@/exclusive/companionClient";
import { exclusiveAudio } from "@/stores/exclusiveAudio";

describe("checkCompanionToken probe", () => {
  afterEach(() => {
    FakeWS.instances = [];
    exclusiveAudio.companionToken = "";
    exclusiveAudio.capable = false;
    exclusiveAudio.enabled = false;
    exclusiveAudio.connection = "disconnected";
    exclusiveAudio.tokenCheck = "idle";
  });

  it("paints accepted and hangs up when hello_ok and no feature wants a socket", () => {
    exclusiveAudio.companionToken = "secret";
    checkCompanionToken();
    expect(exclusiveAudio.tokenCheck).toBe("checking");
    expect(exclusiveAudio.connection).toBe("disconnected");
    const socket = FakeWS.instances.at(-1);
    expect(socket?.url).toBe("ws://127.0.0.1:18765/ws");
    socket?.onopen?.();
    expect(socket?.sent[0]).toContain("hello");
    socket?.onmessage?.({
      data: JSON.stringify({ type: "hello_ok", role: "controller" }),
    });
    expect(exclusiveAudio.tokenCheck).toBe("accepted");
    expect(exclusiveAudio.connection).toBe("disconnected");
    expect(socket?.closeCalls).toBeGreaterThan(0);
  });

  it("paints invalid on hello_reject invalid_token", () => {
    exclusiveAudio.companionToken = "nope";
    checkCompanionToken();
    const socket = FakeWS.instances.at(-1);
    socket?.onopen?.();
    socket?.onmessage?.({
      data: JSON.stringify({
        type: "hello_reject",
        reason: "invalid_token",
      }),
    });
    expect(exclusiveAudio.tokenCheck).toBe("invalid");
    expect(exclusiveAudio.connection).toBe("disconnected");
  });

  it("paints unreachable when the socket closes without hello", () => {
    exclusiveAudio.companionToken = "secret";
    checkCompanionToken();
    FakeWS.instances.at(-1)?.onclose?.();
    expect(exclusiveAudio.tokenCheck).toBe("unreachable");
  });
});
