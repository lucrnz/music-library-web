/**
 * Global themed confirm / prompt dialogs (replaces window.confirm / prompt).
 * Mount AppDialog once in the shell; call confirmDialog / promptDialog from anywhere.
 */
import { reactive } from "vue";
import { acquireModalLock, releaseModalLock } from "@/stores/modalLock";

export type DialogMode = "confirm" | "prompt";

export interface DialogState {
  open: boolean;
  mode: DialogMode;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  inputValue: string;
  placeholder: string;
}

export interface ConfirmDialogOpts {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptDialogOpts {
  title?: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

let pendingResolve: ((value: boolean | string | null) => void) | null = null;

export const dialog = reactive<DialogState>({
  open: false,
  mode: "confirm",
  title: "",
  message: "",
  confirmLabel: "OK",
  cancelLabel: "Cancel",
  danger: false,
  inputValue: "",
  placeholder: "",
});

/**
 * Resolve any in-flight dialog as cancelled, then open a new one.
 */
function openDialog(
  opts: Partial<DialogState> & { mode: DialogMode },
): Promise<boolean | string | null> {
  if (pendingResolve) {
    const prev = pendingResolve;
    pendingResolve = null;
    prev(dialog.mode === "prompt" ? null : false);
  }

  dialog.mode = opts.mode;
  dialog.title = opts.title || "";
  dialog.message = opts.message || "";
  dialog.confirmLabel =
    opts.confirmLabel ||
    (opts.mode === "prompt" ? "Save" : opts.danger ? "Delete" : "OK");
  dialog.cancelLabel = opts.cancelLabel || "Cancel";
  dialog.danger = !!opts.danger;
  dialog.inputValue = opts.inputValue || "";
  dialog.placeholder = opts.placeholder || "";
  dialog.open = true;
  acquireModalLock("dialog");

  return new Promise((resolve) => {
    pendingResolve = resolve;
  });
}

export function settleDialog(value: boolean | string | null) {
  if (!dialog.open && !pendingResolve) return;
  dialog.open = false;
  const resolve = pendingResolve;
  pendingResolve = null;
  releaseModalLock("dialog");
  if (resolve) resolve(value);
}

export function cancelDialog() {
  settleDialog(dialog.mode === "prompt" ? null : false);
}

export function acceptDialog() {
  if (dialog.mode === "prompt") {
    const name = String(dialog.inputValue || "").trim();
    if (!name) {
      cancelDialog();
      return;
    }
    settleDialog(name);
    return;
  }
  settleDialog(true);
}

export function confirmDialog(opts: ConfirmDialogOpts): Promise<boolean> {
  return openDialog({
    mode: "confirm",
    title: opts.title || "",
    message: opts.message || "",
    confirmLabel: opts.confirmLabel,
    cancelLabel: opts.cancelLabel,
    danger: !!opts.danger,
  }).then((v) => v === true);
}

export function promptDialog(opts: PromptDialogOpts): Promise<string | null> {
  return openDialog({
    mode: "prompt",
    title: opts.title || "",
    message: opts.message || "",
    confirmLabel: opts.confirmLabel,
    cancelLabel: opts.cancelLabel,
    danger: false,
    inputValue: opts.defaultValue || "",
    placeholder: opts.placeholder || "",
  }).then((v) => (typeof v === "string" ? v : null));
}
