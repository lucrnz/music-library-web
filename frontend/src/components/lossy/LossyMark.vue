<script setup lang="ts">
/**
 * Compact lossy-source mark. Renders nothing when kind is null.
 */
import { computed } from "vue";
import { LOSSY_SOURCE_COPY } from "@/lossyKind";
import { showToast } from "@/stores/ui";
import Icon from "@/components/icons/Icon.vue";

const ICONS: Record<string, string> = {
  mp3: "fmt-mp3",
  aac: "fmt-aac",
  wma: "fmt-wma",
  lossy: "fmt-lossy",
  mixed: "fmt-lossy",
};
const props = withDefaults(defineProps<{
  kind?: string | null;
}>(), { kind: null });
const copy = LOSSY_SOURCE_COPY;
const icon = computed(() => (props.kind ? ICONS[props.kind] || null : null));
    function onActivate(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      showToast(LOSSY_SOURCE_COPY);
    }
</script>

<template>
    <button
      v-if="icon"
      type="button"
      class="lossy-mark"
      :title="copy"
      :aria-label="copy"
      @click="onActivate"
    ><Icon :name="icon" /></button>
</template>
