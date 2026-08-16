/**
 * Effective library location from route, holding last library when on /queue.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import { ui } from "@/stores/ui";

function firstParam(params: unknown, key: string): string | undefined {
  if (!params || typeof params !== "object") return undefined;
  const v = (params as Record<string, unknown>)[key];
  if (v == null || v === "") return undefined;
  const raw = Array.isArray(v) ? v[0] : v;
  if (raw == null || raw === "") return undefined;
  return String(raw);
}

export function useLibraryLocation() {
  const route = useRoute();

  const libLoc = computed(() => {
    if (route.meta.pane === "queue") return ui.lastLibrary;
    return {
      name: route.name,
      params: route.params,
      query: route.query,
      meta: route.meta,
    };
  });

  const mode = computed(() => String(libLoc.value.meta?.mode || "folders"));
  const isSearch = computed(() => mode.value === "search");
  const folderPath = computed(() => {
    const q = libLoc.value.query || {};
    const path = (q as { path?: unknown }).path;
    return mode.value === "folders" && path ? String(path) : "";
  });
  const routeName = computed(() => libLoc.value.name);
  const artistId = computed(() => firstParam(libLoc.value.params, "artistId"));
  const albumId = computed(() => firstParam(libLoc.value.params, "albumId"));

  return {
    route,
    libLoc,
    mode,
    isSearch,
    folderPath,
    routeName,
    artistId,
    albumId,
  };
}
