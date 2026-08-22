/**
 * Pure exclusive format picker. Never invents tags outside the server catalog.
 */

export interface ExclusiveFormat {
  tag: string;
  sample_rate: number;
  bit_depth: number;
  label?: string;
}

export type SourceTech = {
  sampleRateHz: number | null;
  bitDepth: number | null;
} | null;

export type DeviceCaps = {
  sample_rates?: number[];
  bit_depths?: number[];
} | null;

export type FormatMode = "prefer_source" | "upsample_device";

export interface PickExclusiveProfileOpts {
  source: SourceTech;
  deviceCaps: DeviceCaps;
  mode: FormatMode;
  formats: ExclusiveFormat[];
}

function deviceSupported(
  formats: ExclusiveFormat[],
  deviceCaps: DeviceCaps,
): ExclusiveFormat[] {
  if (!formats?.length) return [];
  const rates = new Set(
    deviceCaps?.sample_rates || [],
  );
  const depths = new Set(
    deviceCaps?.bit_depths || [],
  );
  // Empty caps → treat as no support (hard-fail upstream), not full allowlist.
  if (!rates.size || !depths.size) return [];
  return formats.filter(
    (f) => rates.has(f.sample_rate) && depths.has(f.bit_depth),
  );
}

/** Sort key: higher rate, then higher depth. */
function byQualityDesc(a: ExclusiveFormat, b: ExclusiveFormat): number {
  if (b.sample_rate !== a.sample_rate) return b.sample_rate - a.sample_rate;
  return b.bit_depth - a.bit_depth;
}

/**
 * Pick exclusive profile tag from server catalog ∩ device caps.
 * Returns tag or null when no supported format.
 */
export function pickExclusiveProfileTag(
  opts: PickExclusiveProfileOpts,
): string | null {
  const formats = Array.isArray(opts.formats) ? opts.formats : [];
  const allowed = deviceSupported(formats, opts.deviceCaps || null);
  if (!allowed.length) return null;

  const mode =
    opts.mode === "upsample_device" ? "upsample_device" : "prefer_source";
  if (mode === "upsample_device") {
    return allowed.slice().sort(byQualityDesc)[0].tag;
  }

  const srcRate = opts.source?.sampleRateHz ?? null;
  const srcDepth = opts.source?.bitDepth ?? null;

  // Null source → same as device max / upsample.
  if (srcRate == null || srcDepth == null) {
    return allowed.slice().sort(byQualityDesc)[0].tag;
  }

  // Exact match
  const exact = allowed.find(
    (f) => f.sample_rate === srcRate && f.bit_depth === srcDepth,
  );
  if (exact) return exact.tag;

  // Nearest lower-or-equal rate; keep source bit depth when possible.
  const le = allowed
    .filter((f) => f.sample_rate <= srcRate)
    .slice()
    .sort((a, b) => {
      if (b.sample_rate !== a.sample_rate) return b.sample_rate - a.sample_rate;
      // Prefer matching depth; avoid pointless 16→24.
      const aDepthScore =
        a.bit_depth === srcDepth ? 2 : a.bit_depth < srcDepth ? 1 : 0;
      const bDepthScore =
        b.bit_depth === srcDepth ? 2 : b.bit_depth < srcDepth ? 1 : 0;
      if (bDepthScore !== aDepthScore) return bDepthScore - aDepthScore;
      // Prefer lower depth when neither matches (no up-depth).
      return a.bit_depth - b.bit_depth;
    });
  if (le.length) return le[0].tag;

  // Source rate below all device rates? Pick lowest rate, depth policy as above.
  const lowest = allowed.slice().sort((a, b) => {
    if (a.sample_rate !== b.sample_rate) return a.sample_rate - b.sample_rate;
    const aDepthScore =
      a.bit_depth === srcDepth ? 2 : a.bit_depth < srcDepth ? 1 : 0;
    const bDepthScore =
      b.bit_depth === srcDepth ? 2 : b.bit_depth < srcDepth ? 1 : 0;
    if (bDepthScore !== aDepthScore) return bDepthScore - aDepthScore;
    return a.bit_depth - b.bit_depth;
  });
  return lowest[0]?.tag ?? null;
}
