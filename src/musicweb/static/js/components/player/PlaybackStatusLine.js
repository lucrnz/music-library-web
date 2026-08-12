/**
 * Expanded now-playing delivery status + Playback details deep dive.
 * Owns open state (one flag) and mobile modal vs desktop popover chrome.
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
import {
  buildPlaybackDetailsRows,
  formatPrimaryStatus,
  formatStatusAriaLabel,
} from "../../playbackStatus.js";
import { acquireModalLock, releaseModalLock } from "../../stores/modalLock.js";
import { player } from "../../stores/player.js";
import { settings } from "../../stores/settings.js";
import Icon from "../icons/Icon.js";
import PlaybackDetailsBody from "./PlaybackDetailsBody.js";

const DESKTOP_BREAKPOINT = "(min-width: 900px)";
const DETAILS_MODAL_LOCK = "playback-details";

function isCoarsePointer() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: none)").matches
  );
}

export default defineComponent({
  name: "PlaybackStatusLine",
  components: { Icon, PlaybackDetailsBody },
  setup() {
    const statusBtn = ref(null);
    const detailsCloseBtn = ref(null);
    const statusWrap = ref(null);
    const popoverEl = ref(null);

    /** Single open flag — chrome is modal vs popover by breakpoint. */
    const detailsOpen = ref(false);
    const desktopViewport = ref(
      typeof window !== "undefined" &&
        window.matchMedia(DESKTOP_BREAKPOINT).matches
    );

    let hoverInside = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let hoverCloseTimer = null;
    let docListenersOn = false;
    /** True while we hold the body scroll lock for the mobile modal. */
    let heldModalLock = false;

    /** @type {MediaQueryList | null} */
    let desktopMql = null;
    function onDesktopMqlChange(e) {
      desktopViewport.value = e.matches;
    }

    const statusSnapshot = computed(() => ({
      playSource: player.playSource,
      playProfileId: player.playProfileId,
      playBlockReason: player.playBlockReason,
    }));

    const primaryStatus = computed(() =>
      formatPrimaryStatus(statusSnapshot.value, settings.options)
    );

    const statusAriaLabel = computed(() =>
      formatStatusAriaLabel(statusSnapshot.value, settings.options)
    );

    const detailsRows = computed(() =>
      buildPlaybackDetailsRows(statusSnapshot.value, settings.options)
    );

    function clearHoverCloseTimer() {
      if (hoverCloseTimer != null) {
        clearTimeout(hoverCloseTimer);
        hoverCloseTimer = null;
      }
    }

    function onDocPointerDown(e) {
      if (!detailsOpen.value || !desktopViewport.value) return;
      const t = e.target;
      if (statusWrap.value?.contains(t) || popoverEl.value?.contains(t)) {
        return;
      }
      closeDetails();
    }

    function onDocKey(e) {
      if (e.key !== "Escape" || !detailsOpen.value) return;
      e.preventDefault();
      e.stopPropagation();
      closeDetails();
      nextTick(() => statusBtn.value?.focus?.());
    }

    function attachDocListeners() {
      if (docListenersOn || typeof document === "undefined") return;
      document.addEventListener("pointerdown", onDocPointerDown, true);
      document.addEventListener("keydown", onDocKey, true);
      docListenersOn = true;
    }

    function detachDocListeners() {
      if (!docListenersOn || typeof document === "undefined") return;
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onDocKey, true);
      docListenersOn = false;
    }

    function releaseHeldModalLock() {
      if (!heldModalLock) return;
      releaseModalLock(DETAILS_MODAL_LOCK);
      heldModalLock = false;
    }

    function closeDetails() {
      clearHoverCloseTimer();
      hoverInside = false;
      if (detailsOpen.value) {
        releaseHeldModalLock();
        detailsOpen.value = false;
      }
      detachDocListeners();
    }

    function openDetails() {
      if (!primaryStatus.value.interactive) return;
      if (detailsOpen.value) return;
      detailsOpen.value = true;
      if (!desktopViewport.value) {
        acquireModalLock(DETAILS_MODAL_LOCK);
        heldModalLock = true;
        nextTick(() => detailsCloseBtn.value?.focus?.());
      }
      attachDocListeners();
    }

    function onStatusActivate() {
      if (!primaryStatus.value.interactive) return;
      if (desktopViewport.value) {
        // Touch / no-hover: toggle. Fine pointer: open only if closed
        // (hover owns open; avoid click-after-hover instantly closing).
        if (isCoarsePointer()) {
          if (detailsOpen.value) closeDetails();
          else openDetails();
        } else if (!detailsOpen.value) {
          openDetails();
        }
      } else if (detailsOpen.value) {
        closeDetails();
      } else {
        openDetails();
      }
    }

    function onStatusPointerEnter() {
      if (!desktopViewport.value || !primaryStatus.value.interactive) return;
      clearHoverCloseTimer();
      hoverInside = true;
      openDetails();
    }

    function onStatusPointerLeave() {
      if (!desktopViewport.value) return;
      hoverInside = false;
      clearHoverCloseTimer();
      hoverCloseTimer = setTimeout(() => {
        if (!hoverInside) closeDetails();
      }, 120);
    }

    function onPopoverPointerEnter() {
      if (!desktopViewport.value) return;
      clearHoverCloseTimer();
      hoverInside = true;
    }

    function onPopoverPointerLeave() {
      if (!desktopViewport.value) return;
      hoverInside = false;
      clearHoverCloseTimer();
      hoverCloseTimer = setTimeout(() => {
        if (!hoverInside) closeDetails();
      }, 120);
    }

    function onStatusFocus() {
      if (!desktopViewport.value || !primaryStatus.value.interactive) return;
      openDetails();
    }

    function onStatusBlur(e) {
      if (!desktopViewport.value) return;
      const next = e.relatedTarget;
      if (
        next &&
        (statusWrap.value?.contains(next) || popoverEl.value?.contains(next))
      ) {
        return;
      }
      clearHoverCloseTimer();
      hoverCloseTimer = setTimeout(() => {
        if (
          !hoverInside &&
          !statusWrap.value?.contains(document.activeElement)
        ) {
          closeDetails();
        }
      }, 0);
    }

    watch(
      () => player.playSource,
      () => {
        if (!primaryStatus.value.interactive) closeDetails();
      }
    );

    // Cross-breakpoint while open: swap modal lock and chrome.
    watch(desktopViewport, (desktop) => {
      if (!detailsOpen.value) return;
      if (desktop) {
        releaseHeldModalLock();
      } else if (!heldModalLock) {
        acquireModalLock(DETAILS_MODAL_LOCK);
        heldModalLock = true;
      }
    });

    onMounted(() => {
      if (typeof window === "undefined") return;
      desktopMql = window.matchMedia(DESKTOP_BREAKPOINT);
      desktopViewport.value = desktopMql.matches;
      desktopMql.addEventListener("change", onDesktopMqlChange);
    });

    onUnmounted(() => {
      closeDetails();
      clearHoverCloseTimer();
      detachDocListeners();
      if (desktopMql) {
        desktopMql.removeEventListener("change", onDesktopMqlChange);
        desktopMql = null;
      }
    });

    return {
      statusBtn,
      detailsCloseBtn,
      statusWrap,
      popoverEl,
      primaryStatus,
      statusAriaLabel,
      detailsRows,
      detailsOpen,
      desktopViewport,
      onStatusActivate,
      onStatusPointerEnter,
      onStatusPointerLeave,
      onPopoverPointerEnter,
      onPopoverPointerLeave,
      onStatusFocus,
      onStatusBlur,
      closeDetails,
    };
  },
  template: `
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
          :name="primaryStatus.icon"
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
  `,
});
