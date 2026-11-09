"use client";

import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";

const OUT_W = 1600;
const OUT_H = 900;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function cropToFile(src, area, name) {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  // Never upscale past what the crop actually has.
  const w = Math.min(OUT_W, Math.round(area.width));
  canvas.width = w;
  canvas.height = Math.round((w * OUT_H) / OUT_W);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
  if (!blob) throw new Error("crop failed");
  const base = (name || "cover").replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

/** Frame an uploaded cover to 16:9. Calls onDone(file, previewUrl) or onCancel(). */
export default function CoverCropModal({ src, fileName, onDone, onCancel }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState(null);
  const [busy, setBusy] = useState(false);

  const onComplete = useCallback((_, pixels) => setArea(pixels), []);

  const save = async () => {
    if (!area || busy) return;
    setBusy(true);
    try {
      const file = await cropToFile(src, area, fileName);
      onDone(file, URL.createObjectURL(file));
    } catch {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Crop cover image" className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4">
      <div className="flex w-full max-w-xl flex-col gap-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Frame your cover</h3>
          <p className="text-sm text-gray-500">Drag to move, pinch or slide to zoom. This is how guests will see it.</p>
        </div>
        <div className="relative w-full overflow-hidden rounded-xl bg-gray-900" style={{ aspectRatio: "16 / 9" }}>
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={16 / 9}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onComplete}
            objectFit="cover"
          />
        </div>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Zoom"
          className="w-full"
        />
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-full border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy || !area} className="h-11 flex-1 rounded-full bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? "Saving…" : "Use this crop"}
          </button>
        </div>
      </div>
    </div>
  );
}
