/**
 * Single list/grid/tree layout machine for library + downloads panes.
 * Owns layout transition + tree-route coerce; views only load data.
 */
import { watch } from "vue";
import { ui } from "../../stores/ui.js";
import { getTreeSession } from "../tree/treeSession.js";
import {
  handleLayoutTransition,
  handleTreeRoute,
  libraryMode,
} from "../tree/treeNavigation.js";

/**
 * @param {object} opts
 * @param {import('vue-router').Router} opts.router
 * @param {import('vue-router').RouteLocationNormalizedLoaded} opts.route
 * @param {() => boolean} opts.isActivePane - false when wrong pane
 * @param {() => boolean} opts.isTreeActive - tree layout applies for this pane
 * @param {() => void} opts.onNavigate - after layout/route settles, reload content
 * @param {(() => void)=} opts.onBeforeLoad - e.g. sync search query
 * @param {boolean=} opts.coldStartOnSetup - downloads: cold-start in setup
 */
export function useBrowseLayout(opts) {
  const {
    router,
    route,
    isActivePane,
    isTreeActive,
    onNavigate,
    onBeforeLoad,
    coldStartOnSetup = false,
  } = opts;

  /** @type {string|null} */
  let prevTreeMode = null;

  /**
   * @param {{ name: string, params?: object, query?: object } | null} loc
   */
  function replaceRoute(loc) {
    if (!loc) return;
    router.replace({
      name: loc.name,
      params: loc.params || {},
      query: loc.query || {},
    });
  }

  /**
   * @param {{
   *   prevLayout: string,
   *   nextLayout: string,
   *   isColdStart?: boolean,
   * }} args
   */
  function applyLayoutTransition({ prevLayout, nextLayout, isColdStart = false }) {
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
    }
  );

  /**
   * Watch route (and optional extra deps). Tree coerce then load.
   * @param {() => unknown} source
   * @param {{ immediate?: boolean }} [watchOpts]
   */
  function watchNavigation(source, watchOpts = {}) {
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
      watchOpts
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
