/** Last COMPANION_TOKEN probe on this page. Not persisted. */
export type TokenCheck =
  | "idle"
  | "checking"
  | "accepted"
  | "invalid"
  | "unreachable";

export function tokenCheckReason(check: TokenCheck): string {
  switch (check) {
    case "checking":
      return "Checking token…";
    case "accepted":
      return "Token accepted";
    case "invalid":
      return "Invalid token";
    case "unreachable":
      return "Companion not reachable";
    default:
      return "";
  }
}

export function tokenCheckTone(check: TokenCheck): "ok" | "bad" | "neutral" {
  if (check === "accepted") return "ok";
  if (check === "invalid" || check === "unreachable") return "bad";
  return "neutral";
}
