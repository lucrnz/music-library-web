<script setup lang="ts">
import { computed } from "vue";
import { artistImageUrl } from "@/api";
import type { ListenArtist } from "@/listens/types";

const props = defineProps<{
  artist: ListenArtist;
}>();
const emit = defineEmits<{
  open: [artist: ListenArtist];
}>();

const cover = computed(() => artistImageUrl(props.artist, "thumb", false));

function onClick() {
  emit("open", props.artist);
}
</script>

<template>
  <div class="row" @click="onClick">
    <span class="row-cover-wrap">
      <img class="row-cover" :src="cover" alt="" loading="lazy" />
    </span>
    <span class="row-meta">
      <span class="row-title">{{ artist.name }}</span>
    </span>
    <span class="row-plays">{{ artist.playCount }}</span>
  </div>
</template>
