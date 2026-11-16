"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
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

// Images this much wider than tall (or more) fill the frame well; taller or squarer ones are shown whole by default.
export const WIDE_ENOUGH = 1.4;
export const defaultMode = (w, h) => (w / h >= WIDE_ENOUGH ? "fill" : "fit");

/** Where the whole image sits inside a 16:9 frame: as large as fits, centred, never enlarged past its own size. */
export function fitLayout(w, h) {
  const frameH = Math.min(OUT_H, h);
  const frameW = Math.round((frameH * OUT_W) / OUT_H);
  const scale = Math.min(frameW / w, frameH / h, 1);
  const dw = Math.round(w * scale);
  const dh = Math.round(h * scale);
  return { frameW, frameH, dx: Math.round((frameW - dw) / 2), dy: Math.round((frameH - dh) / 2), dw, dh };
}

// The whole picture on a soft, enlarged copy of itself, so any shape fits the 16:9 frame without losing a pixel of it.
async function fitToFile(src, name) {
  const img = await loadImage(src);
  const { frameW, frameH, dx, dy, dw, dh } = fitLayout(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = frameW;
  canvas.height = frameH;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#14161C";
  ctx.fillRect(0, 0, frameW, frameH);
  // Blur without ctx.filter (Safari): draw it tiny, then stretch it back up smoothly, covering the frame.
  const tiny = document.createElement("canvas");
  tiny.width = 32;
  tiny.height = Math.max(2, Math.round((32 * frameH) / frameW));
  const cover = Math.max(tiny.width / img.naturalWidth, tiny.height / img.naturalHeight);
  const cw = img.naturalWidth * cover;
  const ch = img.naturalHeight * cover;
  const tctx = tiny.getContext("2d");
  tctx.drawImage(img, (tiny.width - cw) / 2, (tiny.height - ch) / 2, cw, ch);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tiny, 0, 0, frameW, frameH);
  ctx.fillStyle = "rgba(20,22,28,0.25)";
  ctx.fillRect(0, 0, frameW, frameH);
  ctx.drawImage(img, dx, dy, dw, dh);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
  if (!blob) throw new Error("fit failed");
  const base = (name || "cover").replace(/\.[^.]+$/, "");
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
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

/** Frame an uploaded cover to 16:9, cropped to fill or showing the whole image. Calls onDone(file, previewUrl) or onCancel(). */
export default function CoverCropModal({ src, fileName, onDone, onCancel }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("fill"); // "fill" crops to the frame; "fit" keeps the whole image

  // Any shape is welcome: a tall or square image starts out shown whole instead of cut to a strip.
  useEffect(() => {
    let live = true;
    loadImage(src).then((img) => {
      if (!live) return;
      setMode(defaultMode(img.naturalWidth, img.naturalHeight));
    }).catch(() => {});
    return () => { live = false; };
  }, [src]);

  // Lock page scroll while framing.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const onComplete = useCallback((_, pixels) => setArea(pixels), []);

  const save = async () => {
    if ((mode === "fill" && !area) || busy) return;
    setBusy(true);
    try {
      const file = mode === "fit" ? await fitToFile(src, fileName) : await cropToFile(src, area, fileName);
      onDone(file, URL.createObjectURL(file));
    } catch {
      setBusy(false);
    }
  };

  // Portal to <body> so the form's sticky header and bottom bar can't show through.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Crop cover image" className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4">
      <div className="flex w-full max-w-xl flex-col gap-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Frame your cover</h3>
          <p className="text-sm text-gray-500">
            {mode === "fit" ? "Your whole image is kept. Guests will see exactly this." : "Drag to move, pinch or use the slider to zoom. Guests will see exactly this."}
          </p>
        </div>
        <div role="group" aria-label="How to fit the image" className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1">
          {[["fit", "Show whole image"], ["fill", "Crop to fill"]].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`h-10 rounded-lg text-sm font-semibold transition-colors ${mode === value ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full overflow-hidden rounded-xl bg-gray-900" style={{ aspectRatio: "16 / 9" }}>
          {mode === "fit" ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-xl" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="Your cover, shown whole" className="absolute inset-0 h-full w-full object-contain" />
            </>
          ) : (
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
          )}
        </div>
        {mode === "fill" && (
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
        )}
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="h-11 flex-1 rounded-full border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy || (mode === "fill" && !area)} className="h-11 flex-1 rounded-full bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? "Saving…" : mode === "fit" ? "Use this image" : "Use this crop"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
