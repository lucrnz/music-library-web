/**
 * Single navigation model for library browse modes.
 * stack items: { kind, name, id?, path? }
 */

/** @type {'folders'|'artists'|'albums'|'search'} */
export let mode = "folders";

/** @type {{ kind: string, name: string, id?: string, path?: string }[]} */
export let stack = [];

export function setMode(next) {
  mode = next;
  stack = [];
}

export function push(entry) {
  stack = [...stack, entry];
}

export function pop() {
  if (!stack.length) return null;
  const top = stack[stack.length - 1];
  stack = stack.slice(0, -1);
  return top;
}

export function peek() {
  return stack.length ? stack[stack.length - 1] : null;
}

export function clear() {
  stack = [];
}

export function depth() {
  return stack.length;
}
