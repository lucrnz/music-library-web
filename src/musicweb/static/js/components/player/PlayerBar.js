import { computed, defineComponent, nextTick, ref, watch } from "vue";
import { coverUrl } from "../../api.js";
import { formatTime, setRangeFill, PLACEHOLDER_COVER } from "../../util.js";
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

const DESKTOP_BREAKPOINT = "(min-width: 900px)";

export default defineComponent({
  name: "PlayerBar",
  components: { Icon },
  setup() {
    const root = ref(null);
    const seekEl = ref(null);
    const volEl = ref(null);
    const sheetDragY = ref(null);

    const visible = computed(() => Boolean(pl.current) || pl.length > 0);
    const track = computed(() => pl.current);
    const title = computed(() => (track.value ? track.value.title : "—"));
    const subtitle = computed(() => {
      const t = track.value;
      if (!t) return "No track";
      return [t.artist, t.album].filter(Boolean).join(" — ") || "Unknown";
    });
    const coverThumb = computed(() =>
      track.value ? coverUrl(track.value, "thumb") : PLACEHOLDER_COVER
    );
    const coverFull = computed(() =>
      track.value ? coverUrl(track.value, "full") : PLACEHOLDER_COVER
    );
    const seekValue = computed(() => {
      const dur = player.duration;
      if (!dur) return 0;
      return Math.round((player.currentTime / dur) * 1000);
    });
    const playIcon = computed(() => (player.paused ? "play" : "pause"));
    const repeatIcon = computed(() =>
      pl.repeat === "one" ? "repeat-one" : "repeat"
    );

    function expand() {
      if (window.matchMedia(DESKTOP_BREAKPOINT).matches) return;
      player.expanded = true;
      player.sheetOffset = 0;
    }

    function collapse() {
      player.expanded = false;
      player.sheetOffset = 0;
      player.draggingSheet = false;
    }

    function onSheetDown(e) {
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

    // Collapse sheet when growing to desktop
    if (typeof window !== "undefined") {
      const mq = window.matchMedia(DESKTOP_BREAKPOINT);
      mq.addEventListener("change", (e) => {
        if (e.matches) collapse();
      });
    }

    const rootStyle = computed(() => {
      if (!player.draggingSheet && !player.sheetOffset) return {};
      return { transform: `translateY(${player.sheetOffset}px)` };
    });

    return {
      root,
      seekEl,
      volEl,
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
      collapse,
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
        v-if="player.playNotice"
        class="player-notice"
        role="status"
      >{{ player.playNotice }}</div>
      <div class="player-mini">
        <img class="mini-cover" :src="coverThumb" alt="" />
        <button type="button" class="mini-meta" aria-label="Open now playing" @click="expand">
          <span class="np-title">{{ title }}</span>
          <span class="np-artist">{{ subtitle }}</span>
        </button>
        <button type="button" class="icon-btn" title="Play / Pause" aria-label="Play / Pause" @click="togglePlay">
          <Icon :name="playIcon" />
        </button>
        <button type="button" class="icon-btn" title="Next" aria-label="Next" @click="playNext">
          <Icon name="next" />
        </button>
      </div>

      <div class="player-full">
        <div
          class="sheet-grab"
          @pointerdown="onSheetDown"
          @pointermove="onSheetMove"
          @pointerup="onSheetUp"
        >
          <button type="button" class="icon-btn" title="Close" aria-label="Close now playing" @click="collapse">
            <Icon name="chevron-down" />
          </button>
        </div>

        <div class="full-cover-wrap">
          <img class="full-cover" :src="coverFull" alt="Album cover" />
        </div>

        <div class="full-meta">
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
          <button type="button" class="icon-btn" title="Previous" aria-label="Previous" @click="playPrev">
            <Icon name="prev" />
          </button>
          <button type="button" class="icon-btn primary" title="Play / Pause" aria-label="Play / Pause" @click="togglePlay">
            <Icon :name="playIcon" />
          </button>
          <button type="button" class="icon-btn" title="Next" aria-label="Next" @click="playNext">
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
