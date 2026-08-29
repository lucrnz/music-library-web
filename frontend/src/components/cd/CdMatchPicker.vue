<script setup lang="ts">
import { cd, confirmPickerMatch, dismissPicker } from "@/stores/cd";

async function pick(mbid: string) {
  try {
    await confirmPickerMatch(mbid);
  } catch (err) {
    console.error(err);
  }
}

function label(m: (typeof cd.matches)[number]) {
  const bits = [m.title, m.artist, m.year, m.country, m.label, `${m.track_count} tracks`];
  return bits.filter(Boolean).join(" · ");
}
</script>

<template>
  <div v-if="cd.pickerOpen" class="cd-picker" role="dialog" aria-modal="true" aria-label="Choose disc">
    <div class="cd-picker-card">
      <h2 class="cd-picker-title">Choose disc</h2>
      <p class="modal-hint">Several MusicBrainz releases match this CD.</p>
      <button
        v-for="m in cd.matches"
        :key="m.release_mbid"
        type="button"
        class="cd-picker-row"
        @click="pick(m.release_mbid)"
      >
        {{ label(m) }}
      </button>
      <button type="button" class="pill" @click="dismissPicker">Dismiss</button>
    </div>
  </div>
</template>
