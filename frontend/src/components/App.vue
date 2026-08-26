<script setup lang="ts">
import { computed, watch, type StyleValue } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useDesktopViewport } from "@/layout";
import { ui } from "@/stores/ui";
import { openRadioRail } from "@/stores/playerPrefs";
import { player } from "@/stores/playerState";
import { setTabOpen } from "@/stores/radio";
import LibraryView from "@/components/library/LibraryView.vue";
import PlaylistView from "@/components/playlist/PlaylistView.vue";
import PlayerBar from "@/components/player/PlayerBar.vue";
import SettingsModal from "@/components/settings/SettingsModal.vue";
import DownloadsModal from "@/components/downloads/DownloadsModal.vue";
import AppDialog from "@/components/dialog/AppDialog.vue";
import ImageCropper from "@/components/artistArt/ImageCropper.vue";
import TabBar from "@/components/layout/TabBar.vue";
import PaneResizer from "@/components/layout/PaneResizer.vue";
import RadioView from "@/components/radio/RadioView.vue";

/**
 * Shell: dual-pane library + queue (desktop CSS forces both visible).
 * Mobile hides the non-active pane via .hidden; /queue selects queue tab.
 * Mobile /radio unmounts both panes (do not CSS-hide a still-mounted LibraryView).
 * Desktop /radio is chrome: library stays; App opens the radio rail and replaces the URL.
 */
const route = useRoute();
    const router = useRouter();
    const desktop = useDesktopViewport();
    const onQueue = computed(() => route.meta.pane === "queue");
    const onRadio = computed(() => route.meta.pane === "radio");
    const showRadioPage = computed(() => onRadio.value && !desktop.value);
    const showLibraryPanes = computed(() => desktop.value || !onRadio.value);
    const customLibraryPane = computed(
      () => desktop.value && ui.libraryPaneWidthPx != null,
    );
    const libraryPaneStyle = computed((): StyleValue | undefined => {
      if (!customLibraryPane.value || ui.libraryPaneWidthPx == null) {
        return undefined;
      }
      return {
        "--library-pane-w": `${ui.libraryPaneWidthPx}px`,
      };
    });

    function lastLibraryLocation() {
      return {
        name: ui.lastLibrary.name,
        params: ui.lastLibrary.params,
        query: ui.lastLibrary.query as Record<string, string | string[]>,
      };
    }

    function absorbDesktopRadio() {
      openRadioRail();
      void router.replace(lastLibraryLocation());
    }

    watch(
      () => onRadio.value && desktop.value,
      (absorb) => {
        if (absorb) absorbDesktopRadio();
      },
      { immediate: true },
    );

    watch(desktop, (isDesktop, wasDesktop) => {
      if (
        wasDesktop &&
        !isDesktop &&
        player.expanded &&
        player.railFace === "radio" &&
        !onRadio.value
      ) {
        void router.push({ name: "radio" });
      }
    });

    watch(
      () =>
        (desktop.value && player.expanded && player.railFace === "radio") ||
        (!desktop.value && onRadio.value),
      (open) => {
        setTabOpen(open);
      },
      { immediate: true },
    );
</script>

<template>
    <main
      :class="{ 'has-library-pane-width': customLibraryPane }"
      :style="libraryPaneStyle"
    >
      <RadioView v-if="showRadioPage" />
      <template v-if="showLibraryPanes">
        <LibraryView :class="{ hidden: onQueue }" />
        <PaneResizer v-if="desktop" />
        <PlaylistView :class="{ hidden: !onQueue }" />
      </template>
    </main>
    <PlayerBar />
    <SettingsModal />
    <DownloadsModal />
    <AppDialog />
    <ImageCropper />
    <TabBar />
    <div
      v-if="ui.toast"
      class="app-toast"
      role="status"
      aria-live="polite"
    >{{ ui.toast.message }}</div>
</template>
