/**
 * Shared clipboard write + toast. Empty values do not write or toast.
 */
import { showToast } from "@/stores/ui";

export async function copyText(value: string): Promise<boolean> {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    showToast("Copied");
    return true;
  } catch {
    showToast("Could not copy");
    return false;
  }
}
