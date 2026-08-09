/**
 * Shared callbacks so browse modules can navigate without circular imports.
 */

/** @type {() => Promise<void>} */
export let renderLibrary = async () => {};

/** @type {(seq: number) => boolean} */
export let isCurrent = () => true;

/**
 * @param {{ renderLibrary: () => Promise<void>, isCurrent: (seq: number) => boolean }} deps
 */
export function bind(deps) {
  renderLibrary = deps.renderLibrary;
  isCurrent = deps.isCurrent;
}
