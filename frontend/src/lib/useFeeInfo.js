"use client";

import { useEffect, useState } from "react";
import API from "@/services/api";

// Fetched once per page load and shared, so every place showing the fee agrees.
let cached = null;
let inflight = null;

/** Byro's service fee in percent: { defaultPercent: "5", myPercent: "3" | undefined }. Falls back to 5%. */
export default function useFeeInfo() {
  const [info, setInfo] = useState(cached || { defaultPercent: "5" });
  useEffect(() => {
    if (cached) return;
    inflight = inflight || API.getFeeInfo()
      .then((d) => (cached = { defaultPercent: d.default_percent, myPercent: d.my_percent }))
      .catch(() => (cached = { defaultPercent: "5" }));
    let live = true;
    inflight.then((v) => live && setInfo(v));
    return () => {
      live = false;
    };
  }, []);
  return info;
}
