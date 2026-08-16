/**
 * Single list/grid/tree layout machine for library + downloads panes.
 * Owns layout transition + tree-route coerce; views only load data.
 */
import { watch } from "vue";
import type { RouteLocationNormalizedLoaded, Router } from "vue-router";
import { ui } from "@/stores/ui";
import { getTreeSession } from "@/components/tree/treeSession";
import {
  handleLayoutTransition,
  handleTreeRoute,
  libraryMode,
} from "@/components/tree/treeNavigation";

export interface BrowseRouteLoc {
  name: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export interface BrowseLayoutOpts {
  router: Router;
  route: RouteLocationNormalizedLoaded;
  isActivePane: () => boolean;
  isTreeActive: () => boolean;
  onNavigate: () => void;
  onBeforeLoad?: () => void;
  coldStartOnSetup?: boolean;
}

export function useBrowseLayout(opts: BrowseLayoutOpts) {
  const {
    router,
    route,
    isActivePane,
    isTreeActive,
    onNavigate,
    onBeforeLoad,
    coldStartOnSetup = false,
  } = opts;

  let prevTreeMode: string | null = null;

  function replaceRoute(loc: BrowseRouteLoc | null | undefined) {
    if (!loc) return;
    router.replace({
      name: loc.name,
      params: loc.params || {},
      query: loc.query || {},
    });
  }

  function applyLayoutTransition({
    prevLayout,
    nextLayout,
    isColdStart = false,
  }: {
    prevLayout: string;
    nextLayout: string;
    isColdStart?: boolean;
  }) {
    if (!isActivePane()) return;
    const result = handleLayoutTransition({
      prevLayout,
      nextLayout,
      route,
      isColdStart,
    });
    if (result.restoreSnapshot) {
      const s = result.restoreSnapshot;
      replaceRoute({
        name: s.name,
        params: s.params,
        query: s.query,
      });
      prevTreeMode = null;
      return result;
    }
    if (result.replaceTo) replaceRoute(result.replaceTo);
    if (nextLayout === "tree") {
      prevTreeMode = libraryMode(route);
    } else if (!isColdStart) {
      prevTreeMode = null;
    }
    return result;
  }

  /**
   * Tree coerce while layout is tree. Returns true if navigation was replaced
   * (caller should not load yet).
   */
  function processTreeRoute() {
    if (!isActivePane() || !isTreeActive()) return false;
    const r = handleTreeRoute({
      route,
      prevMode: prevTreeMode,
    });
    if (r.collapseScope) {
      getTreeSession(r.collapseScope).collapseAll();
    }
    if (r.replaceTo) {
      prevTreeMode = libraryMode(route);
      replaceRoute(r.replaceTo);
      return true;
    }
    prevTreeMode = libraryMode(route);
    return false;
  }

  function coldStartTree() {
    if (ui.libraryLayout !== "tree" || !isActivePane()) return;
    applyLayoutTransition({
      prevLayout: "tree",
      nextLayout: "tree",
      isColdStart: true,
    });
    prevTreeMode = libraryMode(route);
  }

  watch(
    () => ui.libraryLayout,
    (next, prev) => {
      if (next === prev) return;
      if (!isActivePane()) return;
      applyLayoutTransition({
        prevLayout: prev,
        nextLayout: next,
        isColdStart: false,
      });
    },
  );

  /**
   * Watch route (and optional extra deps). Tree coerce then load.
   */
  function watchNavigation(
    source: () => unknown,
    watchOpts: { immediate?: boolean } = {},
  ) {
    watch(
      source,
      () => {
        if (!isActivePane()) {
          onNavigate();
          return;
        }
        if (processTreeRoute()) return;
        if (onBeforeLoad) onBeforeLoad();
        onNavigate();
      },
      watchOpts,
    );
  }

  if (coldStartOnSetup) {
    coldStartTree();
  }

  return {
    replaceRoute,
    coldStartTree,
    processTreeRoute,
    watchNavigation,
    getPrevTreeMode: () => prevTreeMode,
  };
}
