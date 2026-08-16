export interface ActionItem {
  id: string;
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void | Promise<void>;
}

export type MenuAnchor =
  | { kind: "el"; el: HTMLElement }
  | { kind: "point"; x: number; y: number };
