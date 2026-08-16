<script setup lang="ts">
/**
 * Shared labeled rows for Playback details (modal + popover).
 */
export interface PlaybackDetailRow {
  key: string;
  label: string;
  value: string;
}

const props = withDefaults(defineProps<{
  rows?: PlaybackDetailRow[];
}>(), { rows: () => [], });
</script>

<template>
    <dl v-if="rows.length" class="playback-details-list">
      <div
        v-for="row in rows"
        :key="row.key"
        class="playback-details-row"
      >
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </div>
    </dl>
    <p v-else class="playback-details-empty">No details</p>
</template>
