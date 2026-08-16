/**
 * Shared library shell: offline banner, view bar, ModeBar.
 * Parent supplies back/title/layout and optional action / after-bar slots.
 */
import { defineComponent } from "vue";
import { openSettings } from "../../stores/settings.js";
import Icon from "../icons/Icon.js";
import LayoutMenu from "../layout/LayoutMenu.js";
import ModeBar from "../layout/ModeBar.js";

export default defineComponent({
  name: "LibraryChrome",
  components: { Icon, ModeBar, LayoutMenu },
  props: {
    /** Section aria-label */
    ariaLabel: { type: String, default: "Library" },
    title: { type: String, default: "" },
    showBack: { type: Boolean, default: false },
    offlineBanner: { type: String, default: "" },
    showLayoutToggle: { type: Boolean, default: false },
    /** When false, hide settings button (rare). */
    showSettings: { type: Boolean, default: true },
  },
  emits: ["back"],
  setup(_props, { emit }) {
    function onBack() {
      emit("back");
    }
    function onSettings() {
      openSettings();
    }
    return { onBack, onSettings };
  },
  template: `
    <section id="view-library" class="view" :aria-label="ariaLabel">
      <div
        v-if="offlineBanner"
        class="offline-banner"
        role="status"
      >{{ offlineBanner }}</div>
      <div class="view-bar">
        <button
          v-if="showBack"
          type="button"
          class="icon-btn"
          title="Back"
          aria-label="Back"
          @click="onBack"
        >
          <Icon name="chevron-left" />
        </button>
        <div class="view-title">{{ title }}</div>
        <div class="view-actions">
          <slot name="actions" />
          <LayoutMenu v-if="showLayoutToggle" />
          <button
            v-if="showSettings"
            type="button"
            class="icon-btn"
            title="Settings"
            aria-label="Settings"
            aria-haspopup="dialog"
            @click="onSettings"
          >
            <Icon name="settings" />
          </button>
        </div>
      </div>

      <ModeBar />

      <slot name="after-bar" />

      <slot />
    </section>
  `,
});
