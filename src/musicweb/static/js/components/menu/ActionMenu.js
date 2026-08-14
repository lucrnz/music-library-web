/**
 * Thin picker: centered card below 900px, anchored menu at/above.
 * Does not import vue-router. Caller owns route/edit close.
 */
import { defineComponent, nextTick, watch } from "vue";
import { useDesktopViewport } from "../../layout.js";
import ActionCard from "./ActionCard.js";
import AnchoredMenu from "./AnchoredMenu.js";

export default defineComponent({
  name: "ActionMenu",
  components: { ActionCard, AnchoredMenu },
  props: {
    open: { type: Boolean, default: false },
    items: { type: Array, default: () => [] },
    anchor: { type: Object, default: null },
    restoreEl: { type: Object, default: null },
  },
  emits: ["close"],
  setup(props, { emit }) {
    const desktop = useDesktopViewport();

    watch(desktop, (now, was) => {
      if (props.open && was != null && now !== was) emit("close");
    });

    async function onPick(item) {
      if (!item || item.disabled) return;
      emit("close");
      await nextTick();
      const el = props.restoreEl;
      if (el && typeof el.focus === "function" && document.contains(el)) {
        el.focus();
      }
      if (typeof item.run === "function") await item.run();
    }

    return { desktop, onPick };
  },
  template: `
    <ActionCard
      v-if="open && !desktop"
      :items="items"
      @close="$emit('close')"
      @pick="onPick"
    />
    <AnchoredMenu
      v-else-if="open && anchor"
      :items="items"
      :anchor="anchor"
      :restore-el="restoreEl"
      @close="$emit('close')"
      @pick="onPick"
    />
  `,
});
