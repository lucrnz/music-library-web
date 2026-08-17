import { EXPORT_MIN, exportEdge, sourceCropRect, type CropView } from "@/artistArt/cropMath";

export type CropSource = ImageBitmap | HTMLImageElement;

export type ExportCropResult =
  | { ok: true; blob: Blob }
  | { ok: false; reason: "too_small" | "encode_failed" };

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type);
  });
}

export async function exportCrop(
  source: CropSource,
  view: CropView,
): Promise<ExportCropResult> {
  const rect = sourceCropRect(view);
  const edge = exportEdge(rect.size);
  if (edge < EXPORT_MIN) return { ok: false, reason: "too_small" };

  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: false, reason: "encode_failed" };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, rect.x, rect.y, rect.size, rect.size, 0, 0, edge, edge);

  const webp = await toBlob(canvas, "image/webp");
  if (webp) return { ok: true, blob: webp };
  const jpeg = await toBlob(canvas, "image/jpeg");
  if (jpeg) return { ok: true, blob: jpeg };
  return { ok: false, reason: "encode_failed" };
}
