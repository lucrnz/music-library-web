import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  become,
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

  it("same session is a no-op", () => {
    const leaveQueue = vi.fn();
    onLeaveQueue(leaveQueue);
    become("queue");
    become("queue");
    expect(leaveQueue).not.toHaveBeenCalled();
    onLeaveQueue(null);
  });
});
