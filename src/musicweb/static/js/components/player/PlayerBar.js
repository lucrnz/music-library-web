/**
 * Player shell: mini bar + full now-playing (NowPlayingFull).
 */
import {
  computed,
  defineComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { pl } from "../../stores/playlist.js";
import {
  player,
  playNext,
  togglePlay,
  setExpanded,
} from "../../stores/player.js";
import { settings } from "../../stores/settings.js";
import { downloads } from "../../downloads/state.js";
import Icon from "../icons/Icon.js";
import NowPlayingFull from "./NowPlayingFull.js";

const DESKTOP_BREAKPOINT = "(min-width: 900px)";

function isDesktop() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(DESKTOP_BREAKPOINT).matches
  );
}

export default defineComponent({
  name: "PlayerBar",
  components: { Icon, NowPlayingFull },
  setup() {
    const root = ref(null);
    const fullRef = ref(null);
    const desktopViewport = ref(isDesktop());
    /** Element to restore focus to after collapse (nice-to-have). */
    let focusRestoreEl = null;

    const closeIcon = computed(() =>
      desktopViewport.value ? "close" : "chevron-down"
    );
    const npModal = computed(
      () => player.expanded && !desktopViewport.value
    );

    const visible = computed(() => Boolean(pl.current) || pl.length > 0);
    const track = computed(() => pl.current);
    const title = computed(() => (track.value ? track.value.title : "—"));
    const subtitle = computed(() => {
      const t = track.value;
      if (!t) return "No track";
      return [t.artist, t.album].filter(Boolean).join(" — ") || "Unknown";
    });
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
      setExpanded(true);
      player.sheetOffset = 0;
      nextTick(() => {
        fullRef.value?.focusClose?.();
      });
    }

    function onCoverOrMetaOpen(ev) {
      if (player.expanded) return;
      expand(ev);
    }

    function collapse() {
      if (!player.expanded) return;
      setExpanded(false);
      const restore = focusRestoreEl;
      focusRestoreEl = null;
      if (restore && typeof restore.focus === "function") {
        nextTick(() => restore.focus());
      }
    }

    const trackId = computed(() => track.value?.id || null);

    watch(trackId, () => {
      player.lyricsOpen = false;
    });

    function onKeydown(e) {
      if (e.key !== "Escape" || !player.expanded) return;
      if (settings.open || downloads.managerOpen) return;
      e.preventDefault();
      collapse();
    }

    let mq = null;
    function onBreakpointChange(e) {
      desktopViewport.value = e.matches;
      collapse();
    }

    onMounted(() => {
      window.addEventListener("keydown", onKeydown);
      if (typeof window !== "undefined") {
        mq = window.matchMedia(DESKTOP_BREAKPOINT);
        desktopViewport.value = mq.matches;
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
      fullRef,
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
      closeIcon,
      npModal,
      expand,
      onCoverOrMetaOpen,
      collapse,
      trackId,
      togglePlay,
      playNext,
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

      <NowPlayingFull
        ref="fullRef"
        :title="title"
        :subtitle="subtitle"
        :cover-full="coverFull"
        :play-icon="playIcon"
        :repeat-icon="repeatIcon"
        :close-icon="closeIcon"
        :np-modal="npModal"
        :seek-value="seekValue"
        :track-id="trackId"
        @collapse="collapse"
        @cover-or-meta-open="onCoverOrMetaOpen"
      />
    </div>
  `,
});
