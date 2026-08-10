/**
 * Scrolling lyrics overlay for mobile expanded now-playing.
 */
import {
  computed,
  defineComponent,
  nextTick,
  ref,
  watch,
} from "vue";
import { canReachServer } from "../../connectivity.js";
import { resolveLyrics } from "../../lyrics/cache.js";
import { activeLineIndex, parseLrc } from "../../lyrics/parseLrc.js";
import { seekToFraction } from "../../stores/player.js";

export default defineComponent({
  name: "LyricsOverlay",
  props: {
    open: { type: Boolean, default: false },
    trackId: { type: String, default: null },
    currentTime: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
  },
  setup(props) {
    const loading = ref(false);
    const error = ref(null);
    /** @type {import("vue").Ref<import("../../models/lyrics.js").Lyrics|null>} */
    const payload = ref(null);
    const listEl = ref(null);
    let loadGen = 0;
    let lastScrollIdx = -1;

    const lines = computed(() => {
      const p = payload.value;
      if (!p || !p.isSynced || !p.syncedLrc) return [];
      return parseLrc(p.syncedLrc);
    });

    const activeIdx = computed(() =>
      activeLineIndex(lines.value, props.currentTime)
    );

    /**
     * Single derived view state for the template.
     * @returns {{ kind: string, message?: string, text?: string, lines?: object[] }}
     */
    const view = computed(() => {
      if (loading.value) return { kind: "loading" };
      if (error.value) return { kind: "error", message: error.value };
      const p = payload.value;
      if (!p) return { kind: "loading" };
      if (p.instrumental || p.status === "instrumental") {
        return { kind: "instrumental" };
      }
      if (p.isSynced && lines.value.length) {
        return { kind: "synced", lines: lines.value };
      }
      if (p.plainText) return { kind: "plain", text: p.plainText };
      if (p.status === "pending") return { kind: "pending" };
      if (p.status === "error") {
        return { kind: "error", message: "Could not load lyrics" };
      }
      return { kind: "empty" };
    });

    async function load() {
      const id = props.trackId;
      const gen = ++loadGen;
      if (!id) {
        payload.value = null;
        return;
      }
      loading.value = true;
      error.value = null;
      try {
        const allowNetwork = canReachServer();
        const data = await resolveLyrics(id, { allowNetwork });
        if (gen !== loadGen) return;
        payload.value = data;
      } catch (e) {
        if (gen !== loadGen) return;
        error.value = e?.message || "Failed to load lyrics";
        payload.value = null;
      } finally {
        if (gen === loadGen) loading.value = false;
      }
    }

    watch(
      () => [props.open, props.trackId],
      ([open, id]) => {
        if (open && id) load();
        if (!open) lastScrollIdx = -1;
      },
      { immediate: true }
    );

    watch(activeIdx, async (idx) => {
      if (!props.open || idx < 0 || idx === lastScrollIdx) return;
      lastScrollIdx = idx;
      await nextTick();
      const root = listEl.value;
      const el = root?.querySelector?.(".lyrics-line.active");
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });

    function onLineClick(line) {
      const dur = props.duration;
      if (!dur || !Number.isFinite(line.t)) return;
      seekToFraction(Math.min(1, Math.max(0, line.t / dur)));
    }

    return {
      listEl,
      activeIdx,
      view,
      onLineClick,
    };
  },
  template: `
    <div v-if="open" class="lyrics-overlay" role="region" aria-label="Lyrics">
      <div class="lyrics-scrim" aria-hidden="true"></div>
      <div class="lyrics-body" ref="listEl">
        <p v-if="view.kind === 'loading'" class="lyrics-status">Loading lyrics…</p>
        <p v-else-if="view.kind === 'pending'" class="lyrics-status">
          Lyrics not fetched yet — run a library scan.
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
            }"
            @click="onLineClick(line)"
          >{{ line.text || '♪' }}</li>
        </ul>
      </div>
    </div>
  `,
});
