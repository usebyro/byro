"use client";

import { useEffect, useState } from "react";
import API from "@/services/api";
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
    <div className="flex min-h-[70vh] items-center justify-center bg-[#F7F9FC] px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="font-serif text-2xl text-gray-900">Set up your community page</h1>
        <p className="mb-6 mt-2 text-sm leading-relaxed text-gray-500">
          Your events live on one page. People who buy tickets can follow it and hear about your next event.
        </p>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 text-gray-400">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden="true" className="text-xl">+</span>
              )}
            </span>
            <label className="cursor-pointer rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              {preview ? "Change photo" : "Add a photo (optional)"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setFile(f);
                  setPreview(URL.createObjectURL(f));
                }}
              />
            </label>
          </div>

          <div>
            <label htmlFor="cg-name" className="mb-1.5 block text-xs font-semibold text-gray-700">
              Name or community name <span className="text-red-500">*</span>
            </label>
            <input
              id="cg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Lagos Run Club"
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label htmlFor="cg-handle" className="mb-1.5 block text-xs font-semibold text-gray-700">
              Username <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center rounded-xl border border-gray-200 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
              <span className="select-none pl-4 text-xs text-gray-400">{SITE}/u/</span>
              <input
                id="cg-handle"
                value={shownHandle}
                onChange={(e) => {
                  setHandleEdited(true);
                  setHandle(e.target.value.replace(/\s+/g, "-"));
                }}
                placeholder="lagos-run-club"
                className="min-w-0 flex-1 rounded-xl bg-transparent py-2.5 pl-1 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-blue-600"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">List my community publicly</span>
              <span className="mt-0.5 block text-xs text-gray-500">Show it on the communities page so new people can find and follow you.</span>
            </span>
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-6 w-full rounded-full bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Continue to create event"}
        </button>
      </form>
    </div>
  );
}
