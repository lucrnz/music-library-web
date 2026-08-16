<script setup lang="ts">
/**
 * Finder-style layout menu: List / Grid / Tree.
 */
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { setLibraryLayout, ui } from "@/stores/ui";
import Icon from "@/components/icons/Icon.vue";

const OPTIONS = [
  { id: "list" as const, label: "List", icon: "layout-list" },
  { id: "grid" as const, label: "Grid", icon: "layout-grid" },
  { id: "tree" as const, label: "Tree", icon: "layout-tree" },
];
const open = ref(false);
    const rootEl = ref<HTMLElement | null>(null);
    const activeIndex = ref(0);

    const current = computed(() => ui.libraryLayout);
    const triggerIcon = computed(() => {
      const opt = OPTIONS.find((o) => o.id === current.value);
      return opt?.icon || "layout-list";
    });
    const triggerLabel = computed(() => {
      const opt = OPTIONS.find((o) => o.id === current.value);
      return opt ? `${opt.label} layout` : "Layout";
    });

    function close() {
      open.value = false;
    }

    function toggle() {
      open.value = !open.value;
      if (open.value) {
        activeIndex.value = Math.max(
          0,
          OPTIONS.findIndex((o) => o.id === current.value)
        );
      }
    }

    function choose(id: "list" | "grid" | "tree") {
      setLibraryLayout(id);
      close();
    }

    function onDocPointer(e: PointerEvent) {
      if (!open.value) return;
      const t = e.target;
      if (t instanceof Node && rootEl.value?.contains(t)) return;
      close();
    }

    function onDocKey(e: KeyboardEvent) {
      if (!open.value) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex.value = (activeIndex.value + 1) % OPTIONS.length;
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex.value =
          (activeIndex.value - 1 + OPTIONS.length) % OPTIONS.length;
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        activeIndex.value = 0;
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        activeIndex.value = OPTIONS.length - 1;
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const opt = OPTIONS[activeIndex.value];
        if (opt) choose(opt.id);
      }
    }

    watch(open, (isOpen) => {
      if (isOpen) {
        nextTick(() => {
          document.addEventListener("pointerdown", onDocPointer, true);
          document.addEventListener("keydown", onDocKey, true);
        });
      } else {
        document.removeEventListener("pointerdown", onDocPointer, true);
        document.removeEventListener("keydown", onDocKey, true);
      }
    });

    onUnmounted(() => {
      document.removeEventListener("pointerdown", onDocPointer, true);
      document.removeEventListener("keydown", onDocKey, true);
    });
</script>

<template>
    <div ref="rootEl" class="layout-menu" :class="{ open }">
      <button
        type="button"
        class="icon-btn"
        :title="triggerLabel"
        :aria-label="triggerLabel"
        aria-haspopup="menu"
        :aria-expanded="open ? 'true' : 'false'"
        @click="toggle"
      >
        <Icon :name="triggerIcon" />
      </button>
      <ul
        v-show="open"
        class="layout-menu-list"
        role="menu"
        aria-label="Library layout"
      >
        <li
          v-for="(opt, i) in OPTIONS"
          :key="opt.id"
          role="menuitemradio"
          class="layout-menu-item"
          :class="{ selected: current === opt.id, active: activeIndex === i }"
          :aria-checked="current === opt.id ? 'true' : 'false'"
          @click="choose(opt.id)"
          @mouseenter="activeIndex = i"
        >
          <Icon :name="opt.icon" />
          <span class="layout-menu-item-label">{{ opt.label }}</span>
          <Icon v-if="current === opt.id" name="check" />
        </li>
      </ul>
    </div>
</template>
