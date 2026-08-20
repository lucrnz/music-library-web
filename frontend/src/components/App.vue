<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { ui } from "@/stores/ui";
import LibraryView from "@/components/library/LibraryView.vue";
import PlaylistView from "@/components/playlist/PlaylistView.vue";
import PlayerBar from "@/components/player/PlayerBar.vue";
import SettingsModal from "@/components/settings/SettingsModal.vue";
import DownloadsModal from "@/components/downloads/DownloadsModal.vue";
import DownloadsLibraryView from "@/components/downloads/DownloadsLibraryView.vue";
import AppDialog from "@/components/dialog/AppDialog.vue";
import ImageCropper from "@/components/artistArt/ImageCropper.vue";
import TabBar from "@/components/layout/TabBar.vue";
import RadioView from "@/components/radio/RadioView.vue";

/**
 * Shell: dual-pane library + queue (desktop CSS forces both visible).
 * Mobile hides the non-active pane via .hidden; /queue selects queue tab.
 * /radio unmounts both panes (do not CSS-hide a still-mounted LibraryView).
 */
const route = useRoute();
    const onQueue = computed(() => route.meta.pane === "queue");
    const onRadio = computed(() => route.meta.pane === "radio");
    const onDownloads = computed(() => route.meta.mode === "downloads");
</script>

<template>
    <main>
      <RadioView v-if="onRadio" />
      <template v-else>
        <DownloadsLibraryView v-if="onDownloads" :class="{ hidden: onQueue }" />
        <LibraryView v-else :class="{ hidden: onQueue }" />
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
