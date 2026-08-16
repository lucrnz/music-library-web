/**
 * Desktop layout breakpoint for new JS. Same query as desktop.css / player copies.
 */
import { onMounted, onUnmounted, ref, type Ref } from "vue";

export const DESKTOP_MEDIA = "(min-width: 900px)";

export function isDesktopViewport(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(DESKTOP_MEDIA).matches;
}

/** Reactive `min-width: 900px` bit. Call only from setup(). */
export function useDesktopViewport(): Ref<boolean> {
  const desktop = ref(isDesktopViewport());
  let mql: MediaQueryList | null = null;

  function onChange(): void {
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
