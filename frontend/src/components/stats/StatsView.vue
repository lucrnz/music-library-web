<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { fetchListenRankings } from "@/api";
import { connectivityLoadError } from "@/connectivity";
import { downloads } from "@/downloads/state";
import {
  buildRangeChips,
  currentYearForLabels,
  parseStatsRange,
} from "@/listens/rangeChips";
import type { ListenArtist, ListenRankings } from "@/listens/types";
import {
  connectivity,
  noteServerReachable,
  noteServerUnreachable,
} from "@/stores/connectivity";
import StatsArtistRow from "@/components/stats/StatsArtistRow.vue";
import StatsTrackRow from "@/components/stats/StatsTrackRow.vue";

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const error = ref("");
const payload = ref<ListenRankings | null>(null);

const selectedRange = computed(() => parseStatsRange(route.query.range));
const chips = computed(() =>
  buildRangeChips({
    months: payload.value?.months || [],
    currentYear: currentYearForLabels(payload.value?.timezone || "local"),
  }),
);
const emptyCopy = computed(() => {
  if (!payload.value) return "";
  if (payload.value.artists.length || payload.value.tracks.length) return "";
  if (payload.value.months.length === 0) return "No listening history yet";
  return "No listens in this range";
});

watch(
  () => route.query.range,
  async (raw) => {
    const parsed = parseStatsRange(raw);
    if (parsed === "all" && raw != null && raw !== "") {
      await router.replace({ name: "stats" });
      return;
    }
    if (parsed !== "all" && String(raw) !== parsed) {
      await router.replace({ name: "stats", query: { range: parsed } });
      return;
    }
    await load(parsed);
  },
  { immediate: true },
);

async function load(range: string) {
  loading.value = true;
  error.value = "";
  try {
    const data = await fetchListenRankings(range);
    payload.value = data;
    noteServerReachable();
  } catch (err: unknown) {
    payload.value = null;
    noteServerUnreachable(err);
    const msg = err instanceof Error ? err.message : String(err);
    error.value =
      connectivityLoadError(connectivity.state, downloads.enabled) || msg;
  } finally {
    loading.value = false;
  }
}

function selectRange(range: string) {
  if (range === "all") {
    void router.replace({ name: "stats" });
    return;
  }
  void router.replace({ name: "stats", query: { range } });
}

function openArtist(artist: ListenArtist) {
  void router.push({ name: "artist", params: { artistId: artist.id } });
}
</script>

<template>
  <div class="stats-view">
    <div class="stats-chips mode-bar" role="tablist" aria-label="Time range">
      <button
        v-for="chip in chips"
        :key="chip.range"
        type="button"
        class="mode-btn"
        :class="{ active: selectedRange === chip.range }"
        role="tab"
        :aria-selected="selectedRange === chip.range"
        @click="selectRange(chip.range)"
      >{{ chip.label }}</button>
    </div>
    <p v-if="error" class="empty">{{ error }}</p>
    <p v-else-if="loading && !payload" class="empty">Loading…</p>
    <p v-else-if="emptyCopy" class="empty">{{ emptyCopy }}</p>
    <template v-else-if="payload">
      <h2 class="stats-heading">Artists</h2>
      <div class="row-list">
        <StatsArtistRow
          v-for="artist in payload.artists"
          :key="artist.id"
          :artist="artist"
          @open="openArtist"
        />
      </div>
      <h2 class="stats-heading">Tracks</h2>
      <div class="row-list">
        <StatsTrackRow
          v-for="track in payload.tracks"
          :key="track.id"
          :track="track"
        />
      </div>
    </template>
  </div>
</template>
