import { PlayBlockError } from "@/playBlock";

export function cdTrackUrl(
  port: number,
  token: string,
  deviceId: string,
  trackNo: number,
): string {
  if (!port || !token.trim() || !deviceId || !trackNo) {
    throw new PlayBlockError("cd_not_ready");
  }
  const url = new URL(`/cdda/${trackNo}`, `http://127.0.0.1:${port}`);
  url.searchParams.set("device", deviceId);
  url.searchParams.set("token", token);
  return url.href;
}

export function cdromFileUrl(
  port: number,
  token: string,
  deviceId: string,
  rel: string,
): string {
  if (!port || !token.trim() || !deviceId || !rel) {
    throw new PlayBlockError("cd_not_ready");
  }
  const url = new URL("/cdrom/file", `http://127.0.0.1:${port}`);
  url.searchParams.set("device", deviceId);
  url.searchParams.set("rel", rel);
  url.searchParams.set("token", token);
  return url.href;
}
