<script setup lang="ts">
/**
 * Player shell: mini bar + full now-playing (NowPlayingFull).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { pl } from "@/stores/playlist";
import { setExpanded } from "@/stores/playerPrefs";
import { player, playNext, togglePlay } from "@/stores/player";
import { settings } from "@/stores/settings";
import { downloads } from "@/downloads/state";
import { kindForTrack } from "@/lossyKind";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import NowPlayingFull from "@/components/player/NowPlayingFull.vue";
import type { NowPlayingFullExpose } from "@/components/player/NowPlayingFull.vue";

const DESKTOP_BREAKPOINT = "(min-width: 900px)";

function isDesktop() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(DESKTOP_BREAKPOINT).matches
  );
}

const root = ref<HTMLElement | null>(null);
    const fullRef = ref<NowPlayingFullExpose | null>(null);
    const desktopViewport = ref(isDesktop());
    /** Element to restore focus to after collapse (nice-to-have). */
    let focusRestoreEl: HTMLElement | null = null;

    const npModal = computed(
      () => player.expanded && !desktopViewport.value
    );

    const visible = computed(() => Boolean(pl.current) || pl.length > 0);
    const track = computed(() => pl.current);
    const title = computed(() => (track.value ? track.value.title : "—"));
    const lossyKind = computed(() => kindForTrack(track.value));
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

    function expand(ev?: Event) {
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

    function onCoverOrMetaOpen(ev?: Event) {
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

    function onKeydown(e: KeyboardEvent) {
      if (e.key !== "Escape" || !player.expanded) return;
      if (settings.open || downloads.managerOpen) return;
      e.preventDefault();
      collapse();
    }

    let mq: MediaQueryList | null = null;
    function onBreakpointChange(e: MediaQueryListEvent) {
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
</script>

<template>
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
        <LossyMark :kind="lossyKind" />
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
        :np-modal="npModal"
        :seek-value="seekValue"
        :track-id="trackId"
        @collapse="collapse"
        @cover-or-meta-open="onCoverOrMetaOpen"
      />
    </div>
</template>
