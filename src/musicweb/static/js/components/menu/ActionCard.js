/**
 * Centered action card (viewport below 900px).
 */
import {
  defineComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
} from "vue";
import {
  acquireModalLock,
  releaseModalLock,
} from "../../stores/modalLock.js";
import ActionMenuItem from "./ActionMenuItem.js";

const LOCK = "action-menu";

export default defineComponent({
  name: "ActionCard",
  components: { ActionMenuItem },
  props: {
    items: { type: Array, required: true },
  },
  emits: ["close", "pick"],
  setup(props, { emit }) {
    const sheetEl = ref(/** @type {HTMLElement|null} */ (null));

    function enabledButtons() {
      const root = sheetEl.value;
      if (!root) return [];
      return [...root.querySelectorAll("button:not([disabled])")];
    }

    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        emit("close");
        return;
      }
      if (e.key !== "Tab") return;
      const list = enabledButtons();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    onMounted(async () => {
      acquireModalLock(LOCK);
      document.addEventListener("keydown", onKey, true);
      await nextTick();
      enabledButtons()[0]?.focus?.();
    });

    onUnmounted(() => {
      document.removeEventListener("keydown", onKey, true);
      releaseModalLock(LOCK);
    });

    return { sheetEl };
  },
  template: `
    <Teleport to="body">
      <div class="action-card" role="dialog" aria-modal="true" aria-label="Track actions">
        <div class="action-card-backdrop" @click="$emit('close')"></div>
        <div ref="sheetEl" class="action-card-sheet">
          <ActionMenuItem
            v-for="item in items"
            :key="item.id"
            :item="item"
            item-role="none"
            @pick="$emit('pick', $event)"
          />
        </div>
      </div>
    </Teleport>
  `,
});
