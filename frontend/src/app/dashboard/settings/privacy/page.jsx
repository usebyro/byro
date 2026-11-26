"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/redux/useAuth";
import API from "@/services/api";
import { openCookieSettings } from "@/lib/consent";
import SectionError from "@/components/dashboard/v2/SectionError";
import Delayed from "@/components/dashboard/v2/Delayed";
import Toggle from "@/components/dashboard/settings/Toggle";

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
  const { user } = useAuth();
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

  const community = (user?.display_name || user?.displayName || user?.name || "your community");

  return (
    <>
      <Suspense fallback={null}><ExportDownload /></Suspense>
      {failed ? (
        <section className="v-card"><SectionError what="your privacy settings" onRetry={load} /></section>
      ) : prefs === null ? (
        <Delayed onRetry={load}><div className="v-skel h-[300px] !rounded-[20px]" /></Delayed>
      ) : (
        <>
          <section aria-labelledby="pv-t" className="v-card v-bf" style={{ padding: "8px 24px 12px", "--i": 1 }}>
            <div className="s-nrow s-nhead"><h2 id="pv-t" className="v-h2" style={{ fontSize: 17 }}>Visibility</h2></div>
            <Toggle
              label="List your community on the communities page"
              hint={`People can find ${community} in Byro’s directory. Your events stay public either way.`}
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
          </section>

          <section aria-labelledby="dt-t" className="v-card v-bf" style={{ padding: "8px 24px 12px", "--i": 2 }}>
            <div className="s-nrow s-nhead"><h2 id="dt-t" className="v-h2" style={{ fontSize: 17 }}>Your data</h2></div>
            <div className="s-nrow">
              <span className="s-nlab"><b>Cookies</b><span className="v-hint">Byro uses essential cookies to keep you signed in. Analytics cookies are your choice.</span></span>
              <button type="button" className="v-btn v-btn-s v-btn-sm" onClick={openCookieSettings}>Cookie choices</button>
            </div>
            <div className="s-nrow">
              <span className="s-nlab"><b>Download your data</b><span className="v-hint">Your events, guest lists and sales as CSV files. We email you a link when it’s ready.</span></span>
              <button type="button" className="v-btn v-btn-s v-btn-sm" onClick={requestDownload} disabled={requesting}>
                {requesting ? "Sending…" : "Request download"}
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
