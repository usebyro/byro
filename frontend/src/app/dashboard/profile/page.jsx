"use client";

import { useState, useEffect, Suspense } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Camera01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { FaGlobe, FaXTwitter, FaInstagram, FaLinkedinIn, FaTelegram } from "react-icons/fa6";
import { authSuccess } from "@/redux/auth/authSlice";
import API from "@/services/api";
import { toast } from "sonner";
import Avatar from "@/components/ui/Avatar";

// The dashboard body falls back to Arial (globals.css). Geist is already
// bundled by the root layout, so use it here without loading anything new.
const FONT = { fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, "Segoe UI", sans-serif' };

// Flat placeholder for a missing cover (no gradients).
const COVER_FLAT = "#E3E8FF";
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

// 16px on phones so iOS doesn't zoom on focus, taller for thumbs.
const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3.5 py-3 md:py-2.5 text-base md:text-[15px] text-gray-900 " +
  "placeholder:text-gray-400 focus:outline-none focus:border-[#4F6EF7] focus:ring-2 focus:ring-[#4F6EF7]/25";

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

  const dirty =
    Boolean(avatarFile) ||
    Boolean(coverImageFile) ||
    Object.keys(EMPTY_FORM).some((k) => form[k] !== savedForm[k]);

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

  return (
    <div style={FONT} className="p-4 md:p-6 max-w-6xl mx-auto">
      <header className="mb-6 md:mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Profile</h1>
          <p className="text-[15px] text-gray-600 mt-1">This is how people see you on Byro. Tap the photo or cover to change it.</p>
        </div>
        {publicPath && (
          <Link
            href={publicPath}
            target="_blank"
            className="inline-flex items-center gap-1 min-h-[44px] md:min-h-0 text-sm font-semibold text-[#3B57D9] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F6EF7] rounded"
          >
            View public profile
            <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
          </Link>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-x-12 gap-y-8">
        {/* ── Preview (and the place to change photos): top on mobile, sticky on desktop ── */}
        <aside className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-6 self-start">
          <ProfilePreview
            form={form}
            avatarSrc={avatarSrc}
            coverSrc={coverSrc}
            onAvatarChange={handleAvatarChange}
            onCoverChange={handleCoverImageChange}
          />
        </aside>

        {/* ── Form ── */}
        <div className="lg:col-start-1 lg:row-start-1 min-w-0 divide-y divide-gray-200">
          <Section title="About you">
            <div className="grid gap-5">
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

              <Field
                id="handle"
                label="Handle"
                error={errors.handle}
                hint={form.handle ? `Your profile lives at usebyro.com/u/${form.handle}` : "Letters, numbers, dashes and underscores."}
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

              <Field id="bio" label="Bio" hint={`${form.bio.length}/${BIO_MAX}`}>
                <textarea
                  id="bio"
                  value={form.bio}
                  maxLength={BIO_MAX}
                  onChange={(e) => field("bio", e.target.value)}
                  rows={4}
                  className={`${inputCls} resize-y leading-relaxed`}
                  placeholder="Lagos-based collective throwing rooftop parties and open-mic nights."
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
          </Section>

          <Section title="Links" description="Leave any blank to hide it from your profile.">
            <div className="grid gap-4 md:grid-cols-2">
              {SOCIALS.map((s) => (
                <Field key={s.key} id={s.key} label={s.label} hideLabel>
                  <PrefixInput
                    id={s.key}
                    icon={s.icon}
                    prefix={s.prefix}
                    value={form[s.key]}
                    maxLength={100}
                    onChange={(v) => field(s.key, v)}
                    placeholder={s.placeholder}
                  />
                </Field>
              ))}
              <div className="md:col-span-2">
                <Field id="website" label="Website" hideLabel>
                  <PrefixInput
                    id="website"
                    icon={FaGlobe}
                    type="url"
                    inputMode="url"
                    value={form.website}
                    onChange={(v) => field("website", v)}
                    placeholder="https://example.com"
                  />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Visibility">
            <label className="flex items-start justify-between gap-6 cursor-pointer min-h-[44px]">
              <span id="listing-label">
                <span className="block text-[15px] font-semibold text-gray-900">List Community publicly</span>
                <span className="block text-sm text-gray-600 mt-0.5">
                  Your profile will be publicly listed on the community page
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={form.is_public}
                aria-labelledby="listing-label"
                onClick={() => field("is_public", !form.is_public)}
                className={`shrink-0 mt-0.5 w-12 h-7 md:w-11 md:h-6 rounded-full transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#4F6EF7] ${
                  form.is_public ? "bg-[#4F6EF7]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 md:w-5 md:h-5 bg-white rounded-full shadow-sm transition-transform motion-reduce:transition-none ${
                    form.is_public ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
          </Section>
        </div>
      </div>

      {/* ── Save bar: only when there is something to save ── */}
      {dirty && (
        <div
          role="region"
          aria-label="Unsaved changes"
          className="sticky bottom-3 md:bottom-4 z-20 mt-8 md:mt-10 flex items-center justify-between gap-3 rounded-xl bg-gray-900 text-white pl-4 pr-2 py-2 shadow-lg"
        >
          <p className="text-sm font-medium">Unsaved changes</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={isSaving}
              className="min-h-[44px] px-3 rounded-lg text-sm font-semibold text-gray-200 hover:bg-white/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg bg-[#4F6EF7] text-sm font-semibold text-white hover:bg-[#3F5EE7] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <HugeiconsIcon icon={Tick02Icon} size={14} />
              {isSaving ? "Saving…" : "Save changes"}
            </button>
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
    ...SOCIALS.filter((s) => form[s.key].trim()).map((s) => ({ key: s.key, label: s.label, icon: s.icon })),
    form.website.trim() && { key: "website", label: "Website", icon: FaGlobe },
  ].filter(Boolean);

  const todo = [
    !avatarSrc && "add a photo",
    !coverSrc && "add a cover image",
    !form.bio.trim() && "write a short bio",
    !form.location.trim() && "add your city",
    links.length === 0 && "add a link",
  ].filter(Boolean);

  return (
    <div>
      <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
        {/* Cover */}
        <div className="relative h-32 md:h-36" style={{ backgroundColor: COVER_FLAT }}>
          {coverSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverSrc} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          <label className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 min-h-[44px] md:min-h-0 px-3 py-2 rounded-lg bg-white/95 border border-gray-200 text-sm font-semibold text-gray-800 shadow-sm cursor-pointer hover:bg-white focus-within:ring-2 focus-within:ring-[#4F6EF7]">
            <HugeiconsIcon icon={Camera01Icon} size={14} color="currentColor" />
            {coverSrc ? "Change cover" : "Add cover"}
            <input type="file" accept="image/*" className="sr-only" onChange={onCoverChange} />
          </label>
        </div>

        <div className="px-5 pb-5">
          {/* Avatar with change badge */}
          <div className="relative -mt-12 w-24 h-24">
            <Avatar
              src={avatarSrc}
              name={name}
              className="w-24 h-24 rounded-2xl ring-4 ring-white text-3xl"
            />
            <label className="absolute -right-1.5 -bottom-1.5 w-9 h-9 md:w-8 md:h-8 rounded-full bg-white border border-gray-300 shadow-sm flex items-center justify-center text-gray-800 cursor-pointer hover:bg-gray-50 focus-within:ring-2 focus-within:ring-[#4F6EF7]">
              <HugeiconsIcon icon={Camera01Icon} size={15} color="currentColor" />
              <span className="sr-only">{avatarSrc ? "Change profile photo" : "Add profile photo"}</span>
              <input type="file" accept="image/*" className="sr-only" onChange={onAvatarChange} />
            </label>
          </div>

          <h2 className={`mt-4 text-[26px] font-bold tracking-tight leading-tight break-words ${name ? "text-gray-900" : "text-gray-400"}`}>
            {name || "Your name"}
          </h2>
          <p className="mt-1 text-sm text-gray-600 break-words">
            {form.handle ? `@${form.handle}` : "Choose a handle"}
            {form.location.trim() ? `, ${form.location.trim()}` : ""}
          </p>

          <p className={`mt-4 text-[15px] leading-relaxed break-words line-clamp-5 ${form.bio.trim() ? "text-gray-700" : "text-gray-400"}`}>
            {form.bio.trim() || "Add a short bio so people know what you host."}
          </p>

          {links.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {links.map(({ key, label, icon: Icon }) => (
                <li
                  key={key}
                  title={label}
                  className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center"
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  <span className="sr-only">{label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`px-5 py-3 border-t text-sm font-medium flex items-center gap-2 ${
          form.is_public ? "bg-emerald-50 border-emerald-100 text-emerald-800" : "bg-gray-50 border-gray-200 text-gray-600"
        }`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${form.is_public ? "bg-emerald-500" : "bg-gray-400"}`} />
          {form.is_public ? "Listed on the community page" : "Not listed. Only people with your link can find you."}
        </div>
      </div>

      <p className="mt-3 text-sm text-gray-600">
        {todo.length > 0
          ? `To finish your profile: ${todo.join(", ")}.`
          : "Your profile is complete."}
      </p>
      <p className="mt-1 text-sm text-gray-500">Photo: at least 200×200px. Cover: 1200×400px works best.</p>
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="py-7 first:pt-0 last:pb-0">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {description && <p className="text-sm text-gray-600 mt-1 max-w-prose">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ id, label, hint, error, hideLabel = false, children }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "block text-sm font-semibold text-gray-900 mb-1.5"}>{label}</label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-red-600" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

function PrefixInput({ id, icon: Icon, prefix, value, onChange, placeholder, maxLength, invalid = false, type = "text", inputMode }) {
  return (
    <div
      className={`flex rounded-lg border bg-white overflow-hidden focus-within:ring-2 ${
        invalid
          ? "border-red-500 focus-within:ring-red-500/25"
          : "border-gray-300 focus-within:border-[#4F6EF7] focus-within:ring-[#4F6EF7]/25"
      }`}
    >
      {(Icon || prefix) && (
        <span className="flex items-center gap-2 px-3 bg-gray-50 border-r border-gray-200 text-sm text-gray-500 whitespace-nowrap select-none">
          {Icon && <Icon className="w-4 h-4 text-gray-700" aria-hidden="true" />}
          {prefix}
        </span>
      )}
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="flex-1 min-w-0 px-3 py-3 md:py-2.5 text-base md:text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
        placeholder={placeholder}
      />
    </div>
  );
}
