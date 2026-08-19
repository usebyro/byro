"use client";

import { useState, useEffect, Suspense } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  Camera01Icon,
  MusicNote01Icon,
  Moon02Icon,
  FootballIcon,
  Mic01Icon,
  HappyIcon,
  FireworksIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { authSuccess } from "@/redux/auth/authSlice";
import API from "@/services/api";
import { toast } from "sonner";

const PREFERENCES = [
  { id: "entertainment", label: "Concerts",    icon: MusicNote01Icon },
  { id: "art_culture",   label: "Nightlife",   icon: Moon02Icon },
  { id: "fitness",       label: "Sports",      icon: FootballIcon },
  { id: "conference",    label: "Conferences", icon: Mic01Icon },
  { id: "comedy",        label: "Comedy",      icon: HappyIcon },
  { id: "festivals",     label: "Festivals",   icon: FireworksIcon },
];

function ProfilePageContent() {
  const router   = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useDispatch();
  const { user, token } = useSelector((s) => s.auth);
  const [profile,     setProfile]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [isSaving,    setIsSaving]    = useState(false);
  const [avatarFile,  setAvatarFile]  = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [preferences, setPreferences] = useState([]);

  const [form, setForm] = useState({
    display_name: "",
    handle:       "",
    bio:          "",
    location:     "",
    website:      "",
    twitter:      "",
    instagram:    "",
    linkedin:     "",
    telegram:     "",
  });

  // ── Load profile ──
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    API.getProfile()
      .then((data) => {
        setProfile(data);
        setAvatarPreview(data.avatar_url || "");
        setForm({
          display_name: data.display_name || "",
          handle:       data.handle       || "",
          bio:          data.bio          || "",
          location:     data.location     || "",
          website:      data.website      || "",
          twitter:      data.twitter      || "",
          instagram:    data.instagram    || "",
          linkedin:     data.linkedin     || "",
          telegram:     data.telegram     || "",
        });
      })
      .catch(() => {
        // Fallback to Redux state if API fails
        const fallback = {
          display_name: user?.displayName || user?.display_name || user?.name || "",
          email:        user?.email || "",
          avatar_url:   user?.avatar_url || null,
          handle:       user?.handle || "",
        };
        setProfile(fallback);
        setAvatarPreview(fallback.avatar_url || "");
        setForm((f) => ({ ...f, display_name: fallback.display_name, handle: fallback.handle }));
      })
      .finally(() => setLoading(false));
  }, [token]);

  // ── Redirect if not authenticated ──
  useEffect(() => {
    if (!loading && !token && !user) {
      router.push("/");
    }
  }, [loading, token, user, router]);

  // ── Welcome new users into profile setup ──
  useEffect(() => {
    if (searchParams.get("onboarding") === "1") {
      toast.message("Welcome to Byro!", { description: "Let's finish setting up your profile." });
    }
  }, [searchParams]);

  const field = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!form.display_name.trim()) {
      toast.error("Display name is required.");
      return;
    }
    setIsSaving(true);
    try {
      // 1. Upload avatar if changed
      if (avatarFile) {
        const res = await API.uploadAvatar(avatarFile);
        setAvatarPreview(res.avatar_url);
        setAvatarFile(null);
      }

      // 2. Save profile fields
      const updated = await API.updateProfile(form);
      setProfile(updated);
      setForm({
        display_name: updated.display_name || "",
        handle:       updated.handle       || "",
        bio:          updated.bio          || "",
        location:     updated.location     || "",
        website:      updated.website      || "",
        twitter:      updated.twitter      || "",
        instagram:    updated.instagram    || "",
        linkedin:     updated.linkedin     || "",
        telegram:     updated.telegram     || "",
      });

      // 3. Sync Redux
      dispatch(authSuccess({
        user: { ...user, display_name: updated.display_name, handle: updated.handle, avatar_url: updated.avatar_url },
        token,
      }));

      toast.success("Profile saved!");
    } catch (err) {
      toast.error(err?.message || "Failed to save profile.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600" />
      </div>
    );
  }

  const displayName = profile?.display_name || user?.displayName || user?.name || "You";
  const initials    = displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
  const avatarUrl   = profile?.avatar_url || user?.avatar_url || null;

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Profile</h1>
        <p className="text-sm text-gray-400">Manage how you appear on Byro.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-8">

        <div className="flex items-center justify-between mb-6 pb-5 border-b border-gray-100">
          <div>
            {profile?.email && <p className="text-xs text-gray-400">{profile.email}</p>}
            {profile?.handle && (
              <Link
                href={`/u/${profile.handle}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900 transition-colors mt-0.5"
              >
                View public profile
                <HugeiconsIcon icon={ArrowRight01Icon} size={12} />
              </Link>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white rounded-full text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <HugeiconsIcon icon={Tick02Icon} size={13} />
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>

        {/* Avatar upload */}
        <div className="flex items-center gap-5 pb-6 mb-6 border-b border-gray-50">
          <div className="w-[72px] h-[72px] rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white text-xl font-bold shrink-0 overflow-hidden">
            {avatarPreview || avatarUrl ? (
              <img src={avatarPreview || avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 mb-1">Profile photo</p>
            <p className="text-xs text-gray-400 mb-3">JPG or PNG, at least 200×200px.</p>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors text-gray-700 cursor-pointer">
              <HugeiconsIcon icon={Camera01Icon} size={12} />
              Upload photo
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </label>
          </div>
        </div>

        {/* Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Display name *" value={form.display_name} onChange={(v) => field("display_name", v)} placeholder="Eko Live Entertainment" />

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Public handle</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none select-none">usebyro.com/u/</span>
              <input
                type="text"
                value={form.handle}
                onChange={(e) => field("handle", e.target.value)}
                className="w-full border border-gray-200 rounded-xl pl-[118px] pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                placeholder="eko-live"
              />
            </div>
          </div>

          <Field label="Location" value={form.location} onChange={(v) => field("location", v)} placeholder="Lagos, Nigeria" />
          <Field label="Website" value={form.website} onChange={(v) => field("website", v)} placeholder="https://example.com" type="url" />

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => field("bio", e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none"
              placeholder="Tell people about yourself or your organisation…"
            />
          </div>

          {/* Socials */}
          <div className="md:col-span-2 pt-4 border-t border-gray-50">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Social links</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <SocialField prefix="x.com/"         label="Twitter / X" value={form.twitter}   onChange={(v) => field("twitter",   v)} placeholder="handle" />
              <SocialField prefix="instagram.com/"  label="Instagram"   value={form.instagram} onChange={(v) => field("instagram", v)} placeholder="handle" />
              <SocialField prefix="linkedin.com/in/" label="LinkedIn"   value={form.linkedin}  onChange={(v) => field("linkedin",  v)} placeholder="username" />
              <SocialField prefix="t.me/"            label="Telegram"   value={form.telegram}  onChange={(v) => field("telegram",  v)} placeholder="handle" />
            </div>
          </div>

          {/* Preferences */}
          <div className="md:col-span-2 pt-4 border-t border-gray-50">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Event preferences</p>
            <div className="flex flex-wrap gap-2">
              {PREFERENCES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setPreferences((p) => p.includes(cat.id) ? p.filter((x) => x !== cat.id) : [...p, cat.id])}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    preferences.includes(cat.id)
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <HugeiconsIcon icon={cat.icon} size={12} color="currentColor" />
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfilePageContent />
    </Suspense>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        placeholder={placeholder}
      />
    </div>
  );
}

function SocialField({ label, prefix, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none select-none">{prefix}</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ paddingLeft: `${prefix.length * 6.5 + 12}px` }}
          className="w-full border border-gray-200 rounded-lg pr-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
