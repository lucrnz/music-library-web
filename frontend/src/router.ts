import { defineComponent } from "vue";
import { createRouter, createWebHistory } from "vue-router";

/**
 * Library routes share the App shell; components read $route via useRoute().
 * No router-view — a stub component satisfies vue-router's API.
 * Folder path lives in query (?path=) to avoid encoding issues with FS paths.
 * Must be defineComponent, not `() => null`: vue-router treats a bare function
 * as an async component factory and calls `.then` on the result.
 */
const Shell = defineComponent({ name: "RouteShell", setup: () => () => null });

const routes = [
  { path: "/", redirect: "/folders" },
  {
    path: "/folders",
    name: "folders",
    component: Shell,
    meta: { mode: "folders", pane: "library", title: "Folders" },
  },
  {
    path: "/artists",
    name: "artists",
    component: Shell,
    meta: { mode: "artists", pane: "library", title: "Artists" },
  },
  {
    path: "/artists/:artistId",
    name: "artist",
    component: Shell,
    meta: { mode: "artists", pane: "library" },
  },
  {
    path: "/albums",
    name: "albums",
    component: Shell,
    meta: { mode: "albums", pane: "library", title: "Albums" },
  },
  {
    path: "/albums/:albumId",
    name: "album",
    component: Shell,
    meta: { mode: "albums", pane: "library" },
  },
  {
    path: "/search",
    name: "search",
    component: Shell,
    meta: { mode: "search", pane: "library", title: "Search" },
  },
  {
    path: "/downloads",
    name: "downloads",
    component: Shell,
    meta: { mode: "downloads", pane: "library", title: "Downloads" },
  },
  {
    path: "/downloads/artists/:artistId",
    name: "downloads-artist",
    component: Shell,
    meta: { mode: "downloads", pane: "library" },
  },
  {
    path: "/downloads/albums/:albumId",
    name: "downloads-album",
    component: Shell,
    meta: { mode: "downloads", pane: "library" },
  },
  {
    path: "/queue",
    name: "queue",
    component: Shell,
    meta: { pane: "queue", title: "Queue" },
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
