import { beforeEach } from "vitest";

class MemoryStorage implements Storage {
  #map = new Map<string, string>();

  get length(): number {
    return this.#map.size;
  }

  clear(): void {
    this.#map.clear();
  }

  getItem(key: string): string | null {
    return this.#map.has(key) ? this.#map.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this.#map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#map.set(key, String(value));
  }
}

const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorage,
  configurable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: sessionStorage,
  configurable: true,
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
