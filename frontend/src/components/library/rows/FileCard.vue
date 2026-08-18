<script setup lang="ts">
/**
 * Grid card for a folder browse file (path chrome + optional Track).
 * FileRowModel = { path, name, id, track: Track|null, displayName, cover }
 */
import { computed } from "vue";
import DownloadIcon from "@/components/downloads/DownloadIcon.vue";
import Icon from "@/components/icons/Icon.vue";
import { useDesktopViewport } from "@/layout";
import { playOrQueueTrack, queueOnly } from "@/components/library/rows";
import type { FileRowModel } from "@/components/library/loaders";
const props = withDefaults(defineProps<{
  file: FileRowModel;
  selected?: boolean;
  showMenu?: boolean;
}>(), { selected: false, showMenu: false });
const emit = defineEmits<{
  select: [file: FileRowModel, e?: MouseEvent];
  "menu-click": [file: FileRowModel, e: MouseEvent];
  "row-contextmenu": [file: FileRowModel, e: MouseEvent];
}>();
const desktop = useDesktopViewport();
const cover = computed(
      () => props.file.cover || "/static/img/placeholder.svg"
    );
    const title = computed(
      () => props.file.displayName || props.file.name || ""
    );
    const track = computed(() => props.file.track || null);

    function queueEntry() {
      if (track.value) return track.value;
      if (props.file.id) return props.file.id;
      return null;
    }

    async function onClick(e: MouseEvent) {
      const target = e.target;
      if (
        target instanceof Element &&
        (target.closest(".row-menu") || target.closest(".media-card-add"))
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        emit("select", props.file, e);
        return;
      }
      const entry = queueEntry();
      if (!entry) return;
      await playOrQueueTrack(entry);
    }

    async function onAdd(e: MouseEvent) {
      e.stopPropagation();
      const entry = queueEntry();
      if (!entry) return;
      await queueOnly(entry);
    }

    function onMenuClick(e: MouseEvent) {
      e.stopPropagation();
      e.preventDefault();
      emit("menu-click", props.file, e);
    }

    function onContext(e: MouseEvent) {
      if (!props.showMenu) return;
      emit("row-contextmenu", props.file, e);
    }
</script>

<template>
    <div
      class="media-card-wrap"
      @click="onClick"
      @contextmenu="onContext"
    >
      <div
        class="media-card media-card--file"
        :class="{ selected }"
      >
        <span class="media-card-cover-wrap">
          <img class="media-card-cover" :src="cover" alt="" loading="lazy" />
          <button
            v-if="!showMenu"
            type="button"
            class="icon-btn media-card-add"
            title="Add to playlist"
            aria-label="Add to playlist"
            @click="onAdd"
          ><Icon name="plus" /></button>
        </span>
        <span class="media-card-title">{{ title }}</span>
        <DownloadIcon v-if="track" :track="track" />
      </div>
      <button
        v-if="showMenu"
        type="button"
        class="icon-btn row-menu media-card-menu"
        title="Track actions"
        aria-label="Track actions"
        :aria-haspopup="desktop ? 'menu' : 'dialog'"
        @click="onMenuClick"
      ><Icon name="more-vert" /></button>
    </div>
</template>
