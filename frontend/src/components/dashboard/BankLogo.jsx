"use client";

import { useEffect, useState } from "react";

// Bank logos from nigerianbanks.xyz: one list of {name, code, logo}, fetched once per visit.
// Matched by bank code (the same codes Paystack uses), then by name. Falls back to the
// bank's initials when there's no match, the list can't load, or the image fails.
const LIST_URL = "https://nigerianbanks.xyz/";
const CACHE_KEY = "byro_bank_logos";
let listPromise = null;

function loadBanks() {
  if (!listPromise) {
    let cached = null;
    try {
      cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    } catch {}
    listPromise = cached
      ? Promise.resolve(cached)
      : fetch(LIST_URL)
          .then((r) => (r.ok ? r.json() : []))
          .then((list) => {
            const slim = (Array.isArray(list) ? list : []).map(({ name, code, logo }) => ({ name, code, logo }));
            try {
              sessionStorage.setItem(CACHE_KEY, JSON.stringify(slim));
            } catch {}
            return slim;
          })
          .catch(() => {
            listPromise = null; // try again on the next page
            return [];
          });
  }
  return listPromise;
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\b(plc|limited|ltd|nigeria)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

function findLogo(list, code, name) {
  if (code) {
    const hit = list.find((b) => String(b.code) === String(code));
    if (hit) return hit.logo;
  }
  const n = norm(name);
  if (!n) return null;
  const hit = list.find((b) => norm(b.name) === n) || list.find((b) => norm(b.name).startsWith(n) || n.startsWith(norm(b.name)));
  return hit?.logo || null;
}

// "Guaranty Trust Bank" -> "GTB"; a one-word name keeps its first three letters.
export function bankInitials(name) {
  const words = String(name || "").replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return (words.length === 1 ? words[0].slice(0, 3) : words.map((w) => w[0]).join("").slice(0, 3)).toUpperCase();
}

export default function BankLogo({ code, name, size = 40, radius = 10 }) {
  const [logo, setLogo] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadBanks().then((list) => {
      if (!live) return;
      setLogo(findLogo(list, code, name));
      setFailed(false);
    });
    return () => {
      live = false;
    };
  }, [code, name]);

  const box = { width: size, height: size, borderRadius: radius };

  if (logo && !failed) {
    return (
      <span aria-hidden="true" className="flex shrink-0 items-center justify-center overflow-hidden border border-line bg-white" style={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" width={size} height={size} className="h-full w-full object-contain p-1" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center bg-ink font-extrabold tracking-[.04em] text-white"
      style={{ ...box, fontSize: Math.round(size * 0.28) }}
    >
      {bankInitials(name)}
    </span>
  );
}
