import {
  computed,
  defineComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { formatTime, setRangeFill } from "../../util.js";
import { pl } from "../../stores/playlist.js";
import {
  player,
  playNext,
  playPrev,
  togglePlay,
  toggleShuffle,
  cycleRepeat,
  seekToFraction,
  setVolume,
} from "../../stores/player.js";
import { openSettings, settings } from "../../stores/settings.js";
import { downloads } from "../../stores/downloads.js";
import Icon from "../icons/Icon.js";
import LyricsOverlay from "./LyricsOverlay.js";

const DESKTOP_BREAKPOINT = "(min-width: 900px)";

function isDesktop() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(DESKTOP_BREAKPOINT).matches
  );
}

export default defineComponent({
  name: "PlayerBar",
  components: { Icon, LyricsOverlay },
  setup() {
    const root = ref(null);
    const seekEl = ref(null);
    const volEl = ref(null);
    const closeBtn = ref(null);
    const sheetDragY = ref(null);
    /** Element to restore focus to after collapse (nice-to-have). */
    let focusRestoreEl = null;

    const visible = computed(() => Boolean(pl.current) || pl.length > 0);
    const track = computed(() => pl.current);
    const title = computed(() => (track.value ? track.value.title : "—"));
    const subtitle = computed(() => {
      const t = track.value;
      if (!t) return "No track";
      return [t.artist, t.album].filter(Boolean).join(" — ") || "Unknown";
    });
    // Covers resolved in player store (local OPFS when downloaded / offline).
    const coverThumb = computed(() => player.coverThumb);
    const coverFull = computed(() => player.coverFull);
    const seekValue = computed(() => {
      const dur = player.duration;
      if (!dur) return 0;
      return Math.round((player.currentTime / dur) * 1000);
    });
    const playIcon = computed(() => (player.paused ? "play" : "pause"));
    const repeatIcon = computed(() =>
      pl.repeat === "one" ? "repeat-one" : "repeat"
    );

    function expand(ev) {
      if (player.expanded) return;
      if (ev?.currentTarget instanceof HTMLElement) {
        focusRestoreEl = ev.currentTarget;
      }
      player.expanded = true;
      player.sheetOffset = 0;
      nextTick(() => {
        closeBtn.value?.focus?.();
      });
    }

    /** Open NP from closed-bar cover/meta; no-op when already expanded. */
    function onCoverOrMetaOpen(ev) {
      if (player.expanded) return;
      expand(ev);
    }

    function collapse() {
      if (!player.expanded) return;
      player.expanded = false;
      player.sheetOffset = 0;
      player.draggingSheet = false;
      player.lyricsOpen = false;
      const restore = focusRestoreEl;
      focusRestoreEl = null;
      if (restore && typeof restore.focus === "function") {
        nextTick(() => restore.focus());
      }
    }

    function toggleLyrics() {
      if (!player.expanded) return;
      player.lyricsOpen = !player.lyricsOpen;
    }

    const trackId = computed(() => track.value?.id || null);

    // Close lyrics when the current track changes.
    watch(trackId, () => {
      player.lyricsOpen = false;
    });

    function onSheetDown(e) {
      if (isDesktop()) return;
      sheetDragY.value = e.clientY;
      player.draggingSheet = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }

    function onSheetMove(e) {
      if (sheetDragY.value == null) return;
      player.sheetOffset = Math.max(0, e.clientY - sheetDragY.value);
    }

    function onSheetUp(e) {
      if (sheetDragY.value == null) return;
      const dy = e.clientY - sheetDragY.value;
      sheetDragY.value = null;
      player.draggingSheet = false;
      if (dy > 100) collapse();
      else player.sheetOffset = 0;
    }

    function onSeekDown() {
      player.seeking = true;
    }

    function onSeekUp(e) {
      player.seeking = false;
      const val = Number(e.target.value);
      seekToFraction(val / 1000);
    }

    function onSeekInput(e) {
      setRangeFill(e.target);
    }

    function onVolInput(e) {
      setVolume(e.target.value);
      setRangeFill(e.target);
    }

    function onKeydown(e) {
      if (e.key !== "Escape" || !player.expanded) return;
      // Let higher modals own Escape (settings z-index 100+ over NP 50).
      if (settings.open || downloads.managerOpen) return;
      e.preventDefault();
      collapse();
    }

    watch(
      () => [player.currentTime, player.duration, player.seeking],
      async () => {
        await nextTick();
        if (!player.seeking && seekEl.value) {
          seekEl.value.value = String(seekValue.value);
          setRangeFill(seekEl.value);
        }
      }
    );

    watch(
      () => player.volume,
      async () => {
        await nextTick();
        if (volEl.value) {
          volEl.value.value = String(player.volume);
          setRangeFill(volEl.value);
        }
      },
      { immediate: true }
    );

    // Collapse NP when crossing mobile ↔ desktop either way.
    let mq = null;
    function onBreakpointChange() {
      collapse();
    }

    onMounted(() => {
      window.addEventListener("keydown", onKeydown);
      if (typeof window !== "undefined") {
        mq = window.matchMedia(DESKTOP_BREAKPOINT);
        mq.addEventListener("change", onBreakpointChange);
      }
    });

    onUnmounted(() => {
      window.removeEventListener("keydown", onKeydown);
      mq?.removeEventListener("change", onBreakpointChange);
    });

    const rootStyle = computed(() => {
      if (!player.draggingSheet && !player.sheetOffset) return {};
      return { transform: `translateY(${player.sheetOffset}px)` };
    });

    return {
      root,
      seekEl,
      volEl,
      closeBtn,
      pl,
      player,
      visible,
      title,
      subtitle,
      coverThumb,
      coverFull,
      seekValue,
      playIcon,
      repeatIcon,
      formatTime,
      expand,
      onCoverOrMetaOpen,
      collapse,
      toggleLyrics,
      trackId,
      onSheetDown,
      onSheetMove,
      onSheetUp,
      onSeekDown,
      onSeekUp,
      onSeekInput,
      onVolInput,
      togglePlay,
      playNext,
      playPrev,
      toggleShuffle,
      cycleRepeat,
      openSettings,
      rootStyle,
    };
  },
  template: `
    <div
      id="player"
      ref="root"
      :class="{
        hidden: !visible,
        expanded: player.expanded,
        dragging: player.draggingSheet,
      }"
      :style="rootStyle"
    >
      <div
        v-if="player.expanded"
        class="np-backdrop"
        aria-hidden="true"
        @click="collapse"
      ></div>
      <div v-if="player.playNotice" class="player-notice" role="status">
        {{ player.playNotice }}
      </div>
      <div class="player-mini">
        <img class="mini-cover" :src="coverThumb" alt="" />
        <button
          type="button"
          class="mini-meta"
          aria-label="Open now playing"
          @click="expand"
        >
          <span class="np-title">{{ title }}</span>
          <span class="np-artist">{{ subtitle }}</span>
        </button>
        <button
          type="button"
          class="icon-btn"
          title="Play / Pause"
          aria-label="Play / Pause"
          @click="togglePlay"
        >
          <Icon :name="playIcon" />
        </button>
        <button
          type="button"
          class="icon-btn"
          title="Next"
          aria-label="Next"
          @click="playNext"
        >
          <Icon name="next" />
        </button>
      </div>

      <div
        class="player-full"
        :role="player.expanded ? 'dialog' : undefined"
        :aria-modal="player.expanded ? 'true' : undefined"
        :aria-label="player.expanded ? 'Now playing' : undefined"
      >
        <div
          class="sheet-grab"
          @pointerdown="onSheetDown"
          @pointermove="onSheetMove"
          @pointerup="onSheetUp"
        >
          <button
            type="button"
            ref="closeBtn"
            class="icon-btn"
            title="Close"
            aria-label="Close now playing"
            @click="collapse"
          >
            <Icon name="chevron-down" />
          </button>
        </div>

        <!-- Single cover/meta tree: open affordance when closed; lyrics when expanded. -->
        <div
          class="full-cover-wrap"
          :class="{
            'lyrics-open': player.expanded && player.lyricsOpen,
            'is-open-target': !player.expanded,
          }"
          :role="player.expanded ? undefined : 'button'"
          :tabindex="player.expanded ? undefined : 0"
          :aria-label="player.expanded ? undefined : 'Open now playing'"
          @click="onCoverOrMetaOpen"
          @keydown.enter.space.prevent="onCoverOrMetaOpen"
        >
          <img
            class="full-cover"
            :src="coverFull"
            :alt="player.expanded ? 'Album cover' : ''"
          />
          <LyricsOverlay
            v-if="player.expanded"
            :open="player.lyricsOpen"
            :track-id="trackId"
            :current-time="player.currentTime"
            :duration="player.duration"
          />
        </div>

        <div
          class="full-meta"
          :class="{ 'is-open-target': !player.expanded }"
          :role="player.expanded ? undefined : 'button'"
          :tabindex="player.expanded ? undefined : 0"
          :aria-label="player.expanded ? undefined : 'Open now playing'"
          @click="onCoverOrMetaOpen"
          @keydown.enter.space.prevent="onCoverOrMetaOpen"
        >
          <div class="np-title">{{ title }}</div>
          <div class="np-artist">{{ subtitle }}</div>
        </div>

        <div class="seek-row">
          <span class="time">{{ formatTime(player.currentTime) }}</span>
          <input
            ref="seekEl"
            type="range"
            min="0"
            max="1000"
            step="1"
            :value="seekValue"
            aria-label="Seek"
            @pointerdown="onSeekDown"
            @pointerup="onSeekUp"
            @input="onSeekInput"
          />
          <span class="time">{{ formatTime(player.duration) }}</span>
        </div>

        <div class="transport-buttons">
          <button
            type="button"
            class="icon-btn toggle"
            title="Shuffle"
            :aria-pressed="pl.shuffle ? 'true' : 'false'"
            aria-label="Shuffle"
            @click="toggleShuffle"
          ><Icon name="shuffle" /></button>
          <button
            type="button"
            class="icon-btn"
            title="Previous"
            aria-label="Previous"
            @click="playPrev"
          >
            <Icon name="prev" />
          </button>
          <button
            type="button"
            class="icon-btn primary"
            title="Play / Pause"
            aria-label="Play / Pause"
            @click="togglePlay"
          >
            <Icon :name="playIcon" />
          </button>
          <button
            type="button"
            class="icon-btn"
            title="Next"
            aria-label="Next"
            @click="playNext"
          >
            <Icon name="next" />
          </button>
          <button
            type="button"
            class="icon-btn toggle"
            title="Repeat"
            :aria-pressed="pl.repeat !== 'off' ? 'true' : 'false'"
            aria-label="Repeat"
            @click="cycleRepeat"
          ><Icon :name="repeatIcon" /></button>
        </div>

        <div class="player-extras">
          <label class="vol-label" title="Volume">
            <Icon name="volume" />
            <input
              ref="volEl"
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="player.volume"
              aria-label="Volume"
              @input="onVolInput"
            />
          </label>
          <button
            type="button"
            class="icon-btn toggle lyrics-toggle"
            title="Lyrics"
            aria-label="Lyrics"
            :aria-pressed="player.lyricsOpen ? 'true' : 'false'"
            @click="toggleLyrics"
          ><Icon name="lyrics" /></button>
          <button
            type="button"
            class="icon-btn"
            title="Settings"
            aria-label="Settings"
            aria-haspopup="dialog"
            @click="openSettings"
          ><Icon name="settings" /></button>
        </div>
      </div>
    </div>
  `,
});
