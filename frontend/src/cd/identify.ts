import type {
  CdApplied,
  CdIdentifyResponse,
  CdTextPayload,
  IdentifyDecision,
} from "@/cd/types";

export function decideIdentify(input: {
  memory: CdApplied | null;
  identify: CdIdentifyResponse | null;
  cdText: CdTextPayload | null;
}): IdentifyDecision {
  const applied = input.identify?.applied;
  if (applied && applied.tracks.length) {
    return { kind: "apply_memory", dto: applied };
  }
  if (input.memory && input.memory.tracks.length) {
    return { kind: "apply_memory", dto: input.memory };
  }
  const matches = input.identify?.matches || [];
  if (matches.length === 1) {
    return { kind: "confirm_unique", match: matches[0] };
  }
  if (matches.length > 1) {
    return { kind: "open_picker", matches };
  }
  if (input.cdText && (input.cdText.album || input.cdText.tracks.some(Boolean))) {
    return { kind: "cdtext" };
  }
  return { kind: "unknown" };
}

export function unknownTrackId(trackNo: number): string {
  return `cd:unknown:${trackNo}`;
}

export function isUnknownCdId(id: string | null | undefined): boolean {
  return !!id && id.startsWith("cd:unknown:");
}
