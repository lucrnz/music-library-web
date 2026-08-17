import { openImageCropper } from "@/artistArt/cropper";
import { showToast } from "@/stores/ui";

const MAX_BYTES = 8 * 1024 * 1024;

async function canDecodeImage(file: File | Blob): Promise<boolean> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const ok = bitmap.width >= 1 && bitmap.height >= 1;
      bitmap.close();
      return ok;
    } catch {
      /* Image fallback */
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalWidth >= 1 && img.naturalHeight >= 1);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    img.src = url;
  });
}

export async function openCropFromFile(
  file: File | Blob,
): Promise<Blob | null> {
  if (file.size > MAX_BYTES) {
    showToast("That photo is too large (8 MB max).");
    return null;
  }
  const ok = await canDecodeImage(file);
  if (!ok) {
    showToast("Couldn't read that image. Try JPEG or PNG.");
    return null;
  }
  return openImageCropper(file);
}

export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    const done = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => {
      done(input.files?.[0] ?? null);
    });
    input.addEventListener("cancel", () => done(null));
    input.click();
  });
}
