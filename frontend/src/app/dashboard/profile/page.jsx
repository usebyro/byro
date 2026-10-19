"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FaGlobe, FaXTwitter, FaInstagram, FaLinkedinIn, FaTelegram, FaWhatsapp } from "react-icons/fa6";
import { authSuccess } from "@/redux/auth/authSlice";
import { handleProblem } from "@/lib/handle";
import API from "@/services/api";
import { useConfirm } from "@/components/admin/ui";
import { toast } from "sonner";
import BusyButton, { useButtonResult } from "@/components/dashboard/v2/BusyButton";

const BIO_MAX = 500;

const SOCIALS = [
  { key: "instagram", label: "Instagram",       prefix: "instagram.com/",   placeholder: "handle…",   icon: FaInstagram },
  { key: "twitter",   label: "X",               prefix: "x.com/",           placeholder: "handle…",   icon: FaXTwitter },
  { key: "whatsapp",  label: "WhatsApp group",  icon: FaWhatsapp },
  { key: "linkedin",  label: "LinkedIn",        prefix: "linkedin.com/in/", placeholder: "username…", icon: FaLinkedinIn },
  { key: "telegram",  label: "Telegram",        prefix: "t.me/",            placeholder: "handle…",   icon: FaTelegram },
];

// Same list as the backend's UserProfile.CATEGORY_CHOICES.
const CATEGORIES = [
  { value: "tech", label: "Tech" },
  { value: "music", label: "Music" },
  { value: "fitness", label: "Fitness" },
  { value: "faith", label: "Faith" },
  { value: "food", label: "Food" },
  { value: "art_culture", label: "Art and culture" },
];
const categoryLabel = (value) => CATEGORIES.find((c) => c.value === value)?.label || "";

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
  whatsapp:     "",
  category:     "",
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
  whatsapp:     data?.whatsapp     || "",
  category:     data?.category     || "",
  is_public:    data?.is_public !== false,
});

// v-input is 44px tall with 16px text, so iOS doesn't zoom on focus.
const inputCls = "v-input placeholder:text-faint";

function ProfilePageContent() {
  const confirm = useConfirm();
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
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [stats, setStats] = useState(null);
  const [saveResult, flashSave] = useButtonResult();

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
      toast.message("Welcome to Byro", { description: "Let's finish setting up your profile." });
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
    setAvatarRemoved(false);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const removeAvatar = () => {
    setAvatarFile(null);
    setAvatarRemoved(true);
    setAvatarPreview("");
  };

  const handleCoverImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverImageFile(file);
    setCoverImagePreview(URL.createObjectURL(file));
  };

  const changeCount =
    Object.keys(EMPTY_FORM).filter((k) => form[k] !== savedForm[k]).length +
    (avatarFile || avatarRemoved ? 1 : 0) +
    (coverImageFile ? 1 : 0);
  const dirty = changeCount > 0;

  const handleDiscard = () => {
    setForm(savedForm);
    setErrors({});
    setAvatarFile(null);
    setAvatarRemoved(false);
    setCoverImageFile(null);
    setAvatarPreview(profile?.avatar_url || "");
    setCoverImagePreview(profile?.cover_image_url || "");
  };

  const handleSave = async () => {
    if (!dirty) {
      toast.info("Nothing to save");
      return;
    }
    if (!form.display_name.trim()) {
      setErrors({ display_name: "Add a display name so people know who you are." });
      document.getElementById("display_name")?.focus();
      return;
    }
    const handleIssue = handleProblem(form.handle);
    if (handleIssue) {
      setErrors({ handle: handleIssue });
      document.getElementById("handle")?.focus();
      return;
    }
    if (!form.bio.trim()) {
      setErrors({ bio: "Add a short bio so people know what you host." });
      document.getElementById("bio")?.focus();
      return;
    }
    if (savedForm.handle && form.handle !== savedForm.handle) {
      const ok = await confirm({
        title: `Change your page link to usebyro.com/u/${form.handle || "…"}?`,
        body: `Old links to usebyro.com/u/${savedForm.handle} will stop working.`,
        confirmLabel: "Change link",
      });
      if (!ok) return;
    }
    setIsSaving(true);
    try {
      // 1. Upload avatar if changed
      if (avatarFile) {
        const res = await API.uploadAvatar(avatarFile);
        setAvatarPreview(res.avatar_url);
        setAvatarFile(null);
      }

      // 1a. Remove the photo if asked
      if (avatarRemoved && !avatarFile) {
        await API.removeAvatar();
        setAvatarRemoved(false);
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

      flashSave("done");
      toast.success("Changes saved");
    } catch (err) {
      const message = err?.message || "Try again.";
      if (/handle/i.test(message)) setErrors({ handle: message });
      flashSave("failed");
      toast.error("Couldn't save changes", { description: message });
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
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pb-12 pt-4 sm:px-[clamp(16px,3vw,40px)] md:gap-6 md:pt-2" aria-busy="true">
        <span className="sr-only">Loading your profile…</span>
        <div className="flex flex-col gap-2">
          <div className="v-skel h-9 w-40" />
          <div className="v-skel h-4 w-72 max-w-full" />
        </div>
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[3_1_460px] flex-col gap-5">
            <div className="v-skel h-[300px] !rounded-[20px]" />
            <div className="v-skel h-[420px] !rounded-[20px]" />
          </div>
          <div className="v-skel h-[380px] min-w-0 flex-[2_1_320px] !rounded-[20px]" />
        </div>
      </div>
    );
  }

  const avatarSrc  = avatarPreview || null;
  const coverSrc   = coverImagePreview || null;
  const publicPath = savedForm.handle ? `/u/${savedForm.handle}` : null;

  // Instagram, X, WhatsApp and Website are always there. LinkedIn and Telegram only show if already filled in.
  const extraSocials = SOCIALS.filter((x) => (x.key === "linkedin" || x.key === "telegram") && form[x.key].trim());

  const bioLen = form.bio.length;

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pb-12 pt-4 sm:px-[clamp(16px,3vw,40px)] md:gap-6 md:pt-2">
      <div className="v-bf flex flex-wrap items-end gap-3" style={{ "--i": 0 }}>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <h1 className="v-h1">Profile</h1>
          <p className="v-sub">This is your community page. The preview updates as you type.</p>
        </div>
        <button type="button" onClick={handleDiscard} disabled={isSaving} className="v-btn v-btn-s v-btn-lg">
          Discard
        </button>
        <BusyButton
          type="button"
          onClick={handleSave}
          busy={isSaving}
          result={saveResult}
          busyLabel="Saving"
          doneLabel="Saved"
          title="Save changes (Ctrl or Cmd + S)"
          className="v-btn v-btn-p v-btn-lg"
        >
          Save changes
        </BusyButton>
      </div>

      <p className="sr-only" aria-live="polite">
        {dirty ? `${changeCount} unsaved change${changeCount === 1 ? "" : "s"}` : ""}
      </p>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_460px] flex-col gap-5">
          <Section id="ph" title="Photo and cover" hint="Shown at the top of your community page." i={1}>
            <div className="flex flex-wrap items-center gap-4">
              <span className="v-d flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-ink text-[30px] font-bold text-white">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt="" width={72} height={72} className="h-full w-full object-cover" />
                ) : (
                  initialOf(form.display_name)
                )}
              </span>
              <span className="flex flex-col gap-2">
                <span className="flex gap-2">
                  <FileButton onChange={handleAvatarChange}>{avatarSrc ? "Change photo" : "Add photo"}</FileButton>
                  {avatarSrc && (
                    <button type="button" onClick={removeAvatar} className="v-btn v-btn-t v-btn-sm">
                      Remove
                    </button>
                  )}
                </span>
                <span className="v-hint">Square, at least 400 × 400px.</span>
              </span>
            </div>
            <div className="relative h-[140px] overflow-hidden rounded-2xl bg-mist">
              {coverSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverSrc} alt="Current cover photo" width={800} height={140} className="block h-full w-full object-cover" />
              ) : (
                <span className="flex h-full flex-col items-center justify-center gap-0.5 text-faint">
                  <span className="text-sm font-semibold">No cover yet</span>
                  <span className="v-tab text-xs font-semibold">1600 × 500px</span>
                </span>
              )}
              <FileButton onChange={handleCoverImageChange} className="absolute bottom-3 right-3">
                {coverSrc ? "Change cover" : "Add cover"}
              </FileButton>
            </div>
          </Section>

          <Section id="ab" title="About" hint="Who you are and where people can find you." i={2}>
            <Field id="display_name" label="Name" error={errors.display_name}>
              <input
                id="display_name"
                name="display_name"
                type="text"
                value={form.display_name}
                maxLength={100}
                onChange={(e) => field("display_name", e.target.value)}
                aria-invalid={Boolean(errors.display_name)}
                className={`${inputCls} ${errors.display_name ? "!border-red-500" : ""}`}
                placeholder="Eko Live Entertainment…"
                autoComplete="organization"
              />
            </Field>

            <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
              <legend className="v-lbl mb-2.5 p-0">Category</legend>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const on = form.category === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      aria-pressed={on}
                      // Tapping the chosen one again clears it, as the old "Choose one" option did.
                      onClick={() => field("category", on ? "" : c.value)}
                      className={`v-press h-[38px] cursor-pointer rounded-full border-[1.5px] px-4 text-sm font-bold transition-[background-color,border-color,color] duration-200 ${
                        on ? "border-brand bg-[#EEF3FF] text-brand-dark" : "border-line bg-white text-body"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <Field id="handle" label={<>Handle <span className="text-red-500">*</span></>} error={errors.handle} hint="Changing this breaks old links to your page.">
              <PrefixInput
                id="handle"
                prefix="usebyro.com/u/"
                value={form.handle}
                maxLength={50}
                invalid={Boolean(errors.handle)}
                required
                onChange={(v) => field("handle", v.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                placeholder="eko-live…"
              />
            </Field>

            <Field id="location" label="Location">
              <input
                id="location"
                name="location"
                type="text"
                value={form.location}
                maxLength={100}
                onChange={(e) => field("location", e.target.value)}
                className={inputCls}
                placeholder="e.g. Lagos, Nigeria"
                autoComplete="address-level2"
              />
            </Field>

            <Field id="bio" label={<>Bio <span className="text-red-500">*</span></>} error={errors.bio}>
              <textarea
                id="bio"
                name="bio"
                autoComplete="off"
                value={form.bio}
                maxLength={BIO_MAX}
                onChange={(e) => field("bio", e.target.value)}
                rows={3}
                required
                aria-invalid={Boolean(errors.bio)}
                aria-describedby="bio-count"
                className={`${inputCls} ${errors.bio ? "!border-red-500" : ""}`}
                placeholder="Lagos-based collective throwing rooftop parties and open-mic nights…"
              />
              <span id="bio-count" className={`v-hint v-tab mt-2 block text-right ${bioLen > BIO_MAX * 0.9 ? "font-bold text-[#B45309]" : ""}`}>
                {bioLen} / {BIO_MAX}
              </span>
            </Field>
          </Section>

          <Section id="ln" title="Links" hint="Leave any blank to hide it." i={3}>
            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
              {["instagram", "twitter"].map((key) => {
                const x = SOCIALS.find((o) => o.key === key);
                return (
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
                );
              })}
              <Field id="whatsapp" label="WhatsApp group">
                <input
                  id="whatsapp"
                  name="whatsapp"
                  autoComplete="off"
                  type="text"
                  value={form.whatsapp}
                  maxLength={100}
                  onChange={(e) => field("whatsapp", e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={inputCls}
                  placeholder="chat.whatsapp.com/…"
                />
              </Field>
              <Field id="website" label="Website">
                <input
                  id="website"
                  name="website"
                  autoComplete="off"
                  type="url"
                  inputMode="url"
                  value={form.website}
                  maxLength={100}
                  onChange={(e) => field("website", e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={inputCls}
                  placeholder="https://"
                />
              </Field>
              {extraSocials.map((x) => (
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
          </Section>

          <Section id="vs" title="Visibility" hint="Control where your page shows up." i={4}>
            <div className="flex items-center gap-3.5">
              <span id="listing-label" className="flex flex-grow flex-col gap-0.5">
                <span className="text-[15px] font-extrabold">List on the communities page</span>
                <span className="v-hint">People can find you in Byro&rsquo;s community directory.</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={form.is_public}
                aria-labelledby="listing-label"
                onClick={() => field("is_public", !form.is_public)}
                className={`flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-0 p-[3px] transition-colors ${form.is_public ? "bg-brand" : "bg-[#C9D0DC]"}`}
              >
                <span
                  className={`h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(20,22,28,.25)] transition-transform duration-150 ease-out ${form.is_public ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>
          </Section>
        </div>

        <ProfilePreview form={form} avatarSrc={avatarSrc} coverSrc={coverSrc} stats={stats} publicPath={publicPath} isPublic={savedForm.is_public} />
      </div>

      {/* ── Phones: the header buttons scroll away, so keep Save in reach while there is something to save.
          It rides just above the bottom tab bar (64px + safe area), like the board's status cards at 84px. ── */}
      {dirty && (
        <div className="pointer-events-none sticky bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 flex justify-center md:hidden">
          <div
            role="region"
            aria-label="Unsaved changes"
            className="pointer-events-auto inline-flex w-full items-center justify-between gap-4 rounded-full bg-ink py-1.5 pl-5 pr-1.5 text-white shadow-lg"
          >
            <p className="text-sm">{changeCount} unsaved change{changeCount === 1 ? "" : "s"}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDiscard}
                disabled={isSaving}
                className="h-10 rounded-full px-3.5 text-sm font-bold text-gray-300 hover:text-white disabled:opacity-50"
              >
                Discard
              </button>
              <button type="button" onClick={handleSave} disabled={isSaving} className="v-btn v-btn-p">
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
function ProfilePreview({ form, avatarSrc, coverSrc, stats, publicPath, isPublic }) {
  const name = form.display_name.trim();
  const meta = [form.location.trim(), categoryLabel(form.category)].filter(Boolean).join(" · ");

  const links = [
    ...SOCIALS.filter((x) => form[x.key].trim()).map((x) => ({ key: x.key, label: x.label, icon: x.icon })),
    form.website.trim() && { key: "website", label: "Website", icon: FaGlobe },
  ].filter(Boolean);

  return (
    <aside aria-label="Preview" className="v-bf flex min-w-0 flex-[2_1_320px] flex-col gap-3 lg:sticky lg:top-2" style={{ "--i": 2 }}>
      <span className="v-eyebrow flex items-center gap-2">
        <span className="v-dot bg-brand" />
        Live preview
      </span>
      <div className="v-card overflow-hidden shadow-[0_30px_60px_-32px_rgba(20,22,28,.4)]">
        <div className="h-[120px] bg-mist">
          {coverSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverSrc} alt="" width={480} height={120} className="block h-full w-full object-cover" />
          )}
        </div>
        <div className="flex flex-col gap-3 px-5 pb-[22px]">
          <span className="v-d -mt-8 flex h-16 w-16 items-center justify-center overflow-hidden rounded-[18px] bg-ink text-[26px] font-bold text-white shadow-[0_0_0_4px_#FFFFFF]">
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt="" width={64} height={64} className="h-full w-full object-cover" />
            ) : (
              initialOf(name)
            )}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={`v-d break-words text-[22px] font-bold tracking-[-0.02em] ${name ? "text-ink" : "text-faint"}`}>
              {name || "Your name"}
            </span>
            <span className={`break-words text-[15px] font-bold ${form.handle ? "text-body" : "text-faint"}`}>
              @{form.handle || "handle"}
            </span>
            {meta && <span className="v-hint break-words">{meta}</span>}
          </span>
          <p className={`m-0 line-clamp-5 break-words text-sm leading-[1.55] ${form.bio.trim() ? "text-body" : "text-faint"}`}>
            {form.bio.trim() || "Add a short bio so people know what you host."}
          </p>
          {stats && (
            <span className="flex gap-[18px] text-sm">
              <span>
                <b className="v-tab">{Number(stats.followers ?? 0).toLocaleString("en-NG")}</b> <span className="text-muted">followers</span>
              </span>
              <span>
                <b className="v-tab">{Number(stats.events_held ?? 0).toLocaleString("en-NG")}</b> <span className="text-muted">events</span>
              </span>
            </span>
          )}
          {links.length > 0 && (
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {links.map(({ key, label, icon: Icon }) => (
                <li key={key} title={label} className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">{label}</span>
                </li>
              ))}
            </ul>
          )}
          {/* Not clickable: this is how visitors see the buttons. */}
          <span className="grid grid-cols-2 gap-2" aria-hidden="true">
            <span className="v-btn v-btn-p v-btn-sm min-w-0 cursor-default">Follow</span>
            <span className="v-btn v-btn-s v-btn-sm min-w-0 cursor-default">Share</span>
          </span>
        </div>
      </div>
      {publicPath && <PublicPageCard path={publicPath} isPublic={isPublic} />}
    </aside>
  );
}

/* Where the saved page lives: the address, whether people can see it, and open / copy. */
function PublicPageCard({ path, isPublic }) {
  const [copied, setCopied] = useState(false);
  const address = `usebyro.com${path}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy the link", { description: address });
    }
  };

  return (
    <div className="v-card flex flex-col gap-3.5 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mist text-brand-dark">
          <FaGlobe className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-extrabold">Your public page</span>
          <span className="v-hint truncate" title={address}>{address}</span>
        </span>
        <span className={`v-status shrink-0 text-xs ${isPublic === false ? "text-muted" : "text-[#1F7A52]"}`}>
          <span className={`v-dot ${isPublic === false ? "bg-faint" : "bg-stamp-green"}`} />
          {isPublic === false ? "Hidden" : "Live"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link href={path} target="_blank" className="v-btn v-btn-s v-btn-sm min-w-0">
          Open page
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
          </svg>
        </Link>
        <button type="button" onClick={copy} className="v-btn v-btn-s v-btn-sm min-w-0" aria-live="polite">
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

/* One settings card: title and hint on top, fields below. */
function Section({ id, title, hint, i = 0, children }) {
  return (
    <section aria-labelledby={id} className="v-card v-bf flex flex-col gap-[18px] p-6" style={{ "--i": i }}>
      <div className="flex flex-col gap-1">
        <h2 id={id} className="v-h2">{title}</h2>
        {hint && <span className="v-hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

// A button that opens the file picker.
function FileButton({ onChange, className = "", children }) {
  return (
    <label className={`v-btn v-btn-s v-btn-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand ${className}`}>
      {children}
      <input type="file" accept="image/*" className="sr-only" onChange={onChange} />
    </label>
  );
}

function Field({ id, label, hint, error, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="v-lbl">{label}</label>
      {children}
      {error ? (
        <p className="m-0 text-sm text-red-600" role="alert">{error}</p>
      ) : hint ? (
        <span className="v-hint">{hint}</span>
      ) : null}
    </div>
  );
}

function PrefixInput({ id, prefix, value, onChange, placeholder, maxLength, invalid = false, required = false }) {
  return (
    <span
      className={`v-input flex items-center overflow-hidden !p-0 focus-within:!border-brand focus-within:shadow-[0_0_0_4px_rgba(54,105,246,0.16)] ${
        invalid ? "!border-red-500" : ""
      }`}
    >
      <span className="select-none whitespace-nowrap pl-3.5 pr-1 text-muted">{prefix}</span>
      <input
        id={id}
        name={id}
        autoComplete="off"
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        required={required}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="h-full min-w-0 flex-grow border-0 bg-transparent pr-3.5 text-base text-ink outline-none placeholder:text-faint md:text-[15px]"
        placeholder={placeholder}
      />
    </span>
  );
}
