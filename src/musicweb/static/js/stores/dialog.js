/**
 * Global themed confirm / prompt dialogs (replaces window.confirm / prompt).
 * Mount AppDialog once in the shell; call confirmDialog / promptDialog from anywhere.
 */
import { reactive } from "vue";
import { acquireModalLock, releaseModalLock } from "./modalLock.js";

/**
 * @typedef {"confirm" | "prompt"} DialogMode
 * @typedef {{
 *   open: boolean,
 *   mode: DialogMode,
 *   title: string,
 *   message: string,
 *   confirmLabel: string,
 *   cancelLabel: string,
 *   danger: boolean,
 *   inputValue: string,
 *   placeholder: string,
 * }} DialogState
 */

/** @type {((value: boolean | string | null) => void) | null} */
let pendingResolve = null;

/** @type {DialogState} */
export const dialog = reactive({
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
 * @param {Partial<DialogState> & { mode: DialogMode }} opts
 * @returns {Promise<boolean | string | null>}
 */
function openDialog(opts) {
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

/**
 * @param {boolean | string | null} value
 */
export function settleDialog(value) {
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

/**
 * @param {{
 *   title?: string,
 *   message: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   danger?: boolean,
 * }} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog(opts) {
  return openDialog({
    mode: "confirm",
    title: opts.title || "",
    message: opts.message || "",
    confirmLabel: opts.confirmLabel,
    cancelLabel: opts.cancelLabel,
    danger: !!opts.danger,
  }).then((v) => v === true);
}

/**
 * @param {{
 *   title?: string,
 *   message?: string,
 *   defaultValue?: string,
 *   placeholder?: string,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 * }} opts
 * @returns {Promise<string | null>}
 */
export function promptDialog(opts) {
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
