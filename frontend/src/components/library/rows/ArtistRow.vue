<script setup lang="ts">
import { computed } from "vue";
import { artistImageUrl } from "@/api";
import Icon from "@/components/icons/Icon.vue";
import type { ArtistListItem } from "@/api";
const props = withDefaults(defineProps<{
  artist: ArtistListItem;
  coverSrc?: string;
  showCounts?: boolean;
}>(), { coverSrc: "", showCounts: true });
const emit = defineEmits<{
  open: [artist: ArtistListItem];
}>();
const cover = computed(
      () => props.coverSrc || artistImageUrl(props.artist, "thumb", false)
    );
    const sub = computed(() => {
      if (!props.showCounts) return "";
      const a = props.artist;
      const n = a.album_count;
      const albums = `${n} album${n === 1 ? "" : "s"}`;
      return `${albums} · ${a.track_count} tracks`;
    });
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
        <span v-if="sub" class="row-sub">{{ sub }}</span>
      </span>
      <span class="row-chevron"><Icon name="chevron-right" /></span>
    </div>
</template>
