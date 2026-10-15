"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Toggle } from "@/components/admin/ui";

type State =
  | "checking"
  | "unsupported" // this browser can't do push
  | "install" // iPhone/iPad: only works once the admin is added to the Home Screen
  | "unconfigured" // the server has no VAPID keys yet
  | "blocked" // notifications were blocked for this site in the browser
  | "off"
  | "on";

// On admin.usebyro.com the admin is the whole site; on usebyro.com it's only under /admin/.
const swScope = () => (window.location.hostname.startsWith("admin.") ? "/" : "/admin/");

function keyBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Register the admin service worker and wait until it's running (push needs an active worker). */
async function activeWorker() {
  const reg = await navigator.serviceWorker.register("/admin-sw.js", { scope: swScope() });
  const worker = reg.installing || reg.waiting;
  if (!reg.active && worker) {
    await new Promise<void>((resolve) => {
      worker.addEventListener("statechange", () => worker.state === "activated" && resolve());
    });
  }
  return reg;
}

async function saveOnServer(sub: PushSubscription) {
  const res = await fetch("/api/admin/push", { method: "POST", body: JSON.stringify({ subscription: sub.toJSON() }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Try again.");
}

const HINT: Partial<Record<State, string>> = {
  unsupported: "This browser can't show push notifications.",
  install: "On iPhone or iPad: tap Share, then Add to Home Screen, and open the admin from there.",
  unconfigured: "Not set up on the server yet.",
  blocked: "Blocked for this site. Allow notifications in your browser's site settings, then try again.",
  off: "Get alerts on this device, even when the admin is closed.",
  on: "This device gets alerts, even when the admin is closed.",
};

/** "Push notifications on this device": one switch, per browser or phone. */
export default function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setState(iOS ? "install" : "unsupported");
      return;
    }
    try {
      const data = await fetch("/api/admin/push").then((r) => (r.ok ? r.json() : null));
      if (!data?.configured) {
        setState("unconfigured");
        return;
      }
      setPublicKey(data.public_key);
      if (Notification.permission === "denied") {
        setState("blocked");
        return;
      }
      const reg = await activeWorker();
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === "granted") {
        // Make sure the server still has it (and that it's linked to whoever is signed in now).
        await saveOnServer(sub).catch(() => {});
        setState("on");
      } else {
        setState("off");
      }
    } catch {
      setState("unsupported");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the browser's push state once on open
    check();
  }, [check]);

  const turnOn = async () => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState(permission === "denied" ? "blocked" : "off");
      return;
    }
    const reg = await activeWorker();
    const sub =
      (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    await saveOnServer(sub);
    setState("on");
    toast.success("Push notifications on", { description: "This device will get admin alerts." });
  };

  const turnOff = async () => {
    const reg = await navigator.serviceWorker.getRegistration(swScope());
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch(`/api/admin/push?${new URLSearchParams({ endpoint: sub.endpoint })}`, { method: "DELETE" }).catch(() => {});
      await sub.unsubscribe();
    }
    setState("off");
    toast.success("Push notifications off", { description: "This device won't get admin alerts." });
  };

  const flip = async () => {
    setBusy(true);
    try {
      await (state === "on" ? turnOff() : turnOn());
    } catch (err) {
      toast.error("Couldn't change push notifications", { description: (err as Error).message || "Try again." });
    } finally {
      setBusy(false);
    }
  };

  if (state === "checking") return null;
  const canFlip = state === "on" || state === "off";

  return (
    <div className="flex items-start gap-3 border-t border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-ink">Push notifications</p>
        <p className="mt-0.5 text-xs leading-snug text-muted">{HINT[state]}</p>
      </div>
      {canFlip && <Toggle on={state === "on"} label="Push notifications on this device" disabled={busy} onChange={flip} />}
    </div>
  );
}
