"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import API from "@/services/api";
import { openCookieSettings } from "@/lib/consent";
import SectionError from "@/components/dashboard/v2/SectionError";
import Delayed from "@/components/dashboard/v2/Delayed";
import Toggle from "@/components/dashboard/settings/Toggle";

const BTN = "inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-[#D5DBE5] bg-white px-5 text-[14px] font-bold text-ink transition-colors hover:bg-[#F7F9FC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none";

// The emailed link lands here as ?export=<token>: fetch the zip while signed in and save it.
function ExportDownload() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("export");

  useEffect(() => {
    if (!token) return;
    let live = true;
    API.downloadDataExport(token)
      .then((blob) => {
        if (!live) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "byro-data.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("Your download has started");
      })
      .catch(() => toast.error("That link didn’t work", { description: "It may have expired, or it’s for a different account. Request a new download below." }))
      .finally(() => router.replace("/dashboard/settings/privacy"));
    return () => { live = false; };
  }, [token, router]);

  return null;
}

export default function PrivacySettings() {
  const [prefs, setPrefs] = useState(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const load = () => {
    setFailed(false);
    API.getPrivacy().then(setPrefs).catch(() => setFailed(true));
  };
  useEffect(() => {
    document.title = "Settings | Byro";
    load();
  }, []);

  const save = async (changes) => {
    const before = prefs;
    setPrefs({ ...prefs, ...changes });
    setSaving(true);
    try {
      setPrefs(await API.updatePrivacy(changes));
      toast.success("Saved");
    } catch (err) {
      setPrefs(before);
      toast.error("Couldn't save that setting", { description: err?.message || "Try again." });
    } finally {
      setSaving(false);
    }
  };

  const requestDownload = async () => {
    setRequesting(true);
    try {
      await API.requestDataExport();
      toast.success("Check your email", { description: "We sent you a link to download your data." });
    } catch (err) {
      toast.error("Couldn't send the link", { description: err?.message || "Try again." });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <>
      <Suspense fallback={null}><ExportDownload /></Suspense>
      <p className="v-sub -mt-2">Who can see you, and your data.</p>
      {failed ? (
        <section className="v-card"><SectionError what="your privacy settings" onRetry={load} /></section>
      ) : prefs === null ? (
        <Delayed onRetry={load}><div className="v-skel h-[300px] !rounded-[20px]" /></Delayed>
      ) : (
        <>
          <section aria-labelledby="priv-visibility" className="v-card flex flex-col px-6 py-5">
            <h2 id="priv-visibility" className="v-h2">Visibility</h2>
            <div className="mt-2 flex flex-col divide-y divide-hairline">
              <Toggle
                label="List your community on the communities page"
                hint="People can find your community in Byro’s directory. Your events stay public either way."
                on={prefs.listed}
                disabled={saving}
                onChange={() => save({ listed: !prefs.listed })}
              />
              <Toggle
                label="Show your passport on your profile"
                hint="Anyone with your profile link can see which events you’ve been to."
                on={prefs.show_passport}
                disabled={saving}
                onChange={() => save({ show_passport: !prefs.show_passport })}
              />
            </div>
          </section>

          <section aria-labelledby="priv-data" className="v-card flex flex-col px-6 py-5">
            <h2 id="priv-data" className="v-h2">Your data</h2>
            <div className="mt-2 flex flex-col divide-y divide-hairline">
              <div className="flex items-start gap-4 py-3.5">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-bold">Cookies</span>
                  <span className="v-hint">Byro uses essential cookies to keep you signed in. Analytics cookies are your choice.</span>
                </span>
                <button type="button" className={BTN} onClick={openCookieSettings}>Cookie choices</button>
              </div>
              <div className="flex items-start gap-4 py-3.5">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-bold">Download your data</span>
                  <span className="v-hint">Your events, guest lists and sales as CSV files. We email you a link when it’s ready.</span>
                </span>
                <button type="button" className={BTN} onClick={requestDownload} disabled={requesting}>
                  {requesting ? "Sending…" : "Request download"}
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
