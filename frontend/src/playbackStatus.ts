/**
 * Format delivery play-source state for the now-playing status line and
 * Playback details deep dive. Pure helpers — catalog is passed in by callers.
 */

import type { ExclusiveFormat } from "@/exclusive/formatPolicy";
import {
  formatExclusiveFace,
  type ExclusiveFaceSnapshot,
} from "@/exclusive/statusFace";
import {
  LOSSY_SOURCE_COPY,
  formatLossyCodecText,
  lossySourceParts,
} from "@/lossyKind";
import {
  playBlockMessage,
  type PlayBlockReason,
  type PlaySourceState,
} from "@/playBlock";
import type { Track } from "@/models/track";
import { resolveProfileMeta, type ProfileMeta } from "@/qualityRank";

export type { ProfileMeta };

const KNOWN_BITRATE_MODES = new Set(["cbr", "vbr", "abr"]);

export interface PlayStatusState {
  playSource: PlaySourceState;
  playProfileId?: string | null;
  playBlockReason?: PlayBlockReason | string | null;
  track?: Pick<
    Track,
    "isLossy" | "sourceCodec" | "bitrateKbps" | "sampleRateHz" | "bitrateMode"
  > | null;
}

export interface PlaybackDetailRow {
  key: string;
  label: string;
  value: string;
}

export interface PlaybackStatusFace {
  interactive: boolean;
  text: string;
  icon: string | null;
}

export interface PlaybackDetailsOpts {
  exclusiveSnap?: ExclusiveFaceSnapshot | null;
  exclusiveFormats?: Array<ProfileMeta | ExclusiveFormat>;
}

/**
 * Normalize exclusive-formats entry or browser codec option to ProfileMeta.
 */
function resolveAnyProfile(
  profileId: string | null | undefined,
  catalog: ProfileMeta[] = [],
  exclusiveFormats: Array<ProfileMeta | ExclusiveFormat> = [],
): ProfileMeta | null {
  if (!profileId) return null;
  const fromEx = exclusiveFormats.find((f) => {
    if ("tag" in f && f.tag === profileId) return true;
    return "id" in f && f.id === profileId;
  });
  if (fromEx) {
    return {
      id: fromEx.tag || ("id" in fromEx ? fromEx.id : undefined) || profileId,
      label: fromEx.label,
      kind: "flac",
      bit_depth: fromEx.bit_depth,
      sample_rate: fromEx.sample_rate,
      bitrate_kbps: 0,
    };
  }
  return resolveProfileMeta(profileId, catalog);
}

export function formatPrimaryCodecText(
  profileId: string | null | undefined,
  catalog: ProfileMeta[] = [],
): string | null {
  if (!profileId) return null;
  const meta = resolveProfileMeta(profileId, catalog);
  if (!meta) return null;
  const kind = (meta.kind || "").toLowerCase();
  if (kind === "opus") {
    const br = Number(meta.bitrate_kbps) || 0;
    return br > 0 ? `Opus ${br}k` : "Opus";
  }
  if (kind === "flac") return "FLAC";
  if (kind) return kind.charAt(0).toUpperCase() + kind.slice(1);
  return null;
}

/** Source word for active delivery (not unavailable/none). */
export function formatSourceWord(playSource: PlaySourceState): string | null {
  if (playSource === "streaming") return "Streaming";
  if (playSource === "downloaded") return "Downloaded";
  return null;
}

/** Icon sprite name for active source, or null. */
export function sourceIconName(playSource: PlaySourceState): string | null {
  if (playSource === "streaming") return "source-stream";
  if (playSource === "downloaded") return "source-downloaded";
  return null;
}

/**
 * Primary status-line face text (without icon).
 * When exclusive is enabled, exclusive face always wins (never Streaming·codec).
 */
export function formatPrimaryStatus(
  state: PlayStatusState,
  catalog: ProfileMeta[] = [],
  exclusiveSnap: ExclusiveFaceSnapshot | null = null,
): PlaybackStatusFace {
  if (exclusiveSnap?.enabled) {
    const face = formatExclusiveFace(exclusiveSnap);
    if (face) {
      return {
        interactive: face.interactive,
        text: face.text,
        icon: face.icon,
      };
    }
  }

  const playSource = state?.playSource || "none";
  if (playSource === "none") {
    return { interactive: false, text: "Not playing", icon: null };
  }
  if (playSource === "unavailable") {
    return { interactive: true, text: "Unavailable", icon: null };
  }
  const word = formatSourceWord(playSource);
  const codec = state.track?.isLossy
    ? formatLossyCodecText(state.track)
    : formatPrimaryCodecText(state.playProfileId, catalog);
  const text = word && codec ? `${word} · ${codec}` : word || codec || "—";
  return {
    interactive: true,
    text,
    icon: sourceIconName(playSource),
  };
}

/** Accessible name for the status control. */
export function formatStatusAriaLabel(
  state: PlayStatusState,
  catalog: ProfileMeta[] = [],
  exclusiveSnap: ExclusiveFaceSnapshot | null = null,
): string {
  const face = formatPrimaryStatus(state, catalog, exclusiveSnap);
  if (!face.interactive) return face.text;
  if (!exclusiveSnap?.enabled && state.playSource === "unavailable") {
    return "Unavailable, playback details";
  }
  return `${face.text}, playback details`;
}

function formatSampleRate(hz: number | null | undefined): string | null {
  const n = Number(hz);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1000) {
    const k = n / 1000;
    const s = Number.isInteger(k) ? String(k) : k.toFixed(1).replace(/\.0$/, "");
    return `${s} kHz`;
  }
  return `${n} Hz`;
}

export function buildPlaybackDetailsRows(
  state: PlayStatusState,
  catalog: ProfileMeta[] = [],
  opts: PlaybackDetailsOpts = {},
): PlaybackDetailRow[] {
  const exclusiveSnap = opts.exclusiveSnap || null;
  const exclusiveFormats = opts.exclusiveFormats || [];
  const exclusiveOn = !!exclusiveSnap?.enabled;

  const playSource = state?.playSource || "none";

  if (exclusiveOn && exclusiveSnap) {
    const rows: PlaybackDetailRow[] = [];
    rows.push({ key: "output", label: "Output", value: "Exclusive" });

    const live = exclusiveSnap.liveId;
    const pref = exclusiveSnap.preferenceId;
    const devices = exclusiveSnap.devices || [];
    const deviceId = live || pref;
    if (deviceId) {
      const hit = devices.find((d) => d.id === deviceId);
      rows.push({
        key: "device",
        label: "Device",
        value: (hit && hit.name) || deviceId,
      });
    } else {
      rows.push({
        key: "device",
        label: "Device",
        value: "Not selected",
      });
    }

    if (exclusiveSnap.role === "readonly") {
      rows.push({
        key: "role",
        label: "Control",
        value: "Controlled elsewhere",
      });
    }

    if (playSource === "unavailable" || playSource === "none") {
      const reasonKey = state.playBlockReason || "";
      const reason =
        playBlockMessage(reasonKey) || (reasonKey ? String(reasonKey) : null);
      if (reason) {
        rows.push({ key: "reason", label: "Reason", value: reason });
      }
    }

    if (state.playProfileId) {
      const meta = resolveAnyProfile(
        state.playProfileId,
        catalog,
        exclusiveFormats,
      );
      const profileLabel = (meta && meta.label) || state.playProfileId;
      rows.push({
        key: "profile",
        label: "Profile",
        value: profileLabel,
      });
      if (meta) {
        const depth = Number(meta.bit_depth) || 0;
        if (depth > 0) {
          rows.push({
            key: "bit_depth",
            label: "Bit depth",
            value: `${depth}-bit`,
          });
        }
        const rate = formatSampleRate(meta.sample_rate);
        if (rate) {
          rows.push({
            key: "sample_rate",
            label: "Sample rate",
            value: rate,
          });
        }
      }
    }

    return rows;
  }

  if (playSource === "none") return [];

  const rows: PlaybackDetailRow[] = [];

  if (playSource === "unavailable") {
    rows.push({ key: "source", label: "Source", value: "Unavailable" });
    const reasonKey = state.playBlockReason || "";
    const reason =
      playBlockMessage(reasonKey) || (reasonKey ? String(reasonKey) : null);
    if (reason) {
      rows.push({ key: "reason", label: "Reason", value: reason });
    }
    if (state.playProfileId) {
      const meta = resolveProfileMeta(state.playProfileId, catalog);
      const profileLabel = (meta && meta.label) || state.playProfileId;
      rows.push({
        key: "profile",
        label: "Intended profile",
        value: profileLabel,
      });
    }
    return rows;
  }

  const sourceWord = formatSourceWord(playSource);
  if (sourceWord) {
    rows.push({ key: "source", label: "Source", value: sourceWord });
  }

  if (state.track?.isLossy) {
    const parts = lossySourceParts(state.track);
    if (parts.label) {
      rows.push({ key: "codec", label: "Codec", value: parts.label });
    }
    if (parts.bitrateKbps > 0) {
      rows.push({
        key: "bitrate",
        label: "Bitrate",
        value: `${parts.bitrateKbps} kbps`,
      });
    }
    const mode = (state.track.bitrateMode || "").toLowerCase();
    if (KNOWN_BITRATE_MODES.has(mode)) {
      rows.push({
        key: "encoding",
        label: "Encoding",
        value: mode.toUpperCase(),
      });
    }
    const fileRate = formatSampleRate(state.track.sampleRateHz);
    if (fileRate) {
      rows.push({
        key: "sample_rate",
        label: "Sample rate",
        value: fileRate,
      });
    }
    rows.push({
      key: "lossy",
      label: "Source file",
      value: LOSSY_SOURCE_COPY,
    });
    return rows;
  }

  if (!state.playProfileId) return rows;

  const meta = resolveProfileMeta(state.playProfileId, catalog);
  if (!meta) return rows;

  const kind = (meta.kind || "").toLowerCase();
  if (kind === "opus") {
    rows.push({ key: "codec", label: "Codec", value: "Opus" });
    const br = Number(meta.bitrate_kbps) || 0;
    if (br > 0) {
      rows.push({
        key: "bitrate",
        label: "Bitrate",
        value: `${br} kbps`,
      });
    }
  } else if (kind === "flac") {
    rows.push({ key: "codec", label: "Codec", value: "FLAC" });
    const depth = Number(meta.bit_depth) || 0;
    if (depth > 0) {
      rows.push({
        key: "bit_depth",
        label: "Bit depth",
        value: `${depth}-bit`,
      });
    }
  } else if (kind) {
    rows.push({
      key: "codec",
      label: "Codec",
      value: kind.charAt(0).toUpperCase() + kind.slice(1),
    });
  }

  const rate = formatSampleRate(meta.sample_rate);
  if (rate) {
    rows.push({ key: "sample_rate", label: "Sample rate", value: rate });
  }

  const profileLabel = meta.label || state.playProfileId;
  if (profileLabel) {
    rows.push({ key: "profile", label: "Profile", value: profileLabel });
  }

  return rows;
}
