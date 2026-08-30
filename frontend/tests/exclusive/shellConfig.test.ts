import { describe, expect, it } from "vitest";
import { parseShellConfigJson } from "@/shellConfig";

describe("parseShellConfigJson", () => {
  it("reads both keys", () => {
    expect(
      parseShellConfigJson('{"publicOrigin":"http://127.0.0.1:8765","devUnlockPwa":true}'),
    ).toEqual({
      publicOrigin: "http://127.0.0.1:8765",
      devUnlockPwa: true,
    });
  });

  it("defaults missing or invalid keys safely", () => {
    expect(parseShellConfigJson("{}")).toEqual({
      publicOrigin: "",
      devUnlockPwa: false,
    });
    expect(parseShellConfigJson('{"devUnlockPwa":"true"}')).toEqual({
      publicOrigin: "",
      devUnlockPwa: false,
    });
    expect(parseShellConfigJson("not-json")).toEqual({
      publicOrigin: "",
      devUnlockPwa: false,
    });
    expect(parseShellConfigJson("null")).toEqual({
      publicOrigin: "",
      devUnlockPwa: false,
    });
  });
});
