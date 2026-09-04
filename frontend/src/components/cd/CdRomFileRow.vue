<script setup lang="ts">
import { computed } from "vue";
import {
  formatCdromLabel,
  isCdromLossy,
  VA_ARTIST_THUMB,
  type CdromFileNode,
} from "@/cd/cdrom";
import { kindForTrack } from "@/lossyKind";
import LossyMark from "@/components/lossy/LossyMark.vue";

const props = defineProps<{
  file: CdromFileNode;
}>();

const label = computed(() => formatCdromLabel(props.file));
const kind = computed(() =>
  kindForTrack({
    isLossy: isCdromLossy(props.file.sourceCodec),
    sourceCodec: props.file.sourceCodec,
  }),
);
</script>

<template>
  <span class="cdrom-file-row">
    <img class="cdrom-file-thumb" :src="VA_ARTIST_THUMB" alt="" />
    <span class="cdrom-file-label">{{ label }}</span>
    <LossyMark :kind="kind" />
  </span>
</template>
