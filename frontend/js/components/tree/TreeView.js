/**
 * Shared recursive tree: expand/lazy, visible-nodes, WAI-ARIA keyboard.
 */
import {
  computed,
  defineComponent,
  nextTick,
  ref,
  watch,
} from "vue";
import LossyMark from "../lossy/LossyMark.js";
import Icon from "../icons/Icon.js";
import { flattenVisible } from "./flattenVisible.js";

export default defineComponent({
  name: "TreeView",
  components: { Icon, LossyMark },
  props: {
    roots: { type: Array, default: () => [] },
    /** createTreeSession() instance */
    session: { type: Object, required: true },
    /**
     * (node) => Promise<node[]>
     * @type {import('vue').PropType<(node: object) => Promise<object[]>>}
     */
    loadChildren: { type: Function, required: true },
    loading: { type: Boolean, default: false },
    error: { type: String, default: "" },
    emptyMessage: { type: String, default: "Nothing here" },
    /**
     * Optional: (node) => VNode props for group actions — use slots instead.
     */
  },
  emits: ["activate-leaf", "toggle"],
  setup(props, { emit, slots, expose }) {
    const treeEl = ref(/** @type {HTMLElement|null} */ (null));
    const focusIndex = ref(0);
    /** bump to recompute visible after session mutations */
    const tick = ref(0);

    function keyOf(node) {
      return String(node.key);
    }
    function isLeafOf(node) {
      return !!node.isLeaf;
    }

    const visible = computed(() => {
      tick.value;
      return flattenVisible(
        props.roots,
        (k) => props.session.isExpanded(k),
        (k) => props.session.getChildren(k),
        keyOf,
        isLeafOf
      );
    });

    function bump() {
      tick.value += 1;
    }

    /**
     * @param {object} node
     */
    async function ensureNodeChildren(node) {
      if (node.isLeaf) return [];
      if (Array.isArray(node.children)) {
        props.session.primeChildren(node.key, node.children);
        return node.children;
      }
      return props.session.ensureChildren(node.key, () =>
        props.loadChildren(node)
      );
    }

    /**
     * @param {object} node
     */
    async function toggle(node) {
      if (node.isLeaf) return;
      const key = node.key;
      const willExpand = !props.session.isExpanded(key);
      props.session.setExpanded(key, willExpand);
      bump();
      emit("toggle", node, willExpand);
      if (willExpand) {
        try {
          await ensureNodeChildren(node);
        } catch {
          /* error in session entry */
        }
        bump();
      }
    }

    /**
     * @param {object} node
     */
    async function retry(node) {
      try {
        await props.session.retryChildren(node.key, () =>
          props.loadChildren(node)
        );
      } catch {
        /* shown inline */
      }
      bump();
    }

    /**
     * Expand a path of keys (auto-focus). Scroll last into view.
     * @param {string[]} keys
     * @param {(key: string) => object|null} findNode
     */
    async function expandPath(keys, findNode) {
      if (!keys?.length) return;
      let lastEl = null;
      for (const key of keys) {
        const node = findNode(key);
        if (!node || node.isLeaf) continue;
        props.session.setExpanded(key, true);
        try {
          await ensureNodeChildren(node);
        } catch {
          break;
        }
        bump();
      }
      await nextTick();
      const idx = visible.value.findIndex((v) => v.key === keys[keys.length - 1]);
      if (idx >= 0) {
        focusIndex.value = idx;
        lastEl = treeEl.value?.querySelector(`[data-tree-key="${CSS.escape(keys[keys.length - 1])}"]`);
        lastEl?.scrollIntoView({ block: "nearest" });
      }
    }

    function activateLeaf(node) {
      emit("activate-leaf", node);
    }

    function onRowClick(vn, e) {
      if (e.target.closest(".tree-actions") || e.target.closest(".tree-retry")) {
        return;
      }
      // Leaf rows host interactive TrackRow/FileRow — they handle click/play.
      if (vn.isLeaf) return;
      toggle(vn.node);
    }

    function onKeydown(e) {
      const list = visible.value;
      if (!list.length) return;
      const max = list.length - 1;
      let i = focusIndex.value;
      if (i < 0 || i > max) i = 0;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusIndex.value = Math.min(max, i + 1);
        focusRow();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        focusIndex.value = Math.max(0, i - 1);
        focusRow();
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        focusIndex.value = 0;
        focusRow();
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        focusIndex.value = max;
        focusRow();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const vn = list[i];
        if (!vn) return;
        if (!vn.isLeaf && !props.session.isExpanded(vn.key)) {
          toggle(vn.node);
          return;
        }
        if (!vn.isLeaf && props.session.isExpanded(vn.key)) {
          const child = list[i + 1];
          if (child && child.parentKey === vn.key) {
            focusIndex.value = i + 1;
            focusRow();
          }
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const vn = list[i];
        if (!vn) return;
        if (!vn.isLeaf && props.session.isExpanded(vn.key)) {
          props.session.setExpanded(vn.key, false);
          bump();
          return;
        }
        if (vn.parentKey) {
          const pi = list.findIndex((x) => x.key === vn.parentKey);
          if (pi >= 0) {
            focusIndex.value = pi;
            focusRow();
          }
        }
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const vn = list[i];
        if (!vn) return;
        if (vn.isLeaf) activateLeaf(vn.node);
        else toggle(vn.node);
      }
    }

    function focusRow() {
      nextTick(() => {
        const list = visible.value;
        const vn = list[focusIndex.value];
        if (!vn) return;
        const el = treeEl.value?.querySelector(
          `[data-tree-key="${CSS.escape(vn.key)}"]`
        );
        if (el && typeof el.focus === "function") el.focus();
      });
    }

    watch(
      () => props.roots,
      () => {
        focusIndex.value = 0;
        bump();
      }
    );

    expose({ expandPath, bump, visible });

    return {
      treeEl,
      visible,
      focusIndex,
      slots,
      toggle,
      retry,
      onRowClick,
      onKeydown,
      activateLeaf,
      ensureNodeChildren,
    };
  },
  template: `
    <div class="tree-host">
      <div v-if="loading" class="list-empty">Loading…</div>
      <div v-else-if="error" class="list-empty error">{{ error }}</div>
      <div v-else-if="!roots.length" class="list-empty">{{ emptyMessage }}</div>
      <div
        v-else
        ref="treeEl"
        class="tree"
        role="tree"
        tabindex="0"
        @keydown="onKeydown"
      >
        <div
          v-for="(vn, i) in visible"
          :key="vn.key"
          class="tree-row"
          :class="{
            'is-leaf': vn.isLeaf,
            'is-focused': focusIndex === i,
          }"
          :style="{ '--tree-depth': vn.depth }"
          role="treeitem"
          :aria-expanded="vn.isLeaf ? undefined : (session.isExpanded(vn.key) ? 'true' : 'false')"
          :aria-level="vn.depth + 1"
          :data-tree-key="vn.key"
          tabindex="-1"
          @click="onRowClick(vn, $event)"
          @focus="focusIndex = i"
        >
          <template v-if="!vn.isLeaf">
            <button
              type="button"
              class="tree-toggle"
              :class="{ collapsed: !session.isExpanded(vn.key) }"
              :aria-expanded="session.isExpanded(vn.key) ? 'true' : 'false'"
              :title="session.isExpanded(vn.key) ? 'Collapse' : 'Expand'"
              tabindex="-1"
              @click.stop="toggle(vn.node)"
            >
              <Icon name="chevron-down" />
            </button>
            <button type="button" class="tree-label" tabindex="-1">
              <span v-if="vn.node.cover !== undefined" class="row-cover-wrap">
                <img
                  v-if="vn.node.cover"
                  class="row-cover"
                  :src="vn.node.cover"
                  alt=""
                  loading="lazy"
                />
                <span v-else class="row-icon"><Icon name="folder" /></span>
              </span>
              <span class="row-meta">
                <span class="row-title">{{ vn.node.title }}</span>
                <span v-if="vn.node.subtitle" class="row-sub">{{ vn.node.subtitle }}</span>
              </span>
            </button>
            <LossyMark :kind="vn.node.lossyKind" />
            <span class="tree-actions" @click.stop>
              <slot name="group-actions" :node="vn.node" />
            </span>
          </template>
          <template v-else>
            <span class="tree-leaf-indent" aria-hidden="true"></span>
            <div class="tree-leaf">
              <slot name="leaf" :node="vn.node">
                <span class="row-meta">
                  <span class="row-title-line">
                    <span class="row-title">{{ vn.node.title }}</span>
                    <LossyMark :kind="vn.node.lossyKind" />
                  </span>
                  <span v-if="vn.node.subtitle" class="row-sub">{{ vn.node.subtitle }}</span>
                </span>
              </slot>
            </div>
          </template>
          <div
            v-if="!vn.isLeaf && session.isExpanded(vn.key) && session.getEntry(vn.key).status === 'loading'"
            class="tree-status"
          >Loading…</div>
          <div
            v-if="!vn.isLeaf && session.isExpanded(vn.key) && session.getEntry(vn.key).status === 'error'"
            class="tree-status tree-error"
          >
            <span>{{ session.getEntry(vn.key).error || 'Failed to load' }}</span>
            <button
              type="button"
              class="pill tree-retry"
              @click.stop="retry(vn.node)"
            >Retry</button>
          </div>
        </div>
      </div>
    </div>
  `,
});
