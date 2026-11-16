"use client";

import { useEffect, useState } from "react";
import API from "@/services/api";
import "@/app/dashboard/dashboard-v2.css";
import { handleProblem, friendlyProfileError, slugifyHandle } from "@/lib/handle";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://usebyro.com").replace(/^https?:\/\//, "").replace(/\/+$/, "");

/**
 * Wraps the create-event form. Anyone who signed up to attend and now wants to host has no
 * community page yet, so ask for the few things it needs (name, username, visibility) first.
 * Accounts that already have a username see the form straight away.
 */
export default function CommunityGate({ children }) {
  const [state, setState] = useState("loading"); // loading | setup | ready
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    API.getProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setState(p?.handle ? "ready" : "setup");
      })
      // If the profile can't be read, don't stand between an organiser and their event.
      .catch(() => !cancelled && setState("ready"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") return null;
  if (state === "ready") return children;
  return <Setup profile={profile} onDone={() => setState("ready")} />;
}

function Setup({ profile, onDone }) {
  const [name, setName] = useState(profile?.display_name || "");
  const [handle, setHandle] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [isPublic, setIsPublic] = useState(profile?.is_public !== false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(profile?.avatar_url || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const shownHandle = handleEdited ? handle : slugifyHandle(name);

  const submit = async (e) => {
    e.preventDefault();
    const problem = !name.trim() ? "Add a name for your page." : handleProblem(shownHandle);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await API.updateProfile({
        display_name: name.trim(),
        handle: shownHandle.trim(),
        is_public: isPublic,
        is_complete: true,
        role: "organizer",
      });
      if (file) await API.uploadAvatar(file).catch(() => {});
      onDone();
    } catch (err) {
      setError(friendlyProfileError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dv2 flex min-h-[70vh] items-start justify-center bg-[#F6F8FB] px-4 py-8 sm:py-12">
      <form onSubmit={submit} aria-labelledby="cg-title" className="v-card flex w-full max-w-[460px] flex-col gap-5 p-[22px] sm:p-8">
        <div className="flex flex-col gap-2">
          <h1 id="cg-title" className="v-h1 !text-[28px]">Set up your community page</h1>
          <p className="v-sub leading-normal">
            Your events live on one page. People who buy tickets can follow it and hear about your next event.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span
            aria-hidden="true"
            className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[18px] text-2xl font-extrabold ${
              preview ? "bg-[#14161C] text-white" : "bg-[#F1F3F7] text-[#8A91A0]"
            }`}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              "+"
            )}
          </span>
          <label className="v-btn v-btn-s">
            {preview ? "Change photo" : "Add a photo (optional)"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setFile(f);
                setPreview(URL.createObjectURL(f));
              }}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="v-lbl">Name or community name</span>
          <input
            id="cg-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder="Lagos Run Club"
            aria-required="true"
            className="v-input"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="v-lbl">Username</span>
          <span className="flex h-11 items-center overflow-hidden rounded-xl border border-[#CBD3DF] bg-white focus-within:border-[#3669F6] focus-within:shadow-[0_0_0_4px_rgba(54,105,246,0.16)]">
            <span className="select-none whitespace-nowrap pl-3.5 text-[15px] text-[#5B6272]">{SITE}/u/</span>
            <input
              id="cg-handle"
              value={shownHandle}
              onChange={(e) => {
                setHandleEdited(true);
                setHandle(e.target.value.replace(/\s+/g, "-"));
                setError("");
              }}
              placeholder="lagos-run-club"
              aria-required="true"
              className="h-full min-w-0 flex-1 border-0 bg-transparent pl-0.5 pr-3.5 text-base text-[#14161C] outline-none"
            />
          </span>
        </label>

        <div className="flex items-center gap-3.5 rounded-2xl bg-[#F7F9FC] px-4 py-3.5">
          <span id="cg-pub" className="flex flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-extrabold">List my community publicly</span>
            <span className="v-hint">Show it on the communities page so new people can find and follow you.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={isPublic}
            aria-labelledby="cg-pub"
            onClick={() => setIsPublic((v) => !v)}
            className={`relative h-7 w-12 shrink-0 rounded-full border-0 transition-colors motion-reduce:transition-none ${
              isPublic ? "bg-[#3669F6]" : "bg-[#C9D0DC]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-[left] motion-reduce:transition-none ${
                isPublic ? "left-[23px]" : "left-[3px]"
              }`}
            />
          </button>
        </div>

        {error && (
          <p role="alert" className="m-0 text-sm font-bold text-[#B42318]">
            {error}
          </p>
        )}

        <button type="submit" disabled={saving} className="v-btn v-btn-p v-btn-lg w-full">
          {saving ? "Saving…" : "Continue to create event"}
        </button>
      </form>
    </div>
  );
}
