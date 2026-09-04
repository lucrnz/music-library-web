<script setup lang="ts">
import { computed, ref } from "vue";
import {
  cdromTree,
  listingOf,
  sortCdromFiles,
  trackFromCdromFile,
  type CdromFileNode,
} from "@/cd/cdrom";
import { cdromAdd, cdromAddFolder, cdromPlayAll, cdromPlayOrQueue } from "@/cd/cdromQueue";
import { cd } from "@/stores/cd";
import { ui } from "@/stores/ui";
import { listCdrom } from "@/exclusive/opticalClient";
import Icon from "@/components/icons/Icon.vue";
import ActionMenu from "@/components/menu/ActionMenu.vue";
import { isDesktopContextMenu } from "@/components/menu/rowActionMenu";
import { useRowActionMenu } from "@/components/menu/useRowActionMenu";
import type { ActionItem, MenuAnchor } from "@/components/menu/actionItem";
import CdRomFileRow from "@/components/cd/CdRomFileRow.vue";
import CdRomFolderRow from "@/components/cd/CdRomFolderRow.vue";
import {
  buildCdromFileMenuItems,
  buildCdromFolderMenuItems,
} from "@/components/cd/cdromMenuItems";
import { parentRel, type CdRomTreeNode } from "@/components/cd/cdromTree";

const { menuAnchor, menuRestoreEl, closeMenu, openMenu } = useRowActionMenu();
const menuItems = ref<ActionItem[]>([]);
const expanded = ref<Set<string>>(new Set([""]));

const layout = computed(() => ui.libraryLayout);
const listing = computed(() => listingOf(cdromTree.cwd));
const folderTitle = computed(() => {
  if (layout.value === "tree" || !cdromTree.cwd) return cd.volumeName || "Data CD";
  return cdromTree.cwd.slice(cdromTree.cwd.lastIndexOf("/") + 1);
});
const actionRel = computed(() => (layout.value === "tree" ? "" : cdromTree.cwd));
const canBack = computed(() => !!cdromTree.cwd);
const fsEmpty = computed(
  () => listing.value.dirs.length === 0 && listing.value.files.length === 0,
);
const emptyCopy = computed(() =>
  cdromTree.mounted ? "Nothing here" : "Loading…",
);

function goInto(rel: string) {
  cdromTree.cwd = rel;
  if (!cdromTree.folders.has(rel)) listCdrom(rel, cd.selectedDriveId);
}

function goBack() {
  if (!cdromTree.cwd) return;
  goInto(parentRel(cdromTree.cwd));
}

function onFileClick(file: CdromFileNode) {
  cdromPlayOrQueue(trackFromCdromFile(file));
}

function openFileMenu(file: CdromFileNode, e: MouseEvent) {
  menuItems.value = buildCdromFileMenuItems({
    add: () => cdromAdd(trackFromCdromFile(file)),
  });
  openAt(e);
}

function openFolderMenu(rel: string, e: MouseEvent) {
  menuItems.value = buildCdromFolderMenuItems({
    addAll: () => cdromAddFolder(rel),
    playAll: () => cdromPlayAll(rel),
  });
  openAt(e);
}

function openAt(e: MouseEvent) {
  const el = e.currentTarget;
  const anchor: MenuAnchor =
    el instanceof HTMLElement ? { kind: "el", el } : { kind: "point", x: e.clientX, y: e.clientY };
  openMenu(anchor, el instanceof HTMLElement ? el : null);
}

function onFileContext(file: CdromFileNode, e: MouseEvent) {
  if (!isDesktopContextMenu()) return;
  e.preventDefault();
  openFileMenu(file, e);
}

function onFolderContext(rel: string, e: MouseEvent) {
  if (!isDesktopContextMenu()) return;
  e.preventDefault();
  openFolderMenu(rel, e);
}

const treeRoots = computed((): CdRomTreeNode[] => buildTree(""));

function buildTree(rel: string): CdRomTreeNode[] {
  const list = listingOf(rel);
  const folders: CdRomTreeNode[] = list.dirs.map((d) => ({
    kind: "folder" as const,
    id: `folder:${d.rel}`,
    name: d.name,
    rel: d.rel,
    children: buildTree(d.rel),
  }));
  const files: CdRomTreeNode[] = sortCdromFiles(list.files).map((f) => ({
    kind: "file" as const,
    id: `file:${f.rel}`,
    name: f.name,
    rel: f.rel,
    file: f,
  }));
  return folders.concat(files);
}

function toggleExpand(rel: string) {
  const next = new Set(expanded.value);
  if (next.has(rel)) next.delete(rel);
  else {
    next.add(rel);
    if (!cdromTree.folders.has(rel)) listCdrom(rel, cd.selectedDriveId);
  }
  expanded.value = next;
}

const visibleTree = computed((): Array<{ node: CdRomTreeNode; depth: number }> => {
  const out: Array<{ node: CdRomTreeNode; depth: number }> = [];
  const walk = (nodes: CdRomTreeNode[], depth: number) => {
    for (const node of nodes) {
      out.push({ node, depth });
      if (node.kind === "folder" && expanded.value.has(node.rel)) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(treeRoots.value, 0);
  return out;
});
</script>

<template>
  <section class="cdrom-fs" aria-label="Disc files">
    <div class="cdrom-fs-bar">
      <button
        v-if="layout !== 'tree' && canBack"
        type="button"
        class="pill"
        aria-label="Back"
        @click="goBack"
      >Back</button>
      <div class="cdrom-fs-title">{{ folderTitle }}</div>
      <button type="button" class="pill" @click="cdromAddFolder(actionRel)">
        Add all
      </button>
      <button
        type="button"
        class="icon-btn"
        title="Folder actions"
        aria-label="Folder actions"
        @click="(e) => openFolderMenu(actionRel, e)"
      ><Icon name="more-vert" /></button>
    </div>
    <div v-if="layout === 'tree'" class="cdrom-tree">
      <div v-if="!treeRoots.length" class="list-empty">{{ emptyCopy }}</div>
      <div
        v-for="row in visibleTree"
        :key="row.node.id"
        class="cdrom-tree-row"
        :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
        @contextmenu="
          row.node.kind === 'file'
            ? onFileContext(row.node.file, $event)
            : onFolderContext(row.node.rel, $event)
        "
      >
        <button
          v-if="row.node.kind === 'folder'"
          type="button"
          class="cdrom-tree-toggle"
          @click="toggleExpand(row.node.rel)"
        >{{ expanded.has(row.node.rel) ? "▾" : "▸" }}</button>
        <div
          v-if="row.node.kind === 'folder'"
          class="cdrom-tree-hit"
          @click="toggleExpand(row.node.rel)"
        >
          <CdRomFolderRow :name="row.node.name" />
        </div>
        <div
          v-else
          class="cdrom-tree-hit"
          @click="onFileClick(row.node.file)"
        >
          <CdRomFileRow :file="row.node.file" />
        </div>
        <button
          type="button"
          class="icon-btn"
          aria-label="Actions"
          @click="
            row.node.kind === 'file'
              ? openFileMenu(row.node.file, $event)
              : openFolderMenu(row.node.rel, $event)
          "
        ><Icon name="more-vert" /></button>
      </div>
    </div>
    <div v-else class="cdrom-fs-list" :class="layout">
      <div v-if="fsEmpty" class="list-empty">{{ emptyCopy }}</div>
      <div
        v-for="dir in listing.dirs"
        :key="'d-' + dir.rel"
        class="cdrom-cell"
        @click="goInto(dir.rel)"
        @contextmenu="onFolderContext(dir.rel, $event)"
      >
        <CdRomFolderRow :name="dir.name" />
        <button
          type="button"
          class="icon-btn cdrom-cell-more"
          aria-label="Folder actions"
          @click.stop="openFolderMenu(dir.rel, $event)"
        ><Icon name="more-vert" /></button>
      </div>
      <div
        v-for="file in listing.files"
        :key="'f-' + file.rel"
        class="cdrom-cell"
        @click="onFileClick(file)"
        @contextmenu="onFileContext(file, $event)"
      >
        <CdRomFileRow :file="file" />
        <button
          type="button"
          class="icon-btn cdrom-cell-more"
          aria-label="File actions"
          @click.stop="openFileMenu(file, $event)"
        ><Icon name="more-vert" /></button>
      </div>
    </div>
    <ActionMenu
      :open="menuItems.length > 0 && !!menuAnchor"
      :items="menuItems"
      :anchor="menuAnchor"
      :restore-el="menuRestoreEl"
      @close="closeMenu(); menuItems = []"
    />
  </section>
</template>
