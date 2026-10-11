"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FaGlobe, FaXTwitter, FaInstagram, FaLinkedinIn, FaTelegram } from "react-icons/fa6";
import { authSuccess } from "@/redux/auth/authSlice";
import API from "@/services/api";
import { toast } from "sonner";

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

// 16px on phones so iOS doesn't zoom on focus, 44px tall.
const inputCls =
  "w-full h-11 rounded-xl border border-[#CBD3DF] bg-white px-3.5 text-base md:text-[15px] text-ink " +
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
  const [stats, setStats] = useState(null);

  const [avatarFile,        setAvatarFile]        = useState(null);
  const [avatarPreview,     setAvatarPreview]     = useState("");
  const [coverImageFile,    setCoverImageFile]    = useState(null);
  const [coverImagePreview, setCoverImagePreview] = useState("");

  useEffect(() => {
    document.title = "Profile | Byro";
  }, []);

  // Followers and events shown in the preview.
  useEffect(() => {
    if (!token) return;
    API.getCommunityStats().then(setStats).catch(() => {});
  }, [token]);

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
    if (!form.bio.trim()) {
      setErrors({ bio: "Add a short bio so people know what you host." });
      document.getElementById("bio")?.focus();
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

  // X, Instagram and Website are always there; LinkedIn and Telegram appear when used or asked for.
  const mainSocials  = SOCIALS.filter((x) => x.key === "twitter" || x.key === "instagram");
  const extraSocials = SOCIALS.filter((x) => x.key === "linkedin" || x.key === "telegram");
  const extrasVisible = showMoreLinks || extraSocials.some((x) => form[x.key].trim());

  return (
    <div style={FONT} className="px-4 pb-12 pt-8 text-ink md:px-8 lg:px-12">
      <header className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-3">
        <div className="min-w-[240px] flex-1">
          <h1 className="font-display text-[28px] font-bold leading-[1.1] tracking-[-0.03em] md:text-[32px]">Profile</h1>
          <p className="mt-1.5 text-[15px] text-muted">This is your community page. The preview updates as you type.</p>
        </div>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={!dirty || isSaving}
          className="h-11 rounded-full border border-line bg-white px-5 text-[15px] font-bold text-ink transition-[background-color,scale] hover:bg-paper active:scale-[0.97] disabled:cursor-not-allowed disabled:border-0 disabled:bg-hairline disabled:text-muted disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || isSaving}
          title="Save changes (Ctrl or Cmd + S)"
          className="h-11 rounded-full bg-brand px-5 text-[15px] font-bold text-white transition-[background-color,scale] hover:bg-brand-dark active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-hairline disabled:text-muted disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </header>

      <p className="sr-only" aria-live="polite">
        {dirty ? `${changeCount} unsaved change${changeCount === 1 ? "" : "s"}` : ""}
      </p>

      <div className="grid grid-cols-1 items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Section title="Photo and cover" hint="Shown at the top of your community page.">
            <div className="flex items-center gap-4">
              <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink font-display text-[28px] font-bold text-white">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  initialOf(form.display_name)
                )}
              </span>
              <div className="flex flex-col gap-1.5">
                <FileButton onChange={handleAvatarChange}>{avatarSrc ? "Change photo" : "Add photo"}</FileButton>
                <span className="text-[13px] leading-normal text-muted">Square, at least 400 × 400px.</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold">Cover</span>
              <div className="relative h-[140px] overflow-hidden rounded-xl bg-mist">
                {coverSrc && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverSrc} alt="Your cover" className="h-full w-full object-cover" />
                )}
                <FileButton onChange={handleCoverImageChange} className="absolute bottom-3 right-3 !h-9 !text-[13px]">
                  {coverSrc ? "Change cover" : "Add cover"}
                </FileButton>
              </div>
              <span className="text-[13px] leading-normal text-muted">A photo from one of your events works best. 1600 × 500px.</span>
            </div>
          </Section>

          <Section title="About" hint="Who you are and where people can find you.">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field id="display_name" label="Name" error={errors.display_name}>
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

            <Field id="handle" label="Handle" error={errors.handle} hint="Changing this breaks old links to your page.">
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

            <Field id="bio" label={<>Bio <span className="text-red-500">*</span></>} error={errors.bio} counter={`${form.bio.length} / ${BIO_MAX}`}>
              <textarea
                id="bio"
                value={form.bio}
                maxLength={BIO_MAX}
                onChange={(e) => field("bio", e.target.value)}
                rows={3}
                required
                aria-invalid={Boolean(errors.bio)}
                className={`h-24 w-full resize-y rounded-xl border bg-white px-3.5 py-3 text-base leading-normal text-ink placeholder:text-faint focus:outline-none focus:ring-2 md:text-[15px] ${
                  errors.bio ? "border-red-500 focus:ring-red-500/25" : "border-[#CBD3DF] focus:border-brand focus:ring-brand/25"
                }`}
                placeholder="Lagos-based collective throwing rooftop parties and open-mic nights."
              />
            </Field>
          </Section>

          <Section title="Links" hint="Leave any blank to hide it.">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              {mainSocials.map((x) => (
                <Field key={x.key} id={x.key} label={x.label}>
                  <PrefixInput
                    id={x.key}
                    prefix={x.prefix}
                    value={form[x.key]}
                    maxLength={100}
                    onChange={(v) => field(x.key, v)}
                    placeholder={x.placeholder}
                  />
                </Field>
              ))}
              <Field id="website" label="Website">
                <input
                  id="website"
                  type="url"
                  inputMode="url"
                  value={form.website}
                  maxLength={100}
                  onChange={(e) => field("website", e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={inputCls}
                  placeholder="https://example.com"
                />
              </Field>
              {extrasVisible &&
                extraSocials.map((x) => (
                  <Field key={x.key} id={x.key} label={x.label}>
                    <PrefixInput
                      id={x.key}
                      prefix={x.prefix}
                      value={form[x.key]}
                      maxLength={100}
                      onChange={(v) => field(x.key, v)}
                      placeholder={x.placeholder}
                    />
                  </Field>
                ))}
            </div>
            {!extrasVisible && (
              <button
                type="button"
                onClick={() => setShowMoreLinks(true)}
                className="h-11 self-start rounded-full border border-dashed border-[#C9D0DC] bg-white px-4 text-sm font-bold text-[#3B4252] transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                + Add LinkedIn or Telegram
              </button>
            )}
          </Section>

          <Section title="Visibility" hint="Control where your page shows up." last>
            <div className="flex items-center gap-3.5">
              <span id="listing-label" className="flex flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-bold">List on the communities page</span>
                <span className="text-[13px] leading-normal text-muted">People can find you in byro&apos;s community directory.</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={form.is_public}
                aria-labelledby="listing-label"
                onClick={() => field("is_public", !form.is_public)}
                className={`flex h-[26px] w-11 shrink-0 rounded-full p-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
                  form.is_public ? "justify-end bg-brand" : "justify-start bg-[#C9D0DC]"
                }`}
              >
                <span className="h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(20,22,28,0.2)]" />
              </button>
            </div>
          </Section>
        </div>

        <ProfilePreview form={form} avatarSrc={avatarSrc} coverSrc={coverSrc} stats={stats} publicPath={publicPath} />
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

const initialOf = (name) => (name || "").trim().charAt(0).toUpperCase() || "?";

/* ── Live preview of the public /u/<handle> header. Photos are changed in the fields on the left. ── */
function ProfilePreview({ form, avatarSrc, coverSrc, stats, publicPath }) {
  const name = form.display_name.trim();

  const links = [
    ...SOCIALS.filter((x) => form[x.key].trim()).map((x) => ({ key: x.key, label: x.label, icon: x.icon })),
    form.website.trim() && { key: "website", label: "Website", icon: FaGlobe },
  ].filter(Boolean);

  return (
    <aside aria-label="Preview" className="flex flex-col gap-2.5 lg:sticky lg:top-0">
      <span className="text-sm font-bold text-muted">Preview</span>
      <div className="overflow-hidden rounded-[20px] border border-line bg-white">
        <div className="relative h-[110px] bg-mist">
          {coverSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverSrc} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex flex-col gap-2 px-5 pb-5">
          <span className="-mt-8 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-[3px] border-white bg-ink font-display text-2xl font-bold text-white">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              initialOf(name)
            )}
          </span>
          <span className={`break-words font-display text-[22px] font-bold leading-tight tracking-[-0.02em] ${name ? "text-ink" : "text-faint"}`}>
            {name || "Your name"}
          </span>
          <span className="break-words text-[13px] text-muted">
            {form.location.trim() || (form.handle ? `@${form.handle}` : "Add a location")}
          </span>
          <span className={`line-clamp-5 break-words text-sm leading-normal ${form.bio.trim() ? "text-[#3B4252]" : "text-faint"}`}>
            {form.bio.trim() || "Add a short bio so people know what you host."}
          </span>
          {stats && (
            <span className="text-[13px] text-muted">
              <b className="text-ink">{Number(stats.followers ?? 0).toLocaleString()}</b> followers{"  "}
              <b className="text-ink">{Number(stats.events_held ?? 0).toLocaleString()}</b> events
            </span>
          )}
          {links.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {links.map(({ key, label, icon: Icon }) => (
                <li key={key} title={label} className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">{label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`flex items-center gap-2 border-t px-5 py-3 text-[13px] font-semibold ${
          form.is_public ? "border-[#D3EEDF] bg-mint text-[#1F6B47]" : "border-line bg-paper text-muted"
        }`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${form.is_public ? "bg-stamp-green" : "bg-faint"}`} />
          {form.is_public ? "Listed on the communities page" : "Not listed. Only people with your link can find you."}
        </div>
      </div>
      {publicPath && (
        <Link
          href={publicPath}
          target="_blank"
          className="inline-flex items-center gap-1.5 self-start text-sm font-bold text-brand-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          View public page
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
          </svg>
        </Link>
      )}
    </aside>
  );
}

/* One settings group: the title on the left, the fields on the right. */
function Section({ title, hint, last = false, children }) {
  return (
    <section className={`grid grid-cols-1 gap-x-8 gap-y-4 py-7 md:grid-cols-[200px_minmax(0,1fr)] ${last ? "" : "border-b border-hairline"} first:pt-4`}>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[17px] font-bold">{title}</h2>
        {hint && <p className="text-[13px] leading-normal text-muted">{hint}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-[18px]">{children}</div>
    </section>
  );
}

// A button that opens the file picker.
function FileButton({ onChange, className = "", children }) {
  return (
    <label className={`inline-flex h-10 cursor-pointer items-center justify-center self-start rounded-full border border-line bg-white px-[18px] text-sm font-bold text-ink transition-[background-color,scale] hover:bg-paper active:scale-[0.97] focus-within:ring-2 focus-within:ring-brand ${className}`}>
      {children}
      <input type="file" accept="image/*" className="sr-only" onChange={onChange} />
    </label>
  );
}

function Field({ id, label, hint, error, counter, children }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-sm font-bold">{label}</label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-red-600" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] leading-normal text-muted">{hint}</p>
      ) : null}
      {counter && <p className="mt-1.5 text-right text-[13px] text-muted">{counter}</p>}
    </div>
  );
}

function PrefixInput({ id, prefix, value, onChange, placeholder, maxLength, invalid = false }) {
  return (
    <div
      className={`flex h-11 overflow-hidden rounded-xl border bg-white focus-within:ring-2 ${
        invalid ? "border-red-500 focus-within:ring-red-500/25" : "border-[#CBD3DF] focus-within:border-brand focus-within:ring-brand/25"
      }`}
    >
      <span className="flex select-none items-center whitespace-nowrap border-r border-line bg-paper px-3 text-sm text-muted">
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
        className="min-w-0 flex-1 px-3 text-base text-ink placeholder:text-faint focus:outline-none md:text-[15px]"
        placeholder={placeholder}
      />
    </div>
  );
}
