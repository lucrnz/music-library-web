import { beforeEach, describe, expect, it } from "vitest";
import {
  concurrencyLabel,
  DOWNLOAD_CONCURRENCY_KEY,
  loadDownloadConcurrency,
  parseDownloadConcurrency,
  saveDownloadConcurrency,
  selectActiveToKeep,
} from "@/downloads/concurrency";
import { setDownloadConcurrency } from "@/downloads/index";
import { downloads } from "@/downloads/state";

describe("parseDownloadConcurrency", () => {
  it("accepts allowed decimal strings and rejects the rest", () => {
    expect(parseDownloadConcurrency("4")).toBe(4);
    expect(parseDownloadConcurrency("1")).toBe(1);
    expect(parseDownloadConcurrency(null)).toBe(2);
    expect(parseDownloadConcurrency("3")).toBe(2);
    expect(parseDownloadConcurrency("")).toBe(2);
  });
});

describe("load/save download concurrency", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips an allowed value", () => {
    saveDownloadConcurrency(8);
    expect(localStorage.getItem(DOWNLOAD_CONCURRENCY_KEY)).toBe("8");
    expect(loadDownloadConcurrency()).toBe(8);
  });

  it("loads 8 from a stored key and defaults garbage or missing", () => {
    localStorage.setItem(DOWNLOAD_CONCURRENCY_KEY, "8");
    expect(loadDownloadConcurrency()).toBe(8);
    localStorage.setItem(DOWNLOAD_CONCURRENCY_KEY, "nope");
    expect(loadDownloadConcurrency()).toBe(2);
    localStorage.removeItem(DOWNLOAD_CONCURRENCY_KEY);
    expect(loadDownloadConcurrency()).toBe(2);
  });
});

describe("setDownloadConcurrency", () => {
  beforeEach(() => {
    localStorage.clear();
    downloads.concurrency = 2;
  });

  it("persists an allowed value and rejects others", () => {
    expect(setDownloadConcurrency(4)).toBe(true);
    expect(localStorage.getItem(DOWNLOAD_CONCURRENCY_KEY)).toBe("4");
    expect(downloads.concurrency).toBe(4);
    expect(setDownloadConcurrency(3)).toBe(false);
    expect(localStorage.getItem(DOWNLOAD_CONCURRENCY_KEY)).toBe("4");
    expect(setDownloadConcurrency(4)).toBe(false);
  });
});

describe("concurrencyLabel", () => {
  it("labels sequential and numeric caps", () => {
    expect(concurrencyLabel(1)).toBe("Sequential (1)");
    expect(concurrencyLabel(2)).toBe("2");
  });
});

describe("selectActiveToKeep", () => {
  it("keeps the two highest loaded when limit is 2", () => {
    expect(
      selectActiveToKeep(
        [
          { id: 1, loaded: 10, addedAt: 1 },
          { id: 2, loaded: 50, addedAt: 2 },
          { id: 3, loaded: 30, addedAt: 3 },
        ],
        2,
      ),
    ).toEqual([2, 3]);
  });

  it("breaks a loaded tie with earlier addedAt", () => {
    expect(
      selectActiveToKeep(
        [
          { id: 1, loaded: 40, addedAt: 20 },
          { id: 2, loaded: 40, addedAt: 10 },
        ],
        1,
      ),
    ).toEqual([2]);
  });

  it("breaks a remaining tie with lower id", () => {
    expect(
      selectActiveToKeep(
        [
          { id: 9, loaded: 40, addedAt: 10 },
          { id: 3, loaded: 40, addedAt: 10 },
        ],
        1,
      ),
    ).toEqual([3]);
  });

  it("returns every id when limit is larger than the list", () => {
    expect(
      selectActiveToKeep(
        [
          { id: 1, loaded: 1, addedAt: 1 },
          { id: 2, loaded: 2, addedAt: 2 },
        ],
        8,
      ),
    ).toEqual([2, 1]);
  });

  it("returns none when limit is not positive", () => {
    expect(
      selectActiveToKeep([{ id: 1, loaded: 1, addedAt: 1 }], 0),
    ).toEqual([]);
  });
});
