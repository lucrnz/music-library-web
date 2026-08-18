/**
 * Copy ActionItem helper. Empty values are omitted, not disabled.
 */
import { copyText } from "@/clipboard";
import type { ActionItem } from "@/components/menu/actionItem";

export function copyAction({
  id,
  label,
  value,
  run,
}: {
  id: string;
  label: string;
  value: string | null | undefined;
  run?: (text: string) => void | Promise<void>;
}): ActionItem | null {
  const text = value?.trim();
  if (!text) return null;
  return {
    id,
    label,
    icon: "copy",
    run: async () => {
      if (run) await run(text);
      else await copyText(text);
    },
  };
}
