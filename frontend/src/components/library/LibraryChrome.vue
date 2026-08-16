<script setup lang="ts">
/**
 * Shared library shell: offline banner, view bar, ModeBar.
 * Parent supplies back/title/layout and optional action / after-bar slots.
 */

import { openSettings } from "@/stores/settings";
import Icon from "@/components/icons/Icon.vue";
import LayoutMenu from "@/components/layout/LayoutMenu.vue";
import ModeBar from "@/components/layout/ModeBar.vue";
const _props = withDefaults(defineProps<{
  ariaLabel?: string;
  title?: string;
  showBack?: boolean;
  offlineBanner?: string;
  showLayoutToggle?: boolean;
  showSettings?: boolean;
}>(), { ariaLabel: "Library", title: "", showBack: false, offlineBanner: "", showLayoutToggle: false, showSettings: true });
const emit = defineEmits<{
  back: [];
}>();
function onBack() {
      emit("back");
    }
    function onSettings() {
      openSettings();
    }
</script>

<template>
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
</template>
