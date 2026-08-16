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
import { playOrQueueTrack, queueOnly } from "@/components/library/rows";
import type { FileRowModel } from "@/components/library/loaders";
const props = withDefaults(defineProps<{
  file: FileRowModel | null;
  selected?: boolean;
}>(), { selected: false, file: null });
const emit = defineEmits<{
  select: [file: FileRowModel, e?: MouseEvent];
}>();
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
      if (target instanceof Element && target.closest(".lossy-mark")) return;
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
</script>

<template>
    <div
      v-if="file"
      class="row"
      :class="{ selected }"
      @click="onClick"
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
        type="button"
        class="icon-btn row-add"
        title="Add to playlist"
        aria-label="Add to playlist"
        @click="onAdd"
      ><Icon name="plus" /></button>
    </div>
</template>
