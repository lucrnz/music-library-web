/**
 * Open/close/anchor/focus restore for ActionMenu. Does not decide toggle identity.
 */
import { ref } from "vue";
import type { MenuAnchor } from "@/components/menu/actionItem";

export function useRowActionMenu() {
  const menuAnchor = ref<MenuAnchor | null>(null);
  const menuRestoreEl = ref<HTMLElement | null>(null);

  function closeMenu() {
    menuAnchor.value = null;
    menuRestoreEl.value = null;
  }

  function openMenu(anchor: MenuAnchor, restoreEl?: HTMLElement | null) {
    menuAnchor.value = anchor;
    menuRestoreEl.value = restoreEl || null;
  }

  return { menuAnchor, menuRestoreEl, closeMenu, openMenu };
}
