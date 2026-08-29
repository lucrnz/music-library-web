import { describe, expect, it } from "vitest";

import {
  LISTEN_SEEK_EPSILON_SECONDS,
  LISTEN_THRESHOLD,
  createListenCycle,
} from "@/listens/accumulator";

function cycle(overrides?: {
  durationSec?: number | null;
  playSource?: string;
  origin?: "queue" | "radio" | "cd";
  trackId?: string;
}) {
  return createListenCycle({
    trackId: overrides?.trackId ?? "t1",
    durationSec: overrides?.durationSec === undefined ? 100 : overrides.durationSec,
    profile: "source",
    playSource: overrides?.playSource ?? "streaming",
    origin: overrides?.origin ?? "queue",
  });
}

function play(cycleApi: ReturnType<typeof createListenCycle>, from: number, to: number, step = 0.5) {
  let fired = null;
  for (let t = from; t <= to + 1e-9; t += step) {
    const event = cycleApi.onTime({ currentTime: t, duration: null, playing: true });
    if (event && !fired) fired = event;
  }
  return fired;
}

describe("createListenCycle", () => {
  it("exports the named constants", () => {
    expect(LISTEN_SEEK_EPSILON_SECONDS).toBe(2);
    expect(LISTEN_THRESHOLD).toBe(0.65);
  });

  it("fires once after 65% of playing samples and not again", () => {
    const c = cycle({ durationSec: 100 });
    expect(play(c, 0, 64)).toBeNull();
    const event = play(c, 64.5, 65);
    expect(event).toMatchObject({
      trackId: "t1",
      profile: "source",
      playSource: "streaming",
      origin: "queue",
    });
    expect(play(c, 65.5, 80)).toBeNull();
    expect(c.onEnded()).toBeNull();
  });

  it("does not add paused samples", () => {
    const c = cycle({ durationSec: 10 });
    c.onTime({ currentTime: 0, duration: 10, playing: true });
    for (let t = 1; t <= 10; t += 1) {
      expect(c.onTime({ currentTime: t, duration: 10, playing: false })).toBeNull();
    }
    expect(c.onEnded()).toBeNull();
  });

  it("does not add a forward seek larger than the epsilon", () => {
    const c = cycle({ durationSec: 10 });
    c.onTime({ currentTime: 0, duration: 10, playing: true });
    expect(c.onTime({ currentTime: 3, duration: 10, playing: true })).toBeNull();
    expect(c.onEnded()).toBeNull();
  });

  it("does not add or subtract on seek-back", () => {
    const c = cycle({ durationSec: 10 });
    c.onTime({ currentTime: 0, duration: 10, playing: true });
    c.onTime({ currentTime: 1, duration: 10, playing: true });
    c.onTime({ currentTime: 0.2, duration: 10, playing: true });
    expect(c.onEnded()).toBeNull();
    expect(play(c, 0.2, 7.2)).not.toBeNull();
  });

  it("adds nothing on the first sample", () => {
    const c = cycle({ durationSec: 10 });
    expect(c.onTime({ currentTime: 8, duration: 10, playing: true })).toBeNull();
    expect(c.onEnded()).toBeNull();
  });

  it("treats 0 and NaN duration as unknown so onEnded fires", () => {
    for (const durationSec of [0, Number.NaN]) {
      const c = cycle({ durationSec });
      c.onTime({ currentTime: 0, duration: durationSec, playing: true });
      const event = c.onEnded();
      expect(event?.trackId).toBe("t1");
    }
  });

  it("adopts a later finite duration instead of ending-as-unknown", () => {
    const c = cycle({ durationSec: 0 });
    c.onTime({ currentTime: 0, duration: 0, playing: true });
    expect(play(c, 0.5, 7)).toBeNull();
    expect(
      c.onTime({ currentTime: 7.5, duration: 10, playing: true }),
    ).not.toBeNull();
    expect(c.onEnded()).toBeNull();
  });

  it("onEnded is null when duration is known and below 65%", () => {
    const c = cycle({ durationSec: 10 });
    c.onTime({ currentTime: 0, duration: 10, playing: true });
    c.onTime({ currentTime: 5, duration: 10, playing: true });
    expect(c.onEnded()).toBeNull();
  });

  it("uses sink duration when the tag duration was missing", () => {
    const c = cycle({ durationSec: null });
    c.onTime({ currentTime: 0, duration: null, playing: true });
    expect(c.onTime({ currentTime: 1, duration: 10, playing: true })).toBeNull();
    expect(play(c, 1.5, 7.5)).not.toBeNull();
  });

  it("onRestart after a fire allows a second event", () => {
    const c = cycle({ durationSec: 10 });
    const first = play(c, 0, 7.5);
    expect(first).not.toBeNull();
    expect(c.onRestart()).toBeNull();
    const second = play(c, 0, 7.5);
    expect(second).not.toBeNull();
    expect(second!.id).not.toBe(first!.id);
  });

  it("copies origin radio through on fire", () => {
    const c = cycle({ durationSec: 10, origin: "radio" });
    expect(play(c, 0, 7.5)).toMatchObject({ origin: "radio" });
  });

  it("fires at 65% for cd origin and play source", () => {
    const c = cycle({ durationSec: 10, playSource: "cd", origin: "cd" });
    expect(play(c, 0, 7.5)).toMatchObject({
      playSource: "cd",
      origin: "cd",
    });
  });

  it("does not fire for sentinel cd:unknown ids", () => {
    const c = cycle({
      durationSec: 10,
      playSource: "cd",
      origin: "cd",
      trackId: "cd:unknown:1",
    });
    expect(play(c, 0, 10)).toBeNull();
    expect(c.onEnded()).toBeNull();
  });

  it("never fires when playSource is none", () => {
    const c = cycle({ durationSec: 10, playSource: "none" });
    expect(play(c, 0, 10)).toBeNull();
    expect(c.onEnded()).toBeNull();
    const unknown = cycle({ durationSec: null, playSource: "none" });
    expect(unknown.onEnded()).toBeNull();
  });

  it("sets a parseable UTC countedAt and a new id per fire", () => {
    const c = cycle({ durationSec: 10 });
    const first = play(c, 0, 7.5);
    c.onRestart();
    const second = play(c, 0, 7.5);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(Number.isNaN(Date.parse(first!.countedAt))).toBe(false);
    expect(first!.countedAt.includes("Z") || first!.countedAt.includes("+")).toBe(
      true,
    );
    expect(first!.id).not.toBe(second!.id);
  });
});
