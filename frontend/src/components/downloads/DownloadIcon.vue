<script setup lang="ts">
/**
 * Compact download control for track rows.
 */
import { computed } from "vue";
import {
  downloadActionKind,
  isBusyDownloadKind,
} from "@/downloads/actionKind";
import { downloadTrack } from "@/downloads/ui";
import { showToast } from "@/stores/ui";
import Icon from "@/components/icons/Icon.vue";
import type { Track } from "@/models/track";
const props = defineProps<{
  track: Track;
}>();
const kind = computed(() => downloadActionKind(props.track).kind);

    const title = computed(() => {
      switch (kind.value) {
        case "ready":
          return "Downloaded";
        case "other":
          return "Downloaded at a different quality — tap to download at download quality";
        case "pending":
          return "Queued";
        case "active":
          return "Downloading…";
        case "paused":
          return "Download paused";
        case "retry":
          return "Download failed — tap to retry";
        default:
          return "Download";
      }
    });

    const iconName = computed(() => {
      switch (kind.value) {
        case "ready":
          return "check";
        case "other":
          return "download-check";
        default:
          return "download";
      }
    });

    const busy = computed(() => isBusyDownloadKind(kind.value));

    async function onClick(e: MouseEvent) {
      e.stopPropagation();
      e.preventDefault();
      if (kind.value === "hide" || kind.value === "ready" || busy.value) return;
      try {
        await downloadTrack(props.track);
      } catch (err: unknown) {
        console.error(err);
        showToast(err instanceof Error ? err.message : "Download failed");
      }
    }
</script>

<template>
    <button
      v-if="kind !== 'hide'"
      type="button"
      class="icon-btn row-download"
      :class="{
        'is-ready': kind === 'ready',
        'is-other': kind === 'other',
        'is-busy': busy,
        'is-failed': kind === 'retry',
      }"
      :title="title"
      :aria-label="title"
      :disabled="busy || kind === 'ready'"
      @click="onClick"
    >
      <span v-if="busy" class="dl-spinner" aria-hidden="true"></span>
      <Icon v-else :name="iconName" />
    </button>
</template>
