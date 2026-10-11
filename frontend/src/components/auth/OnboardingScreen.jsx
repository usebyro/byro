"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { CompassIcon, Megaphone01Icon, Camera01Icon, UserIcon } from "@hugeicons/core-free-icons";
import API from "@/services/api";
import { handleProblem, friendlyProfileError } from "@/lib/handle";
import { FaXTwitter, FaInstagram, FaLinkedinIn, FaTelegram } from "react-icons/fa6";

const ROLES = [
  {
    id: "attendee",
    icon: CompassIcon,
    label: "Discover and Attend Events",
    description: "Find events and get tickets.",
  },
  {
    id: "organizer",
    icon: Megaphone01Icon,
    label: "Host Event",
    description: "Create and manage your own events.",
  },
];

const ORGANIZER_STEPS = [
  {
    title: "Profile photo",
    fields: [{ key: "avatar", type: "avatar", required: true }],
  },
  {
    title: "Basic info",
    fields: [
      { key: "displayName", label: "Name or community name", type: "text", placeholder: "Lagos Run Club" },
      { key: "handle", label: "Username", type: "handle", required: true, placeholder: "amara-live" },
    ],
  },
  {
    title: "About you",
    fields: [
      { key: "bio", label: "Bio", type: "textarea", required: true, placeholder: "Tell people about yourself or your organisation…" },
      { key: "location", label: "Location", type: "text", placeholder: "Lagos, Nigeria" },
    ],
  },
  {
    title: "Links",
    fields: [
      { key: "website", label: "Website", type: "url", placeholder: "https://example.com" },
      { key: "social", label: "Social media", type: "social" },
    ],
  },
  {
    title: "Visibility",
    fields: [{ key: "isPublic", type: "toggle" }],
  },
];

const SLIDES = [
  { src: "/images/people_raising_hands.jpeg", alt: "People raising hands" },
  { src: "/images/people_grooving.png", alt: "People enjoying live events" },
  { src: "/images/techevent.jpeg", alt: "Tech event" },
];

// Where to go when onboarding finishes: the page they were sent here from, if it is a
// same-site path (a co-host invitation returns them to the event). Read at click time.
const returnPath = (fallback) => {
  if (typeof window === "undefined") return fallback;
  const target = new URLSearchParams(window.location.search).get("redirect");
  return target && target.startsWith("/") && !target.startsWith("//") ? target : fallback;
};

export default function OnboardingScreen() {
  const router = useRouter();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [stage, setStage] = useState("select"); // "select" | "organizer-details"
  const [wizardStep, setWizardStep] = useState(0);
  const [hostForm, setHostForm] = useState({
    displayName: "",
    handle: "",
    bio: "",
    location: "",
    website: "",
    twitter: "",
    instagram: "",
    linkedin: "",
    telegram: "",
    isPublic: true,
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [stepError, setStepError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = "Welcome | Byro";
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const hostField = (key, value) => setHostForm((f) => ({ ...f, [key]: value }));

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const saveOrganizerProfile = async () => {
    setIsSaving(true);
    setStepError("");
    try {
      if (avatarFile) {
        await API.uploadAvatar(avatarFile);
      }
      const { isPublic, displayName, ...rest } = hostForm;
      await API.updateProfile({
        ...rest,
        display_name: displayName,
        is_public: isPublic,
        is_complete: true,
      });
      return true;
    } catch (err) {
      console.error("Could not save onboarding profile:", err);
      setStepError(friendlyProfileError(err));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectRole = (id) => {
    // Best-effort — the choice still drives the local wizard even if this
    // fails, but the admin-side role filter needs it saved.
    API.updateProfile({ role: id }).catch((err) => {
      console.error("Could not save onboarding role:", err);
    });
    if (id === "organizer") {
      setWizardStep(0);
      setStage("organizer-details");
    } else {
      router.push(returnPath("/home"));
    }
  };

  const isLastWizardStep = wizardStep === ORGANIZER_STEPS.length - 1;
  const isNextDisabled = ORGANIZER_STEPS[wizardStep].fields.some((field) => {
    if (!field.required) return false;
    if (field.type === "avatar") return !avatarPreview;
    return !hostForm[field.key]?.trim();
  });

  const handleNext = async () => {
    if (isNextDisabled) return;
    setStepError("");
    const hasHandle = ORGANIZER_STEPS[wizardStep].fields.some((f) => f.type === "handle");
    if (hasHandle) {
      // Claim the username now, so a taken or invalid one is caught on this step, not after Finish.
      const problem = handleProblem(hostForm.handle);
      if (problem) {
        setStepError(problem);
        return;
      }
      setIsSaving(true);
      try {
        await API.updateProfile({ handle: hostForm.handle.trim(), display_name: hostForm.displayName });
      } catch (err) {
        setStepError(friendlyProfileError(err));
        setIsSaving(false);
        return;
      }
      setIsSaving(false);
    }
    if (isLastWizardStep) {
      if (await saveOrganizerProfile()) setStage("live");
    } else {
      setWizardStep((s) => s + 1);
    }
  };

  const handlePrevious = () => {
    if (wizardStep === 0) {
      setStage("select");
    } else {
      setWizardStep((s) => s - 1);
    }
  };

  const handleSkip = async () => {
    if (isNextDisabled) return;
    const problem = handleProblem(hostForm.handle);
    if (problem) {
      setStepError(problem);
      return;
    }
    if (await saveOrganizerProfile()) setStage("live");
  };

  const pageUrl = `${(process.env.NEXT_PUBLIC_SITE_URL || "https://usebyro.com").replace(/\/+$/, "")}/u/${hostForm.handle.trim()}`;
  const copyPageUrl = () => {
    navigator.clipboard
      ?.writeText(pageUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="w-full grid grid-cols-1 md:grid-cols-2 min-h-screen">
        <div className="relative hidden md:block overflow-hidden h-full">
          {SLIDES.map((slide, i) => (
            <Image
              key={slide.src}
              src={slide.src}
              alt={slide.alt}
              fill
              priority={i === 0}
              sizes="(max-width: 768px) 0px, 50vw"
              className={`object-cover transition-opacity duration-1000 ease-in-out ${
                i === currentSlide ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
        </div>

        <div className="relative bg-white flex items-center justify-center p-10 sm:p-14 min-h-screen">
          <Link href="/" className="absolute top-6 left-6 md:top-8 md:left-10">
            <Image src="/assets/images/logo.svg" alt="byro" width={80} height={32} className="h-7 w-auto" priority />
          </Link>

          <div className={`w-full ${stage === "select" ? "max-w-sm" : "max-w-md"}`}>
            {stage === "select" && (
              <>
                <h2 className="font-serif text-3xl text-gray-900 mb-2">Welcome</h2>
                <p className="text-gray-500 text-sm mb-8">
                  Welcome to Byro. Set up your account.
                </p>

                <div className="space-y-3">
                  {ROLES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelectRole(option.id)}
                      className="w-full flex items-center gap-3 border border-gray-200 rounded-2xl p-4 text-left transition-colors hover:border-gray-300"
                    >
                      <span className="flex items-center justify-center w-10 h-10 rounded-full shrink-0 bg-gray-100 text-gray-500">
                        <HugeiconsIcon icon={option.icon} size={18} color="currentColor" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
                        <span className="block text-xs text-gray-500 mt-0.5">{option.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {stage === "organizer-details" && (
              <>
                <div className="flex items-center gap-1.5 mb-6">
                  {ORGANIZER_STEPS.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${
                        i === wizardStep ? "w-8 bg-blue-600" : i < wizardStep ? "w-1.5 bg-blue-300" : "w-1.5 bg-gray-200"
                      }`}
                    />
                  ))}
                </div>

                <h2 className="font-serif text-3xl text-gray-900 mb-2">{ORGANIZER_STEPS[wizardStep].title}</h2>
                <p className="text-gray-500 text-sm mb-8">Set up your organiser or community profile.</p>

                <div className="space-y-4">
                  {ORGANIZER_STEPS[wizardStep].fields.map((field) =>
                    field.type === "avatar" ? (
                      <div key="avatar" className="flex items-center gap-5">
                        <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 shrink-0 overflow-hidden">
                          {avatarPreview ? (
                            <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                          ) : (
                            <HugeiconsIcon icon={UserIcon} size={28} color="#9ca3af" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900 mb-1">
                            Profile photo <span className="text-red-500">*</span>
                          </p>
                          <p className="text-xs text-gray-400 mb-3">JPG or PNG, at least 200×200px.</p>
                          <label className="inline-flex items-center gap-1.5 text-xs font-semibold border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors text-gray-700 cursor-pointer">
                            <HugeiconsIcon icon={Camera01Icon} size={12} />
                            Upload photo
                            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                          </label>
                        </div>
                      </div>
                    ) : field.type === "toggle" ? (
                      <label key={field.key} className="flex items-start justify-between gap-4 border border-gray-200 rounded-2xl p-4 cursor-pointer">
                        <span>
                          <span className="block text-sm font-semibold text-gray-900">List Community publicly</span>
                          <span className="block text-xs text-gray-500 mt-0.5">
                            Your profile will be publicly listed on the community page
                          </span>
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={hostForm.isPublic}
                          onClick={() => hostField("isPublic", !hostForm.isPublic)}
                          className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${
                            hostForm.isPublic ? "bg-blue-600" : "bg-gray-200"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
                              hostForm.isPublic ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </label>
                    ) : field.type === "social" ? (
                      <div key="social">
                        <p className="text-xs font-semibold text-gray-700 mb-2">Social media</p>
                        <div className="grid grid-cols-2 gap-3">
                          <SocialInput icon={FaXTwitter} prefix="x.com/" value={hostForm.twitter} onChange={(v) => hostField("twitter", v)} placeholder="handle" />
                          <SocialInput icon={FaInstagram} prefix="instagram.com/" value={hostForm.instagram} onChange={(v) => hostField("instagram", v)} placeholder="handle" />
                          <SocialInput icon={FaLinkedinIn} prefix="linkedin.com/in/" value={hostForm.linkedin} onChange={(v) => hostField("linkedin", v)} placeholder="username" />
                          <SocialInput icon={FaTelegram} prefix="t.me/" value={hostForm.telegram} onChange={(v) => hostField("telegram", v)} placeholder="handle" />
                        </div>
                      </div>
                    ) : (
                      <OrganizerField
                        key={field.key}
                        field={field}
                        value={hostForm[field.key]}
                        onChange={(v) => hostField(field.key, v)}
                      />
                    )
                  )}
                </div>

                {stepError && (
                  <p role="alert" className="mt-4 text-sm text-red-600">
                    {stepError}
                  </p>
                )}

                <div className="flex items-center justify-between mt-8">
                  <button
                    type="button"
                    onClick={handlePrevious}
                    className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                    {wizardStep === 0 ? "Back" : "Previous"}
                  </button>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={handleSkip}
                      disabled={isNextDisabled || isSaving}
                      title={isNextDisabled ? "Fill in the required field before skipping" : undefined}
                      className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400"
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      onClick={handleNext}
                      disabled={isNextDisabled || isSaving}
                      className="bg-blue-600 text-white font-semibold py-2.5 px-6 rounded-full hover:bg-blue-700 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isSaving ? "Saving…" : isLastWizardStep ? "Finish" : "Next"}
                    </button>
                  </div>
                </div>
              </>
            )}

            {stage === "live" && (
              <>
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-5">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h2 className="font-serif text-3xl text-gray-900 mb-2">Your community is live</h2>
                <p className="text-gray-500 text-sm mb-6">
                  {hostForm.isPublic
                    ? "People can find it on the communities page, follow it, and hear about every event you publish."
                    : "It's private for now, so only people with the link can see it. You can list it publicly any time in settings."}
                </p>

                <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden mb-4">
                  <span className="flex-1 px-4 py-2.5 text-sm text-gray-600 truncate">{pageUrl.replace(/^https?:\/\//, "")}</span>
                  <button
                    type="button"
                    onClick={copyPageUrl}
                    className="px-4 py-2.5 text-sm font-semibold text-gray-700 border-l border-gray-200 hover:bg-gray-50 transition-colors shrink-0"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Follow ${hostForm.displayName || "us"} on Byro: ${pageUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center w-full border border-gray-200 rounded-full py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors mb-3"
                >
                  Share on WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => router.push(returnPath("/dashboard/events/create"))}
                  className="w-full bg-blue-600 text-white font-semibold py-3 rounded-full hover:bg-blue-700 transition-colors text-sm"
                >
                  Create your first event
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="w-full mt-3 text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Go to dashboard
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function OrganizerField({ field, value, onChange }) {
  if (field.type === "textarea") {
    return (
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
          {field.label} {field.required && <span className="text-red-500">*</span>}
        </label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder={field.placeholder}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 resize-none"
        />
      </div>
    );
  }

  if (field.type === "handle") {
    return (
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
          {field.label} {field.required && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none select-none">
            usebyro.com/u/
          </span>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="w-full pl-[108px] pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">{field.label}</label>
      <input
        type={field.type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
      />
    </div>
  );
}

function SocialInput({ icon: Icon, prefix, value, onChange, placeholder }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[11px] text-gray-500 pointer-events-none select-none">
        <Icon className="w-3.5 h-3.5 text-gray-700" aria-hidden="true" />
        {prefix}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ paddingLeft: `${prefix.length * 6.8 + 34}px` }}
        className="w-full border border-gray-200 rounded-lg pr-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        placeholder={placeholder}
        aria-label={prefix}
      />
    </div>
  );
}
