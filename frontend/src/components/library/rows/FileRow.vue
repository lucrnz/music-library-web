<script setup lang="ts">
/**
 * Folder browse file row: path chrome + optional Track.
 * FileRowModel = { path, name, id, track: Track|null, displayName, cover }
 */
import { computed } from "vue";
import { kindForTrack } from "@/lossyKind";
import DownloadIcon from "@/components/downloads/DownloadIcon.vue";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import { useDesktopViewport } from "@/layout";
import { playOrQueueTrack, queueOnly } from "@/components/library/rows";
import type { FileRowModel } from "@/components/library/loaders";
const props = withDefaults(defineProps<{
  file: FileRowModel | null;
  selected?: boolean;
  showMenu?: boolean;
}>(), { selected: false, file: null, showMenu: false });
const emit = defineEmits<{
  select: [file: FileRowModel, e?: MouseEvent];
  "menu-click": [file: FileRowModel, e: MouseEvent];
  "row-contextmenu": [file: FileRowModel, e: MouseEvent];
}>();
const desktop = useDesktopViewport();
const cover = computed(
      () => props.file?.cover || "/static/img/placeholder.svg"
    );

    const title = computed(
      () => props.file?.displayName || props.file?.name || ""
    );

    const track = computed(() => props.file?.track || null);

    /** Full Track when attached; otherwise bare id for addToQueue meta fetch. */
    function queueEntry() {
      if (track.value) return track.value;
      if (props.file?.id) return props.file.id;
      return null;
    }

    const lossyKind = computed(() => kindForTrack(track.value));

    async function onClick(e: MouseEvent) {
      const target = e.target;
      if (
        target instanceof Element &&
        (target.closest(".lossy-mark") ||
          target.closest(".row-menu") ||
          target.closest(".row-add"))
      ) {
        return;
      }
      if (!props.file) return;
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
      if (!props.file) return;
      emit("menu-click", props.file, e);
    }

    function onContext(e: MouseEvent) {
      if (!props.showMenu || !props.file) return;
      emit("row-contextmenu", props.file, e);
    }
</script>

<template>
    <div
      v-if="file"
      class="row"
      :class="{ selected }"
      @click="onClick"
      @contextmenu="onContext"
    >
      <span class="row-cover-wrap">
        <img class="row-cover" :src="cover" alt="" loading="lazy" />
      </span>
      <span class="row-meta">
        <span class="row-title-line">
          <span class="row-title">{{ title }}</span>
          <LossyMark :kind="lossyKind" />
        </span>
      </span>
      <DownloadIcon v-if="track" :track="track" />
      <button
        v-if="showMenu"
        type="button"
        class="icon-btn row-menu"
        title="Track actions"
        aria-label="Track actions"
        :aria-haspopup="desktop ? 'menu' : 'dialog'"
        @click="onMenuClick"
      ><Icon name="more-vert" /></button>
      <button
        v-else
        type="button"
        class="icon-btn row-add"
        title="Add to playlist"
        aria-label="Add to playlist"
        @click="onAdd"
      ><Icon name="plus" /></button>
    </div>
</template>
