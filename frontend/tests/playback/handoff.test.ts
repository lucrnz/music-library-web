import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  become,
  onLeaveCd,
  onLeaveQueue,
  onLeaveRadio,
} from "@/playback/session";

describe("session become", () => {
  beforeEach(() => {
    onLeaveRadio(null);
    onLeaveQueue(null);
    become("none");
  });

  it("leaving radio for queue runs leave-radio only", () => {
    const leaveRadio = vi.fn();
    const leaveQueue = vi.fn();
    onLeaveRadio(leaveRadio);
    onLeaveQueue(leaveQueue);
    become("radio");
    become("queue");
    expect(leaveRadio).toHaveBeenCalledOnce();
    expect(leaveQueue).not.toHaveBeenCalled();
    onLeaveRadio(null);
    onLeaveQueue(null);
  });

  it("leaving queue for radio runs leave-queue only", () => {
    const leaveRadio = vi.fn();
    const leaveQueue = vi.fn();
    onLeaveRadio(leaveRadio);
    onLeaveQueue(leaveQueue);
    become("queue");
    become("radio");
    expect(leaveQueue).toHaveBeenCalledOnce();
    expect(leaveRadio).not.toHaveBeenCalled();
    onLeaveRadio(null);
    onLeaveQueue(null);
  });

  it("leaving cd for queue does not rewrite playlist storage", () => {
    localStorage.setItem("musicweb.playlist.v1", '{"tracks":[{"id":"keep"}]}');
    const leaveCd = vi.fn();
    onLeaveCd(leaveCd);
    become("cd");
    become("queue");
    expect(leaveCd).toHaveBeenCalledOnce();
    expect(localStorage.getItem("musicweb.playlist.v1")).toContain("keep");
    onLeaveCd(null);
  });

  it("leaving cd for queue runs leave-cd only", () => {
    const leaveCd = vi.fn();
    const leaveQueue = vi.fn();
    onLeaveCd(leaveCd);
    onLeaveQueue(leaveQueue);
    become("cd");
    become("queue");
    expect(leaveCd).toHaveBeenCalledOnce();
    expect(leaveQueue).not.toHaveBeenCalled();
    onLeaveCd(null);
    onLeaveQueue(null);
  });

  it("becoming cd does not restore queue media session", () => {
    const leaveQueue = vi.fn();
    onLeaveQueue(leaveQueue);
    become("queue");
    become("cd");
    expect(leaveQueue).toHaveBeenCalledOnce();
    onLeaveQueue(null);
  });

  it("same session is a no-op", () => {
    const leaveQueue = vi.fn();
    onLeaveQueue(leaveQueue);
    become("queue");
    become("queue");
    expect(leaveQueue).not.toHaveBeenCalled();
    onLeaveQueue(null);
  });
});
