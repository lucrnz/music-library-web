/**
 * Shell-level themed confirm / prompt dialog.
 */
import {
  defineComponent,
  nextTick,
  onUnmounted,
  ref,
  watch,
} from "vue";
import {
  acceptDialog,
  cancelDialog,
  dialog,
} from "../../stores/dialog.js";

export default defineComponent({
  name: "AppDialog",
  setup() {
    const inputEl = ref(null);
    const confirmEl = ref(null);
    const cancelEl = ref(null);

    function onKey(e) {
      if (!dialog.open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelDialog();
        return;
      }
      if (e.key === "Enter" && dialog.mode === "prompt") {
        if (e.target === inputEl.value) {
          e.preventDefault();
          acceptDialog();
        }
      }
    }

    watch(
      () => dialog.open,
      async (open) => {
        if (open) {
          document.addEventListener("keydown", onKey, true);
          await nextTick();
          if (dialog.mode === "prompt") {
            inputEl.value?.focus?.();
            inputEl.value?.select?.();
          } else if (dialog.danger) {
            // Prefer Cancel for destructive confirms (avoids accidental Enter).
            cancelEl.value?.focus?.();
          } else {
            confirmEl.value?.focus?.();
          }
        } else {
          document.removeEventListener("keydown", onKey, true);
        }
      }
    );

    onUnmounted(() => {
      document.removeEventListener("keydown", onKey, true);
    });

    function onInput(e) {
      dialog.inputValue = e.target.value;
    }

    return {
      dialog,
      inputEl,
      confirmEl,
      cancelEl,
      cancelDialog,
      acceptDialog,
      onInput,
    };
  },
  template: `
    <div
      id="app-dialog"
      class="modal app-dialog"
      :class="{ hidden: !dialog.open }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="dialog.title ? 'app-dialog-title' : undefined"
      :aria-describedby="dialog.message ? 'app-dialog-message' : undefined"
    >
      <div class="modal-backdrop" @click="cancelDialog"></div>
      <div class="modal-sheet dialog-sheet">
        <div v-if="dialog.title" class="dialog-title" id="app-dialog-title">
          {{ dialog.title }}
        </div>
        <p
          v-if="dialog.message"
          class="dialog-message"
          id="app-dialog-message"
        >{{ dialog.message }}</p>
        <input
          v-if="dialog.mode === 'prompt'"
          ref="inputEl"
          type="text"
          class="dialog-input"
          :value="dialog.inputValue"
          :placeholder="dialog.placeholder"
          autocomplete="off"
          @input="onInput"
        />
        <div class="dialog-actions">
          <button
            ref="cancelEl"
            type="button"
            class="pill"
            @click="cancelDialog"
          >{{ dialog.cancelLabel }}</button>
          <button
            ref="confirmEl"
            type="button"
            class="pill"
            :class="{ danger: dialog.danger, primary: !dialog.danger }"
            @click="acceptDialog"
          >{{ dialog.confirmLabel }}</button>
        </div>
      </div>
    </div>
  `,
});