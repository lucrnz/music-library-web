/**
 * Effective library location from route, holding last library when on /queue.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import { ui } from "../../stores/ui.js";

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

  const mode = computed(() => libLoc.value.meta?.mode || "folders");
  const isSearch = computed(() => mode.value === "search");
  const folderPath = computed(() => {
    const q = libLoc.value.query || {};
    return mode.value === "folders" && q.path ? String(q.path) : "";
  });
  const routeName = computed(() => libLoc.value.name);
  const artistId = computed(() => libLoc.value.params?.artistId);
  const albumId = computed(() => libLoc.value.params?.albumId);

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
