/**
 * Desktop layout breakpoint for new JS. Same query as desktop.css / player copies.
 */
import { onMounted, onUnmounted, ref } from "vue";

export const DESKTOP_MEDIA = "(min-width: 900px)";

export function isDesktopViewport() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(DESKTOP_MEDIA).matches;
}

/**
 * Reactive `min-width: 900px` bit. Call only from setup().
 * @returns {import("vue").Ref<boolean>}
 */
export function useDesktopViewport() {
  const desktop = ref(isDesktopViewport());
  /** @type {MediaQueryList|null} */
  let mql = null;

  function onChange() {
    desktop.value = !!mql?.matches;
  }

  onMounted(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    mql = window.matchMedia(DESKTOP_MEDIA);
    desktop.value = mql.matches;
    mql.addEventListener("change", onChange);
  });

  onUnmounted(() => {
    if (mql) mql.removeEventListener("change", onChange);
    mql = null;
  });

  return desktop;
}
