/** Parsed `#musicweb-config` blob injected by the library server. */

export type ShellConfig = {
  publicOrigin: string;
  devUnlockPwa: boolean;
};

const DEFAULT_CONFIG: ShellConfig = {
  publicOrigin: "",
  devUnlockPwa: false,
};

export function parseShellConfigJson(raw: string): ShellConfig {
  try {
    const data: unknown = JSON.parse(raw || "{}");
    if (!data || typeof data !== "object") return { ...DEFAULT_CONFIG };
    const rec = data as { publicOrigin?: unknown; devUnlockPwa?: unknown };
    return {
      publicOrigin:
        typeof rec.publicOrigin === "string" ? rec.publicOrigin.trim() : "",
      devUnlockPwa: rec.devUnlockPwa === true,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function readShellConfig(): ShellConfig {
  if (typeof document === "undefined") return { ...DEFAULT_CONFIG };
  const el = document.getElementById("musicweb-config");
  if (!el) return { ...DEFAULT_CONFIG };
  return parseShellConfigJson(el.textContent || "{}");
}
