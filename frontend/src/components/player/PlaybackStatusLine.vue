<script setup lang="ts">
/**
 * Expanded now-playing delivery status + Playback details deep dive.
 * Owns open state (one flag) and mobile modal vs desktop popover chrome.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import {
  buildPlaybackDetailsRows,
  formatPrimaryStatus,
  formatStatusAriaLabel,
  type PlayStatusState,
  type ProfileMeta,
} from "@/playbackStatus";
import { exclusiveAudio } from "@/stores/exclusiveAudio";
import type { ExclusiveFaceSnapshot } from "@/exclusive/statusFace";
import { acquireModalLock, releaseModalLock } from "@/stores/modalLock";
import { settings } from "@/stores/settings";
import { useDesktopViewport } from "@/layout";
import Icon from "@/components/icons/Icon.vue";
import PlaybackDetailsBody from "@/components/player/PlaybackDetailsBody.vue";
import type { PlaybackDetailRow } from "@/components/player/PlaybackDetailsBody.vue";

const props = defineProps<{
  playState: PlayStatusState;
  exclusiveSnap: ExclusiveFaceSnapshot | null;
}>();

const DETAILS_MODAL_LOCK = "playback-details";

function isCoarsePointer() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: none)").matches
  );
}

const statusBtn = ref<HTMLButtonElement | null>(null);
const detailsCloseBtn = ref<HTMLButtonElement | null>(null);
const statusWrap = ref<HTMLElement | null>(null);
const popoverEl = ref<HTMLElement | null>(null);

/** Single open flag — chrome is modal vs popover by breakpoint. */
const detailsOpen = ref(false);
const desktopViewport = useDesktopViewport();

let hoverInside = false;
let hoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
/** True while we hold the body scroll lock for the mobile modal. */
let heldModalLock = false;

const primaryStatus = computed(() =>
  formatPrimaryStatus(
    props.playState,
    settings.options as ProfileMeta[],
    props.exclusiveSnap,
  ),
);

const statusAriaLabel = computed(() =>
  formatStatusAriaLabel(
    props.playState,
    settings.options as ProfileMeta[],
    props.exclusiveSnap,
  ),
);

const detailsRows = computed(
  () =>
    buildPlaybackDetailsRows(props.playState, settings.options as ProfileMeta[], {
      exclusiveSnap: props.exclusiveSnap,
      exclusiveFormats: exclusiveAudio.formats as ProfileMeta[],
    }) as PlaybackDetailRow[],
);

function clearHoverTimer() {
  if (hoverCloseTimer) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
  }
}

function openDetails() {
  detailsOpen.value = true;
}

function closeDetails() {
  detailsOpen.value = false;
  hoverInside = false;
  clearHoverTimer();
}

function onStatusActivate() {
  detailsOpen.value = !detailsOpen.value;
}

function onStatusPointerEnter() {
  if (isCoarsePointer() || !desktopViewport.value) return;
  hoverInside = true;
  clearHoverTimer();
  openDetails();
}

function onStatusPointerLeave() {
  if (isCoarsePointer() || !desktopViewport.value) return;
  hoverInside = false;
  clearHoverTimer();
  hoverCloseTimer = setTimeout(() => {
    if (!hoverInside) closeDetails();
  }, 200);
}

function onPopoverPointerEnter() {
  hoverInside = true;
  clearHoverTimer();
}

function onPopoverPointerLeave() {
  hoverInside = false;
  clearHoverTimer();
  hoverCloseTimer = setTimeout(() => {
    if (!hoverInside) closeDetails();
  }, 200);
}

function onStatusFocus() {
  if (desktopViewport.value && !isCoarsePointer()) openDetails();
}

function onStatusBlur() {
  if (!desktopViewport.value || isCoarsePointer()) return;
  clearHoverTimer();
  hoverCloseTimer = setTimeout(() => {
    if (!hoverInside) closeDetails();
  }, 200);
}

function onDocPointer(e: PointerEvent) {
  if (!detailsOpen.value || !desktopViewport.value) return;
  const t = e.target;
  if (!(t instanceof Node)) return;
  if (statusWrap.value?.contains(t)) return;
  if (popoverEl.value?.contains(t)) return;
  closeDetails();
}

function onDocKey(e: KeyboardEvent) {
  if (e.key === "Escape" && detailsOpen.value) {
    e.preventDefault();
    closeDetails();
    statusBtn.value?.focus?.();
  }
}

watch(detailsOpen, (open) => {
  if (open && !desktopViewport.value) {
    if (!heldModalLock) {
      acquireModalLock(DETAILS_MODAL_LOCK);
      heldModalLock = true;
    }
    nextTick(() => detailsCloseBtn.value?.focus?.());
  } else if (heldModalLock && (!open || desktopViewport.value)) {
    releaseModalLock(DETAILS_MODAL_LOCK);
    heldModalLock = false;
  }
});

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointer, true);
  document.addEventListener("keydown", onDocKey);
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", onDocPointer, true);
  document.removeEventListener("keydown", onDocKey);
  if (heldModalLock) releaseModalLock(DETAILS_MODAL_LOCK);
  clearHoverTimer();
});
</script>

<template>
    <div ref="statusWrap" class="np-status-wrap">
      <button
        v-if="primaryStatus.interactive"
        ref="statusBtn"
        type="button"
        class="np-status"
        :aria-label="statusAriaLabel"
        :aria-expanded="detailsOpen ? 'true' : 'false'"
        aria-haspopup="dialog"
        :aria-controls="detailsOpen ? (desktopViewport ? 'np-playback-details-popover' : 'np-playback-details-modal') : undefined"
        @click="onStatusActivate"
        @pointerenter="onStatusPointerEnter"
        @pointerleave="onStatusPointerLeave"
        @focus="onStatusFocus"
        @blur="onStatusBlur"
      >
        <Icon
          v-if="primaryStatus.icon"
          :name="primaryStatus.icon || ''"
          class="np-status-icon"
        />
        <span class="np-status-text">{{ primaryStatus.text }}</span>
      </button>
      <div v-else class="np-status np-status-static">
        <span class="np-status-text">{{ primaryStatus.text }}</span>
      </div>

      <div
        v-if="detailsOpen && desktopViewport"
        id="np-playback-details-popover"
        ref="popoverEl"
        class="np-status-popover"
        role="dialog"
        aria-label="Playback details"
        @pointerenter="onPopoverPointerEnter"
        @pointerleave="onPopoverPointerLeave"
      >
        <div class="np-status-popover-title">Playback details</div>
        <PlaybackDetailsBody :rows="detailsRows" />
      </div>

      <Teleport to="body">
        <div
          v-if="detailsOpen && !desktopViewport"
          id="np-playback-details-modal"
          class="modal np-playback-details-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="np-playback-details-title"
        >
          <div class="modal-backdrop" @click="closeDetails"></div>
          <div class="modal-sheet np-playback-details-sheet">
            <div class="modal-head">
              <div class="modal-title" id="np-playback-details-title">
                Playback details
              </div>
              <button
                ref="detailsCloseBtn"
                type="button"
                class="icon-btn"
                title="Close"
                aria-label="Close playback details"
                @click="closeDetails"
              >
                <Icon name="close" />
              </button>
            </div>
            <PlaybackDetailsBody :rows="detailsRows" />
          </div>
        </div>
      </Teleport>
    </div>
</template>
