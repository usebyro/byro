"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import jsQR from "jsqr";
import { Providers } from "@/redux/Providers";
import API from "@/services/api";

/**
 * Check-in at the door. Full screen, one hand, dark (venues are dark), and every
 * result is a big colour so staff can see it without reading:
 *   green = in, amber = already scanned, red = do not let in.
 */

const RESULT_MS = 2200; // how long a result stays up before scanning resumes
const SAME_CODE_MS = 3500; // ignore the same code scanned again this quickly

const TONES = {
  ok: { bg: "#16A34A", title: "Checked in" },
  again: { bg: "#D97706", title: "Already checked in" },
  bad: { bg: "#DC2626", title: "Do not let in" },
};

function beep(ok) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.35));
    setTimeout(() => ctx.close(), 600);
  } catch {}
}

const timeOf = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" }) : "";

function CheckInScreen() {
  const { slug } = useParams();
  const router = useRouter();
  const token = useSelector((s) => s.auth?.token);

  const [event, setEvent] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [guests, setGuests] = useState([]);
  const [counts, setCounts] = useState({ checked_in: 0, total: 0 });
  const [mode, setMode] = useState("scan"); // scan | guests
  const [search, setSearch] = useState("");
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [cameraError, setCameraError] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(null);
  const busyRef = useRef(false);
  const lastRef = useRef({ code: "", at: 0 });
  const resultTimer = useRef(null);

  useEffect(() => {
    if (!token) router.replace(`/login?redirect=${encodeURIComponent(`/checkin/${slug}`)}`);
  }, [token, slug, router]);

  useEffect(() => {
    document.title = "Check-in | Byro";
  }, []);

  const loadGuests = useCallback(() => {
    API.getEventAttendees(slug)
      .then((res) => {
        setGuests(res.attendees || []);
        setCounts((c) => ({ checked_in: res.checked_in_count ?? c.checked_in, total: (res.attendees || []).length }));
      })
      .catch(() => {});
  }, [slug]);

  useEffect(() => {
    if (!token || !slug) return;
    API.getEvent(slug).then(setEvent).catch(() => setLoadError(true));
    loadGuests();
  }, [token, slug, loadGuests]);

  const allowed = Boolean(event?.role?.can_check_in);
  const cancelled = Boolean(event?.cancelled_at);

  const showResult = useCallback((r) => {
    clearTimeout(resultTimer.current);
    setResult(r);
    try {
      navigator.vibrate?.(r.kind === "ok" ? 60 : [90, 60, 90]);
    } catch {}
    beep(r.kind === "ok");
    resultTimer.current = setTimeout(() => {
      setResult(null);
      busyRef.current = false;
    }, RESULT_MS);
  }, []);

  const checkIn = useCallback(
    async (value) => {
      busyRef.current = true;
      try {
        const res = await API.checkInAttendee(slug, value);
        const who = res.attendee || {};
        if (res.counts) setCounts(res.counts);
        if (res.already_checked_in) {
          showResult({ kind: "again", name: who.name, tier: who.tier_name, detail: `Scanned at ${timeOf(who.checked_in_at)}` });
        } else {
          showResult({ kind: "ok", name: who.name, tier: who.tier_name, detail: who.email });
          setRecent((r) => [{ name: who.name, at: who.checked_in_at, tier: who.tier_name }, ...r].slice(0, 6));
          setGuests((g) => g.map((x) => (x.ticket_id === who.ticket_id ? { ...x, checked_in: true } : x)));
        }
      } catch (err) {
        showResult({ kind: "bad", name: "Not valid", detail: err?.message || "This ticket can't be used." });
      }
    },
    [slug, showResult],
  );

  // ---- camera ----
  const stopCamera = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && !busyRef.current) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(img.data, img.width, img.height);
      if (code?.data) {
        const now = Date.now();
        if (code.data !== lastRef.current.code || now - lastRef.current.at > SAME_CODE_MS) {
          lastRef.current = { code: code.data, at: now };
          checkIn(code.data);
        }
      }
    }
    frameRef.current = requestAnimationFrame(tick);
  }, [checkIn]);

  useEffect(() => {
    if (!allowed || cancelled || mode !== "scan") {
      stopCamera();
      return;
    }
    setCameraError("");
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        setTorchAvailable(Boolean(track?.getCapabilities?.().torch));
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        frameRef.current = requestAnimationFrame(tick);
      })
      .catch(() => setCameraError("Couldn't open the camera. Allow camera access, or use the Guests tab to check people in by name."));
    return stopCamera;
  }, [allowed, cancelled, mode, tick, stopCamera]);

  useEffect(() => () => clearTimeout(resultTimer.current), []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    try {
      await track?.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((t) => !t);
    } catch {}
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? guests.filter((g) =>
          [g.current_owner_name, g.current_owner_email].some((v) => (v || "").toLowerCase().includes(q)),
        )
      : guests;
    return list.slice(0, 60);
  }, [guests, search]);

  if (!token) return null;

  const tone = result ? TONES[result.kind] : null;

  return (
    <div className="min-h-screen bg-[#0B0D12] text-white flex flex-col" style={{ fontFamily: "var(--font-body), system-ui, sans-serif" }}>
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <Link href={`/dashboard/events/${slug}`} aria-label="Back to the event" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold tracking-[0.12em] text-white/60">CHECK-IN</p>
          <h1 className="text-base font-bold truncate">{event?.name || "…"}</h1>
        </div>
        <div className="shrink-0 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-extrabold tabular-nums" aria-live="polite">
          {counts.checked_in} <span className="text-white/50">/ {counts.total}</span>
        </div>
      </header>

      {loadError ? (
        <p className="p-6 text-center text-white/80">Couldn&apos;t load this event. Check your connection and refresh.</p>
      ) : !event ? (
        <p className="p-6 text-center text-white/60">Loading…</p>
      ) : !allowed ? (
        <p className="p-6 text-center text-white/80">You don&apos;t have check-in access for this event. Ask the organiser to add you as a co-host.</p>
      ) : cancelled ? (
        <p className="p-6 text-center text-white/80">This event was cancelled, so there is nobody to check in.</p>
      ) : (
        <>
          <div className="px-4 pt-3">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/10 p-1" role="tablist" aria-label="Check-in mode">
              {[["scan", "Scan"], ["guests", "Guests"]].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => setMode(id)}
                  className={`h-11 rounded-lg text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${mode === id ? "bg-white text-[#14161C]" : "text-white/80"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode === "scan" ? (
            <main className="flex-1 flex flex-col px-4 pt-3 pb-6 gap-3">
              <div className="relative w-full aspect-[3/4] max-h-[62vh] overflow-hidden rounded-3xl bg-black">
                <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                {!cameraError && (
                  <div className="absolute inset-[14%] rounded-3xl border-2 border-white/70 pointer-events-none" aria-hidden="true" />
                )}
                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/90 px-6">
                    <p className="text-center text-sm text-white/90">{cameraError}</p>
                  </div>
                )}
                {torchAvailable && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    aria-pressed={torchOn}
                    className="absolute right-3 bottom-3 h-11 rounded-full bg-white/90 px-4 text-sm font-bold text-[#14161C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    {torchOn ? "Torch on" : "Torch"}
                  </button>
                )}

                {result && (
                  <div
                    role="status"
                    aria-live="assertive"
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center"
                    style={{ background: tone.bg }}
                    onClick={() => { clearTimeout(resultTimer.current); setResult(null); busyRef.current = false; }}
                  >
                    <p className="text-sm font-extrabold tracking-[0.12em] uppercase opacity-90">{tone.title}</p>
                    <p className="font-display text-4xl font-bold leading-tight break-words">{result.name}</p>
                    {result.tier && <p className="text-lg font-bold opacity-95">{result.tier}</p>}
                    {result.detail && <p className="text-base opacity-90 break-words">{result.detail}</p>}
                    <p className="mt-3 text-xs opacity-80">Tap to scan the next ticket</p>
                  </div>
                )}
              </div>

              <p className="text-center text-sm text-white/60">Point the camera at a ticket&apos;s QR code.</p>

              {recent.length > 0 && (
                <section aria-label="Recent check-ins" className="mt-1">
                  <p className="text-xs font-extrabold tracking-[0.1em] text-white/50 mb-2">RECENT</p>
                  <ul className="divide-y divide-white/10 rounded-2xl bg-white/5">
                    {recent.map((r, i) => (
                      <li key={`${r.at}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span className="font-bold truncate">{r.name}</span>
                        <span className="shrink-0 text-white/60">{r.tier} · {timeOf(r.at)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </main>
          ) : (
            <main className="flex-1 px-4 pt-3 pb-8">
              <label htmlFor="guest-search" className="sr-only">Search guests</label>
              <input
                id="guest-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
                autoComplete="off"
                className="w-full h-12 rounded-xl bg-white/10 px-4 text-base text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white"
              />
              <ul className="mt-3 divide-y divide-white/10 rounded-2xl bg-white/5">
                {filtered.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-white/60">{guests.length ? "Nobody matches that." : "No guests yet."}</li>
                )}
                {filtered.map((g) => (
                  <li key={g.ticket_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate">{g.current_owner_name}</p>
                      <p className="text-sm text-white/60 truncate">{g.tier_name || "General admission"} · {g.current_owner_email}</p>
                    </div>
                    {g.checked_in ? (
                      <span className="shrink-0 rounded-full bg-[#16A34A]/20 px-3 py-1.5 text-sm font-bold text-[#4ADE80]">In</span>
                    ) : (
                      <button
                        type="button"
                        disabled={result !== null}
                        onClick={() => checkIn(g.qr_token)}
                        className="shrink-0 h-11 rounded-full bg-white px-4 text-sm font-bold text-[#14161C] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                      >
                        Check in
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {result && (
                <div role="status" className="fixed inset-x-4 bottom-4 rounded-2xl px-5 py-4 text-center" style={{ background: tone.bg }}>
                  <p className="text-xs font-extrabold tracking-[0.12em] uppercase opacity-90">{tone.title}</p>
                  <p className="text-xl font-bold break-words">{result.name}</p>
                  {result.detail && <p className="text-sm opacity-90 break-words">{result.detail}</p>}
                </div>
              )}
            </main>
          )}
        </>
      )}
    </div>
  );
}

export default function CheckInPage() {
  return (
    <Providers>
      <CheckInScreen />
    </Providers>
  );
}
