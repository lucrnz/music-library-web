<script setup lang="ts">
/**
 * Scrolling lyrics overlay for expanded now-playing (mobile sheet / desktop panel).
 */
import { computed, nextTick, ref, watch } from "vue";
import { canReachServer } from "@/connectivity";
import { resolveLyrics } from "@/lyrics/cache";
import { activeLineIndex, parseLrc } from "@/lyrics/parseLrc";
import type { Lyrics } from "@/models/lyrics";

interface LrcLine {
  t: number;
  text: string;
}

type LyricsView =
  | { kind: "loading" }
  | { kind: "pending" }
  | { kind: "instrumental" }
  | { kind: "error"; message?: string }
  | { kind: "empty" }
  | { kind: "plain"; text: string }
  | { kind: "synced"; lines: LrcLine[] };

const emit = defineEmits<{
  "seek-fraction": [fraction: number];
}>();

const props = withDefaults(
  defineProps<{
    open?: boolean;
    trackId?: string | null;
    currentTime?: number;
    duration?: number;
    seekable?: boolean;
  }>(),
  { open: false, trackId: null, currentTime: 0, duration: 0, seekable: true },
);

const loading = ref(false);
const error = ref<string | null>(null);
const payload = ref<Lyrics | null>(null);
const listEl = ref<HTMLElement | null>(null);
let loadGen = 0;
let lastScrollIdx = -1;

const lines = computed((): LrcLine[] => {
  const p = payload.value;
  if (!p || !p.isSynced || !p.syncedLrc) return [];
  return parseLrc(p.syncedLrc) as LrcLine[];
});

const activeIdx = computed(() =>
  activeLineIndex(lines.value, props.currentTime),
);

const view = computed((): LyricsView => {
  if (loading.value) return { kind: "loading" };
  if (error.value) return { kind: "error", message: error.value };
  const p = payload.value;
  if (!p) return { kind: "loading" };
  if (p.instrumental || p.status === "instrumental") {
    return { kind: "instrumental" };
  }
  if (p.status === "pending") return { kind: "pending" };
  if (p.status === "error") {
    return { kind: "error", message: p.source || "Could not load lyrics" };
  }
  if (p.status === "not_found" || p.status === "skipped") {
    return { kind: "empty" };
  }
  if (p.isSynced && lines.value.length) {
    return { kind: "synced", lines: lines.value };
  }
  if (p.plainText) return { kind: "plain", text: p.plainText };
  return { kind: "empty" };
});

async function load() {
  const id = props.trackId;
  const gen = ++loadGen;
  if (!id) {
    payload.value = null;
    error.value = null;
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = null;
  payload.value = null;
  lastScrollIdx = -1;
  try {
    const data = await resolveLyrics(id, { allowNetwork: canReachServer() });
    if (gen !== loadGen) return;
    payload.value = data;
  } catch (err: unknown) {
    if (gen !== loadGen) return;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (gen === loadGen) loading.value = false;
  }
}

function onLineClick(line: LrcLine) {
  if (!props.seekable) return;
  const dur = props.duration;
  if (!dur || !Number.isFinite(line.t)) return;
  emit("seek-fraction", line.t / dur);
}

watch(
  () => [props.open, props.trackId] as const,
  ([open]) => {
    if (open) load();
  },
  { immediate: true },
);

watch(activeIdx, async (idx) => {
  if (idx < 0 || idx === lastScrollIdx) return;
  lastScrollIdx = idx;
  await nextTick();
  const root = listEl.value;
  if (!root) return;
  const el = root.querySelector(".lyrics-line.active");
  el?.scrollIntoView({ block: "center", behavior: "smooth" });
});
</script>

<template>
    <div v-if="open" class="lyrics-overlay" role="region" aria-label="Lyrics">
      <div class="lyrics-scrim" aria-hidden="true"></div>
      <div class="lyrics-body" ref="listEl">
        <p v-if="view.kind === 'loading'" class="lyrics-status">Loading lyrics…</p>
        <p v-else-if="view.kind === 'pending'" class="lyrics-status">
          Lyrics not fetched yet - run a library scan.
        </p>
        <p v-else-if="view.kind === 'instrumental'" class="lyrics-status">
          Instrumental
        </p>
        <p v-else-if="view.kind === 'error'" class="lyrics-status">
          {{ view.message || 'Could not load lyrics' }}
        </p>
        <p v-else-if="view.kind === 'empty'" class="lyrics-status">
          No lyrics found
        </p>
        <div v-else-if="view.kind === 'plain'" class="lyrics-plain">{{ view.text }}</div>
        <ul v-else-if="view.kind === 'synced'" class="lyrics-lines">
          <li
            v-for="(line, i) in view.lines"
            :key="i + '-' + line.t"
            class="lyrics-line"
            :class="{
              active: i === activeIdx,
              past: i < activeIdx,
              'is-seekable': seekable,
            }"
            @click="onLineClick(line)"
          >{{ line.text || '♪' }}</li>
        </ul>
      </div>
    </div>
</template>
