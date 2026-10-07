"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Camera01Icon } from "@hugeicons/core-free-icons";
import { FaGlobe, FaXTwitter, FaInstagram, FaLinkedinIn, FaTelegram } from "react-icons/fa6";
import { authSuccess } from "@/redux/auth/authSlice";
import API from "@/services/api";
import { toast } from "sonner";
import Avatar from "@/components/ui/Avatar";

// Body text uses the app's Nunito Sans (loaded in the root layout); headings use Bricolage via font-display.
const FONT = { fontFamily: 'var(--font-body), system-ui, -apple-system, "Segoe UI", sans-serif' };

const BIO_MAX = 500;

const SOCIALS = [
  { key: "twitter",   label: "X",         prefix: "x.com/",           placeholder: "handle",   icon: FaXTwitter },
  { key: "instagram", label: "Instagram", prefix: "instagram.com/",   placeholder: "handle",   icon: FaInstagram },
  { key: "linkedin",  label: "LinkedIn",  prefix: "linkedin.com/in/", placeholder: "username", icon: FaLinkedinIn },
  { key: "telegram",  label: "Telegram",  prefix: "t.me/",            placeholder: "handle",   icon: FaTelegram },
];

const EMPTY_FORM = {
  display_name: "",
  handle:       "",
  bio:          "",
  location:     "",
  website:      "",
  twitter:      "",
  instagram:    "",
  linkedin:     "",
  telegram:     "",
  is_public:    true,
};

const toForm = (data) => ({
  display_name: data?.display_name || "",
  handle:       data?.handle       || "",
  bio:          data?.bio          || "",
  location:     data?.location     || "",
  website:      data?.website      || "",
  twitter:      data?.twitter      || "",
  instagram:    data?.instagram    || "",
  linkedin:     data?.linkedin     || "",
  telegram:     data?.telegram     || "",
  is_public:    data?.is_public !== false,
});

// 16px on phones so iOS doesn't zoom on focus, 46px tall to match the rest of the redesign.
const inputCls =
  "w-full h-[46px] rounded-[14px] border border-line bg-white px-3.5 text-base md:text-[15px] text-ink " +
  "placeholder:text-faint focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";

function ProfilePageContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const dispatch     = useDispatch();
  const { user, token } = useSelector((s) => s.auth);

  const [profile,   setProfile]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [isSaving,  setIsSaving]  = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [savedForm, setSavedForm] = useState(EMPTY_FORM);
  const [errors,    setErrors]    = useState({});
  const [showMoreLinks, setShowMoreLinks] = useState(false);

  const [avatarFile,        setAvatarFile]        = useState(null);
  const [avatarPreview,     setAvatarPreview]     = useState("");
  const [coverImageFile,    setCoverImageFile]    = useState(null);
  const [coverImagePreview, setCoverImagePreview] = useState("");

  useEffect(() => {
    document.title = "Profile | Byro";
  }, []);

  // ── Load profile ──
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    API.getProfile()
      .then((data) => {
        const next = toForm(data);
        setProfile(data);
        setForm(next);
        setSavedForm(next);
        setAvatarPreview(data.avatar_url || "");
        setCoverImagePreview(data.cover_image_url || "");
      })
      .catch(() => {
        // Fall back to Redux state if the API fails
        const fallback = {
          display_name: user?.displayName || user?.display_name || user?.name || "",
          email:        user?.email || "",
          avatar_url:   user?.avatar_url || null,
          handle:       user?.handle || "",
        };
        const next = { ...EMPTY_FORM, display_name: fallback.display_name, handle: fallback.handle };
        setProfile(fallback);
        setForm(next);
        setSavedForm(next);
        setAvatarPreview(fallback.avatar_url || "");
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

  const field = (key, val) => {
    setForm((f) => ({ ...f, [key]: val }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleCoverImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverImageFile(file);
    setCoverImagePreview(URL.createObjectURL(file));
  };

  const changeCount =
    Object.keys(EMPTY_FORM).filter((k) => form[k] !== savedForm[k]).length +
    (avatarFile ? 1 : 0) +
    (coverImageFile ? 1 : 0);
  const dirty = changeCount > 0;

  const handleDiscard = () => {
    setForm(savedForm);
    setErrors({});
    setAvatarFile(null);
    setCoverImageFile(null);
    setAvatarPreview(profile?.avatar_url || "");
    setCoverImagePreview(profile?.cover_image_url || "");
  };

  const handleSave = async () => {
    if (!form.display_name.trim()) {
      setErrors({ display_name: "Add a display name so people know who you are." });
      document.getElementById("display_name")?.focus();
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

      // 1b. Upload cover image if changed
      if (coverImageFile) {
        const res = await API.uploadCoverImage(coverImageFile);
        setCoverImagePreview(res.cover_image_url);
        setCoverImageFile(null);
      }

      // 2. Save profile fields
      const updated = await API.updateProfile(form);
      const next = toForm(updated);
      setProfile(updated);
      setForm(next);
      setSavedForm(next);
      setErrors({});

      // 3. Sync Redux
      dispatch(authSuccess({
        user: { ...user, display_name: updated.display_name, handle: updated.handle, avatar_url: updated.avatar_url },
        token,
      }));

      toast.success("Changes saved");
    } catch (err) {
      const message = err?.message || "Couldn't save your changes. Try again.";
      if (/handle/i.test(message)) setErrors({ handle: message });
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Ctrl/Cmd+S saves, and the browser asks before you close the tab with unsaved changes.
  const saveRef = useRef(null);
  useEffect(() => {
    saveRef.current = handleSave;
  });
  useEffect(() => {
    if (!dirty) return;
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!isSaving) saveRef.current?.();
      }
    };
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty, isSaving]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#4F6EF7]" />
      </div>
    );
  }

  const avatarSrc  = avatarPreview || null;
  const coverSrc   = coverImagePreview || null;
  const publicPath = savedForm.handle ? `/u/${savedForm.handle}` : null;

  const hasLinks = [...SOCIALS.map((x) => x.key), "website"].some((k) => form[k].trim());
  const checks = [
    { label: "Photo",       done: Boolean(avatarSrc) },
    { label: "Bio",         done: Boolean(form.bio.trim()) },
    { label: "Location",    done: Boolean(form.location.trim()) },
    { label: "Links",       done: hasLinks },
    { label: "Cover image", done: Boolean(coverSrc) },
  ];

  // X, Instagram and Website are always there; LinkedIn and Telegram appear when used or asked for.
  const mainSocials  = SOCIALS.filter((x) => x.key === "twitter" || x.key === "instagram");
  const extraSocials = SOCIALS.filter((x) => x.key === "linkedin" || x.key === "telegram");
  const extrasVisible = showMoreLinks || extraSocials.some((x) => form[x.key].trim());

  return (
    <div style={FONT} className="p-4 md:p-8 max-w-[1180px] mx-auto text-ink">
      <header className="mb-6 md:mb-8 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex-1 min-w-[240px]">
          <h1 className="font-display text-[32px] md:text-[40px] leading-tight font-bold tracking-[-0.03em]">Profile</h1>
          <p className="text-base text-muted mt-1.5">This is your community page. Changes show on the right as you type.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {publicPath && (
            <Link
              href={publicPath}
              target="_blank"
              className="inline-flex items-center h-[46px] px-[18px] rounded-full border border-line text-sm font-bold text-ink hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              View public page
            </Link>
          )}
          {dirty && (
            <button
              type="button"
              onClick={handleDiscard}
              disabled={isSaving}
              className="h-[46px] px-4 rounded-full text-sm font-bold text-muted hover:text-ink hover:bg-mist disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || isSaving}
            title="Save changes (Ctrl or Cmd + S)"
            className="h-[46px] px-[22px] rounded-full bg-brand text-[15px] font-bold text-white hover:bg-brand-dark disabled:bg-line disabled:text-faint disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        {dirty ? `${changeCount} unsaved change${changeCount === 1 ? "" : "s"}` : ""}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-7 items-start">
        {/* ── Preview and profile strength: first on phones, sticky on desktop ── */}
        <aside className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-6 flex flex-col gap-3.5">
          <ProfilePreview
            form={form}
            avatarSrc={avatarSrc}
            coverSrc={coverSrc}
            onAvatarChange={handleAvatarChange}
            onCoverChange={handleCoverImageChange}
          />
          <ProfileStrength checks={checks} />
        </aside>

        {/* ── Form ── */}
        <div className="lg:col-start-1 lg:row-start-1 min-w-0 flex flex-col gap-[18px]">
          <Card title="About">
            <div className="grid gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field id="display_name" label="Display name" error={errors.display_name}>
                  <input
                    id="display_name"
                    type="text"
                    value={form.display_name}
                    maxLength={100}
                    onChange={(e) => field("display_name", e.target.value)}
                    aria-invalid={Boolean(errors.display_name)}
                    className={inputCls}
                    placeholder="Eko Live Entertainment"
                    autoComplete="organization"
                  />
                </Field>
                <Field id="location" label="Location">
                  <input
                    id="location"
                    type="text"
                    value={form.location}
                    maxLength={100}
                    onChange={(e) => field("location", e.target.value)}
                    className={inputCls}
                    placeholder="Lagos, Nigeria"
                    autoComplete="address-level2"
                  />
                </Field>
              </div>

              <Field
                id="handle"
                label="Handle"
                error={errors.handle}
                hint={form.handle ? undefined : "Letters, numbers, dashes and underscores."}
              >
                <PrefixInput
                  id="handle"
                  prefix="usebyro.com/u/"
                  value={form.handle}
                  maxLength={50}
                  invalid={Boolean(errors.handle)}
                  onChange={(v) => field("handle", v.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  placeholder="eko-live"
                />
              </Field>

              <Field id="bio" label="Bio" counter={`${form.bio.length}/${BIO_MAX}`}>
                <textarea
                  id="bio"
                  value={form.bio}
                  maxLength={BIO_MAX}
                  onChange={(e) => field("bio", e.target.value)}
                  rows={3}
                  className="w-full rounded-[14px] border border-line bg-white px-3.5 py-3 text-base md:text-[15px] text-ink leading-relaxed resize-none placeholder:text-faint focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
                  placeholder="Lagos-based collective throwing rooftop parties and open-mic nights."
                />
              </Field>
            </div>
          </Card>

          <Card title="Links" description="Leave any blank to hide it.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {mainSocials.map((x) => (
                <LinkInput
                  key={x.key}
                  id={x.key}
                  name={x.label}
                  icon={x.icon}
                  value={form[x.key]}
                  onChange={(v) => field(x.key, v)}
                  placeholder={x.prefix + x.placeholder}
                />
              ))}
              <LinkInput
                id="website"
                name="Website"
                icon={FaGlobe}
                value={form.website}
                onChange={(v) => field("website", v)}
                placeholder="https://example.com"
                type="url"
                inputMode="url"
              />
              {extrasVisible &&
                extraSocials.map((x) => (
                  <LinkInput
                    key={x.key}
                    id={x.key}
                    name={x.label}
                    icon={x.icon}
                    value={form[x.key]}
                    onChange={(v) => field(x.key, v)}
                    placeholder={x.prefix + x.placeholder}
                  />
                ))}
              {!extrasVisible && (
                <button
                  type="button"
                  onClick={() => setShowMoreLinks(true)}
                  className="h-[46px] rounded-[14px] border border-dashed border-[#C9D0DC] bg-white text-sm font-bold text-[#3B4252] hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  + Add LinkedIn or Telegram
                </button>
              )}
            </div>
          </Card>

          <Card title="Visibility">
            <label className="flex items-start justify-between gap-6 cursor-pointer min-h-[44px]">
              <span id="listing-label">
                <span className="block text-[15px] font-bold text-ink">List community publicly</span>
                <span className="block text-sm text-muted mt-0.5">
                  Your profile will be publicly listed on the community page
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={form.is_public}
                aria-labelledby="listing-label"
                onClick={() => field("is_public", !form.is_public)}
                className={`shrink-0 mt-0.5 w-12 h-7 md:w-11 md:h-[26px] rounded-full transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand ${
                  form.is_public ? "bg-brand" : "bg-[#C9D0DC]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 md:w-5 md:h-5 md:top-[3px] md:left-[3px] bg-white rounded-full shadow-sm transition-transform motion-reduce:transition-none ${
                    form.is_public ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
          </Card>
        </div>
      </div>

      {/* ── Phones: the header buttons scroll away, so keep Save in reach while there is something to save ── */}
      {dirty && (
        <div className="md:hidden sticky bottom-3 z-20 mt-8 flex justify-center pointer-events-none">
          <div
            role="region"
            aria-label="Unsaved changes"
            className="pointer-events-auto w-full inline-flex items-center justify-between gap-4 rounded-full bg-ink text-white pl-5 pr-1.5 py-1.5 shadow-lg"
          >
            <p className="text-sm">{changeCount} unsaved change{changeCount === 1 ? "" : "s"}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDiscard}
                disabled={isSaving}
                className="h-10 px-3.5 rounded-full text-sm font-bold text-gray-300 hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="h-10 px-4 rounded-full bg-brand text-sm font-bold text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {isSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
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

/* ── Live preview of the public /u/<handle> header. Photos are changed right here. ── */
function ProfilePreview({ form, avatarSrc, coverSrc, onAvatarChange, onCoverChange }) {
  const name = form.display_name.trim();

  const links = [
    ...SOCIALS.filter((x) => form[x.key].trim()).map((x) => ({ key: x.key, label: x.label, icon: x.icon })),
    form.website.trim() && { key: "website", label: "Website", icon: FaGlobe },
  ].filter(Boolean);

  return (
    <div className="rounded-[26px] border border-line bg-white overflow-hidden">
      {/* Cover: a dashed "add" button until there is one */}
      {coverSrc ? (
        <div className="relative h-[130px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <label className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-white/95 text-[13px] font-bold text-ink shadow-sm cursor-pointer hover:bg-white focus-within:ring-2 focus-within:ring-brand">
            <HugeiconsIcon icon={Camera01Icon} size={14} color="currentColor" />
            Change cover
            <input type="file" accept="image/*" className="sr-only" onChange={onCoverChange} />
          </label>
        </div>
      ) : (
        <label className="flex h-[130px] w-full items-center justify-center border-b border-dashed border-[#C9D0DC] bg-paper text-sm font-bold text-[#3B4252] cursor-pointer hover:bg-mist focus-within:ring-2 focus-within:ring-inset focus-within:ring-brand">
          + Add cover image · 1200×400
          <input type="file" accept="image/*" className="sr-only" onChange={onCoverChange} />
        </label>
      )}

      <div className="px-[22px] pb-[22px] flex flex-col gap-2">
        {/* Avatar with change badge */}
        <div className="relative -mt-[42px] w-[84px] h-[84px]">
          <Avatar
            src={avatarSrc}
            name={name}
            className="w-[84px] h-[84px] rounded-full ring-4 ring-white shadow-[0_6px_20px_rgba(20,22,28,0.10)] text-3xl"
          />
          <label className="absolute -right-1 -bottom-1 w-9 h-9 md:w-8 md:h-8 rounded-full bg-white border border-line shadow-sm flex items-center justify-center text-ink cursor-pointer hover:bg-mist focus-within:ring-2 focus-within:ring-brand">
            <HugeiconsIcon icon={Camera01Icon} size={15} color="currentColor" />
            <span className="sr-only">{avatarSrc ? "Change profile photo" : "Add profile photo"}</span>
            <input type="file" accept="image/*" className="sr-only" onChange={onAvatarChange} />
          </label>
        </div>

        <h2 className={`font-display text-[26px] font-bold leading-tight break-words ${name ? "text-ink" : "text-faint"}`}>
          {name || "Your name"}
        </h2>
        <p className="text-sm text-muted break-words">
          {form.handle ? `@${form.handle}` : "Choose a handle"}
          {form.location.trim() ? ` · ${form.location.trim()}` : ""}
        </p>
        <p className={`text-[15px] leading-relaxed break-words line-clamp-5 ${form.bio.trim() ? "text-ink" : "text-faint"}`}>
          {form.bio.trim() || "Add a short bio so people know what you host."}
        </p>

        {links.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-2">
            {links.map(({ key, label, icon: Icon }) => (
              <li key={key} title={label} className="w-10 h-10 rounded-full border border-line text-ink flex items-center justify-center">
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span className="sr-only">{label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`px-[22px] py-3 border-t text-sm font-semibold flex items-center gap-2 ${
        form.is_public ? "bg-mint border-[#D3EEDF] text-[#1F6B47]" : "bg-paper border-line text-muted"
      }`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${form.is_public ? "bg-stamp-green" : "bg-faint"}`} />
        {form.is_public ? "Listed on the community page" : "Not listed. Only people with your link can find you."}
      </div>
    </div>
  );
}

function ProfileStrength({ checks }) {
  const done = checks.filter((c) => c.done).length;
  return (
    <div className="rounded-[22px] border border-line bg-white p-5 flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] font-extrabold">Profile strength</span>
        <span className="text-sm font-extrabold text-brand-dark">{done} of {checks.length}</span>
      </div>
      <div
        className="h-2 rounded-full bg-hairline overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={checks.length}
        aria-valuenow={done}
        aria-label="Profile strength"
      >
        <div className="h-2 bg-brand transition-[width] motion-reduce:transition-none" style={{ width: `${(done / checks.length) * 100}%` }} />
      </div>
      <ul className="flex flex-col gap-2.5 mt-1">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-2.5 text-sm font-semibold ${c.done ? "text-muted" : "text-ink"}`}>
            <span
              aria-hidden="true"
              className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center ${
                c.done ? "border-stamp-green bg-stamp-green" : "border-[#C9D0DC] bg-white"
              }`}
            >
              {c.done && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              )}
            </span>
            {c.label}
            <span className="sr-only">{c.done ? " (done)" : " (to do)"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ title, description, children }) {
  return (
    <section className="rounded-3xl border border-line bg-white p-5 md:p-6 flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl font-bold">{title}</h2>
        {description && <p className="text-sm text-muted mt-1">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ id, label, hint, error, counter, children }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-bold text-ink mb-1.5">{label}</label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-red-600" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-muted">{hint}</p>
      ) : null}
      {counter && <p className="mt-1 text-xs text-muted text-right">{counter}</p>}
    </div>
  );
}

function PrefixInput({ id, prefix, value, onChange, placeholder, maxLength, invalid = false }) {
  return (
    <div
      className={`flex rounded-[14px] border bg-white overflow-hidden focus-within:ring-2 ${
        invalid ? "border-red-500 focus-within:ring-red-500/25" : "border-line focus-within:border-brand focus-within:ring-brand/25"
      }`}
    >
      <span className="flex items-center px-3 bg-paper border-r border-line text-sm text-muted whitespace-nowrap select-none">
        {prefix}
      </span>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="flex-1 min-w-0 h-[46px] px-3.5 text-base md:text-[15px] text-ink placeholder:text-faint focus:outline-none"
        placeholder={placeholder}
      />
    </div>
  );
}

// A single link field: brand icon on the left, then the value. The icon is the label for screen readers.
function LinkInput({ id, name, icon: Icon, value, onChange, placeholder, type = "text", inputMode }) {
  return (
    <label
      htmlFor={id}
      className="h-[46px] px-3.5 rounded-[14px] border border-line bg-white flex items-center gap-2.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25"
    >
      <Icon className="w-4 h-4 shrink-0 text-ink" aria-hidden="true" />
      <span className="sr-only">{name}</span>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        maxLength={100}
        onChange={(e) => onChange(e.target.value)}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="w-full min-w-0 bg-transparent text-base md:text-[15px] text-ink placeholder:text-faint focus:outline-none"
        placeholder={placeholder}
      />
    </label>
  );
}
