import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeWS {
  static instances: FakeWS[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = FakeWS.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { target: FakeWS }) => void) | null = null;
  sent: string[] = [];
  closeCalls = 0;

  constructor(public url: string) {
    FakeWS.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWS.CLOSED;
    this.closeCalls += 1;
    this.onclose?.({ target: this });
  }
}

vi.stubGlobal("WebSocket", FakeWS);

vi.mock("@/api", () => ({
  apiGet: vi.fn(),
}));
vi.mock("@/diag/log", () => ({ emit: vi.fn() }));
vi.mock("@/exclusive/capability", () => ({
  canUseCompanionDownloads: () => true,
  canShowCdUi: () => false,
}));
vi.mock("@/downloads/state", () => ({
  downloads: { enabled: true },
}));
vi.mock("@/stores/playerPrefs", () => ({
  setOutputVolume: vi.fn(),
}));
vi.mock("@/stores/playerState", () => ({
  player: { volume: 1 },
}));

import {
  disconnectCompanion,
  syncCompanionConnection,
  syncPreferredDevice,
} from "@/exclusive/companionClient";
import { MSG_RELEASE_DEVICE, MSG_SET_DEVICE } from "@/exclusive/protocol";
import { exclusiveAudio, setExclusiveEnabled } from "@/stores/exclusiveAudio";

function lastOfType(socket: FakeWS, type: string): Record<string, unknown> | undefined {
  for (let i = socket.sent.length - 1; i >= 0; i--) {
    const msg = JSON.parse(socket.sent[i]) as Record<string, unknown>;
    if (msg.type === type) return msg;
  }
  return undefined;
}

function openController(): FakeWS {
  exclusiveAudio.capable = true;
  exclusiveAudio.enabled = true;
  exclusiveAudio.companionToken = "secret";
  exclusiveAudio.sessionId = "s1";
  exclusiveAudio.selectedDeviceId = "dev-1";
  exclusiveAudio.companionDeviceId = null;
  exclusiveAudio.role = null;
  exclusiveAudio.connection = "disconnected";
  exclusiveAudio.devices = [
    { id: "dev-1", name: "Out", sample_rates: [44100], bit_depths: [16] },
  ];
  syncCompanionConnection();
  const socket = FakeWS.instances.at(-1);
  if (!socket) throw new Error("no websocket");
  socket.readyState = FakeWS.OPEN;
  socket.onopen?.();
  socket.onmessage?.({
    data: JSON.stringify({
      v: 1,
      type: "hello_ok",
      role: "controller",
      selected_device_id: "dev-1",
    }),
  });
  return socket;
}

describe("exclusive disable releases hog", () => {
  beforeEach(() => {
    FakeWS.instances = [];
  });

  afterEach(() => {
    disconnectCompanion();
    exclusiveAudio.capable = false;
    exclusiveAudio.enabled = false;
    exclusiveAudio.companionToken = "";
    exclusiveAudio.sessionId = "";
    exclusiveAudio.selectedDeviceId = null;
    exclusiveAudio.companionDeviceId = null;
    exclusiveAudio.role = null;
    exclusiveAudio.connection = "disconnected";
    exclusiveAudio.devices = [];
  });

  it("sends release_device and keeps the downloads socket", () => {
    const socket = openController();
    const sentBefore = socket.sent.length;
    setExclusiveEnabled(false);
    syncCompanionConnection();
    expect(socket.closeCalls).toBe(0);
    expect(socket.readyState).toBe(FakeWS.OPEN);
    expect(lastOfType(socket, MSG_RELEASE_DEVICE)).toBeTruthy();
    expect(socket.sent.length).toBeGreaterThan(sentBefore);
    expect(exclusiveAudio.companionDeviceId).toBeNull();
    expect(exclusiveAudio.role).toBe("controller");
    expect(exclusiveAudio.connection).toBe("connected");
  });

  it("does not re-arm the device while exclusive is off", () => {
    const socket = openController();
    setExclusiveEnabled(false);
    syncCompanionConnection();
    const afterRelease = socket.sent.length;
    expect(syncPreferredDevice()).toBe(false);
    expect(socket.sent.length).toBe(afterRelease);
    expect(lastOfType(socket, MSG_SET_DEVICE)).toBeUndefined();
  });

  it("re-arms the preferred device when exclusive is turned back on", () => {
    const socket = openController();
    setExclusiveEnabled(false);
    syncCompanionConnection();
    expect(exclusiveAudio.companionDeviceId).toBeNull();
    setExclusiveEnabled(true);
    syncCompanionConnection();
    expect(lastOfType(socket, MSG_SET_DEVICE)).toMatchObject({
      type: MSG_SET_DEVICE,
      deviceId: "dev-1",
    });
    expect(socket.closeCalls).toBe(0);
  });
});
