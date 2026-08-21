/**
 * Entity-menu key/target/toggle. Anchor/focus stay on useRowActionMenu.
 */
import { computed, ref } from "vue";
import type { ActionItem, MenuAnchor } from "@/components/menu/actionItem";
import {
  isDesktopContextMenu,
  nextOpenKey,
} from "@/components/menu/rowActionMenu";
import { useRowActionMenu } from "@/components/menu/useRowActionMenu";
import { openMenuKey, type OpenMenu } from "@/components/library/entityMenu";

export function useEntityMenu(opts: {
  itemsFor: (target: OpenMenu) => ActionItem[];
}) {
  const { menuAnchor, menuRestoreEl, closeMenu, openMenu } = useRowActionMenu();
  const menuKey = ref("");
  const menuTarget = ref<OpenMenu | null>(null);
  const menuOpen = computed(() => !!menuKey.value);
  const menuItems = computed(() => {
    const target = menuTarget.value;
    if (!target) return [];
    return opts.itemsFor(target);
  });

  function closeEntityMenu() {
    menuKey.value = "";
    menuTarget.value = null;
    closeMenu();
  }

  function openEntityMenu(
    target: OpenMenu,
    anchor: MenuAnchor,
    restoreEl?: HTMLElement | null,
  ) {
    const next = nextOpenKey(menuKey.value, openMenuKey(target));
    if (!next) {
      closeEntityMenu();
      return;
    }
    menuKey.value = next;
    menuTarget.value = target;
    openMenu(anchor, restoreEl);
  }

  function onEntityMenuClick(target: OpenMenu, e: MouseEvent) {
    const el = e.currentTarget;
    if (!(el instanceof HTMLElement)) return;
    openEntityMenu(target, { kind: "el", el }, el);
  }

  function onEntityContext(target: OpenMenu, e: MouseEvent) {
    if (!isDesktopContextMenu()) return;
    e.preventDefault();
    const current = e.currentTarget;
    const btn =
      current instanceof HTMLElement
        ? current.querySelector(".row-menu")
        : null;
    openEntityMenu(
      target,
      { kind: "point", x: e.clientX, y: e.clientY },
      btn instanceof HTMLElement ? btn : null,
    );
  }

  return {
    menuOpen,
    menuItems,
    menuAnchor,
    menuRestoreEl,
    menuKey,
    menuTarget,
    closeEntityMenu,
    openEntityMenu,
    onEntityMenuClick,
    onEntityContext,
  };
}
