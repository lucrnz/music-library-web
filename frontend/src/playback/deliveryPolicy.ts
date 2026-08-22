/**
 * Exclusive-aware sink + profile. playIntent / prepare / settings do not
 * import isExclusiveEnabled — they consume this builder.
 */
import type { Track } from "@/models/track";
import type { PlaySink } from "@/playback/playIntent";
import {
  getExclusiveProfileTag,
  isExclusiveEnabled,
} from "@/stores/exclusiveAudio";
import { getActiveStreamCodec } from "@/stores/settings";

export interface DeliveryPolicy {
  sink: PlaySink;
  profileFor: (track: Track | null | undefined) => string | null;
}

export function activeDelivery(): DeliveryPolicy {
  if (isExclusiveEnabled()) {
    return {
      sink: "companion",
      profileFor: (track) => getExclusiveProfileTag(track),
    };
  }
  return {
    sink: "htmlAudio",
    profileFor: () => getActiveStreamCodec(),
  };
}
