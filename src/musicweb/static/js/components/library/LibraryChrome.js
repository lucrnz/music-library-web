/**
 * Shared library shell: offline banner, view bar, ModeBar.
 * Parent supplies back/title/layout and optional action / after-bar slots.
 */
import { defineComponent } from "vue";
import { openSettings } from "../../stores/settings.js";
import { toggleLibraryLayout } from "../../stores/ui.js";
import Icon from "../icons/Icon.js";
import ModeBar from "../layout/ModeBar.js";

export default defineComponent({
  name: "LibraryChrome",
  components: { Icon, ModeBar },
  props: {
    /** Section aria-label */
    ariaLabel: { type: String, default: "Library" },
    title: { type: String, default: "" },
    showBack: { type: Boolean, default: false },
    offlineBanner: { type: String, default: "" },
    showLayoutToggle: { type: Boolean, default: false },
    layoutToggleIcon: { type: String, default: "layout-grid" },
    layoutToggleLabel: { type: String, default: "Switch layout" },
    /** When false, hide settings button (rare). */
    showSettings: { type: Boolean, default: true },
  },
  emits: ["back"],
  setup(_props, { emit }) {
    function onBack() {
      emit("back");
    }
    function onToggleLayout() {
      toggleLibraryLayout();
    }
    function onSettings() {
      openSettings();
    }
    return { onBack, onToggleLayout, onSettings };
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
          <button
            v-if="showLayoutToggle"
            type="button"
            class="icon-btn"
            :title="layoutToggleLabel"
            :aria-label="layoutToggleLabel"
            @click="onToggleLayout"
          >
            <Icon :name="layoutToggleIcon" />
          </button>
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
