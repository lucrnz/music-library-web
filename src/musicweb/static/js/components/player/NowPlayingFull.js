/**
 * Expanded / full player chrome: sheet grab, cover, seek, transport, extras.
 * Parent owns expand/collapse and mini bar.
 */
import { computed, defineComponent, nextTick, ref, watch } from "vue";
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
import { openSettings } from "../../stores/settings.js";
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
  name: "NowPlayingFull",
  components: { Icon, LyricsOverlay },
  props: {
    title: { type: String, default: "—" },
    subtitle: { type: String, default: "" },
    coverFull: { type: String, default: "" },
    playIcon: { type: String, default: "play" },
    repeatIcon: { type: String, default: "repeat" },
    closeIcon: { type: String, default: "chevron-down" },
    /** Mobile dialog semantics when expanded on small viewports. */
    npModal: { type: Boolean, default: false },
    seekValue: { type: Number, default: 0 },
    trackId: { type: [String, null], default: null },
  },
  emits: ["collapse", "cover-or-meta-open", "close-focus"],
  setup(props, { emit, expose }) {
    const seekEl = ref(null);
    const volEl = ref(null);
    const closeBtn = ref(null);
    const sheetDragY = ref(null);

    function collapse() {
      emit("collapse");
    }

    function onCoverOrMetaOpen(ev) {
      emit("cover-or-meta-open", ev);
    }

    function toggleLyrics() {
      if (!player.expanded) return;
      player.lyricsOpen = !player.lyricsOpen;
    }

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

    watch(
      () => [player.currentTime, player.duration, player.seeking],
      async () => {
        await nextTick();
        if (!player.seeking && seekEl.value) {
          seekEl.value.value = String(props.seekValue);
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

    function focusClose() {
      nextTick(() => {
        closeBtn.value?.focus?.();
      });
    }

    expose({ focusClose, closeBtn });

    return {
      pl,
      player,
      seekEl,
      volEl,
      closeBtn,
      formatTime,
      collapse,
      onCoverOrMetaOpen,
      toggleLyrics,
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
    };
  },
  template: `
    <div
      class="player-full"
      :role="npModal ? 'dialog' : player.expanded ? 'complementary' : undefined"
      :aria-modal="npModal ? 'true' : undefined"
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
          <Icon :name="closeIcon" />
        </button>
      </div>

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
  `,
});
