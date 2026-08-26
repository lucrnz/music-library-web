<script setup lang="ts">
/**
 * Player shell: mini bar + full now-playing (NowPlayingFull).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { pl } from "@/stores/playlist";
import { openQueueRail, setExpanded } from "@/stores/playerPrefs";
import { player, playNext, togglePlay } from "@/stores/player";
import { settings } from "@/stores/settings";
import { downloads } from "@/downloads/state";
import { kindForTrack } from "@/lossyKind";
import { useDesktopViewport } from "@/layout";
import Icon from "@/components/icons/Icon.vue";
import LossyMark from "@/components/lossy/LossyMark.vue";
import NowPlayingFull from "@/components/player/NowPlayingFull.vue";
import type { NowPlayingFullExpose } from "@/components/player/NowPlayingFull.vue";
import RadioMini from "@/components/radio/RadioMini.vue";
import RadioNowPlaying from "@/components/radio/RadioNowPlaying.vue";
import { radioChromeActive } from "@/stores/radio";
import { formatPlayingSubtitle } from "@/util";

const root = ref<HTMLElement | null>(null);
    const fullRef = ref<NowPlayingFullExpose | null>(null);
    const desktopViewport = useDesktopViewport();
    /** Element to restore focus to after collapse (nice-to-have). */
    let focusRestoreEl: HTMLElement | null = null;

    const npModal = computed(
      () => player.expanded && !desktopViewport.value
    );

    const route = useRoute();
    const onRadio = computed(() => route.meta.pane === "radio");
    const radioOn = computed(() => radioChromeActive());
    const desktopRadioRail = computed(
      () =>
        desktopViewport.value &&
        player.expanded &&
        player.railFace === "radio",
    );
    const desktopQueueRail = computed(
      () =>
        desktopViewport.value &&
        player.expanded &&
        player.railFace === "queue",
    );
    const visible = computed(() => {
      if (desktopRadioRail.value) return true;
      if (onRadio.value && !desktopViewport.value) return false;
      return radioOn.value || Boolean(pl.current) || pl.length > 0;
    });
    const track = computed(() => pl.current);
    const title = computed(() => (track.value ? track.value.title : "—"));
    const lossyKind = computed(() => kindForTrack(track.value));
    const subtitle = computed(() => {
      const t = track.value;
      if (!t) return "No track";
      return formatPlayingSubtitle(t) || "Unknown";
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
      if (player.expanded && player.railFace === "queue") return;
      if (ev?.currentTarget instanceof HTMLElement) {
        focusRestoreEl = ev.currentTarget;
      }
      openQueueRail();
      player.sheetOffset = 0;
      nextTick(() => {
        fullRef.value?.focusClose?.();
      });
    }

    function onCoverOrMetaOpen(ev?: Event) {
      if (player.expanded && player.railFace === "queue") return;
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

    watch(desktopViewport, () => {
      if (player.expanded && player.railFace === "radio") return;
      collapse();
    });

    onMounted(() => {
      window.addEventListener("keydown", onKeydown);
    });

    onUnmounted(() => {
      window.removeEventListener("keydown", onKeydown);
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
      <RadioMini v-if="radioOn && !desktopViewport" />
      <div v-else-if="!radioOn" class="player-mini">
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

      <RadioNowPlaying
        v-if="desktopRadioRail"
        layout="room"
        @collapse="collapse"
      />
      <RadioNowPlaying
        v-else-if="radioOn && desktopViewport && !desktopQueueRail"
        layout="bar"
      />
      <NowPlayingFull
        v-else-if="desktopQueueRail || !radioOn"
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
