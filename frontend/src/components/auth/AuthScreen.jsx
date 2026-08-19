"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDispatch } from "react-redux";
import { FcGoogle } from "react-icons/fc";
import { FaApple } from "react-icons/fa";
import axiosInstance from "@/utils/axios";
import API from "@/services/api";
import { authSuccess } from "@/redux/auth/authSlice";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

function FakeQrGlyph() {
  // Decorative placeholder pattern — not a real scannable code.
  const cells = [
    1, 1, 0, 1, 1,
    1, 0, 1, 0, 1,
    0, 1, 1, 1, 0,
    1, 0, 1, 0, 1,
    1, 1, 0, 1, 1,
  ];
  return (
    <div className="grid grid-cols-5 grid-rows-5 gap-[2px] w-11 h-11">
      {cells.map((filled, i) => (
        <div key={i} className={filled ? "bg-[#0f0a2e]" : "bg-transparent"} />
      ))}
    </div>
  );
}

const SLIDES = [
  { src: "/images/people_raising_hands.jpeg", alt: "People raising hands" },
  { src: "/images/people_grooving.png", alt: "People enjoying live events" },
  { src: "/images/techevent.jpeg", alt: "Tech event" },
];

export default function AuthScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const dispatch = useDispatch();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(""));
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  const otpInputRefs = useRef([]);

  const completeSignIn = (data) => {
    API.setAuthToken(data.tokens.access);
    dispatch(authSuccess({ user: data.user, token: data.tokens }));
    if (!data.user.is_profile_complete) {
      router.push("/onboarding-preview");
    } else {
      router.push(redirectTo || "/home");
    }
  };

  useEffect(() => {
    document.title = "Sign in | Byro";
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (step === "otp") {
      otpInputRefs.current[0]?.focus();
    }
  }, [step]);

  const sendMagicAuthCode = async () => {
    setError("");
    setIsSubmittingEmail(true);
    try {
      await axiosInstance.post("auth/magic/send/", { email });
      setOtp(Array(OTP_LENGTH).fill(""));
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setStep("otp");
    } catch (err) {
      setError(err.response?.data?.error || "Could not send a code. Please try again.");
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    if (!email.trim() || isSubmittingEmail) return;
    sendMagicAuthCode();
  };

  const handleChangeEmail = () => {
    setStep("email");
    setError("");
    setOtp(Array(OTP_LENGTH).fill(""));
  };

  const handleVerify = async (code) => {
    setError("");
    setIsVerifying(true);
    try {
      const { data } = await axiosInstance.post("auth/magic/verify/", { email, code });
      completeSignIn(data);
    } catch (err) {
      setError(err.response?.data?.error || "That code is incorrect or has expired.");
      setIsVerifying(false);
    }
  };

  const applyDigits = (digits) => {
    const chars = digits.replace(/\D/g, "").slice(0, OTP_LENGTH).split("");
    const next = Array(OTP_LENGTH).fill("");
    chars.forEach((char, i) => {
      next[i] = char;
    });
    setOtp(next);
    const focusIndex = Math.min(chars.length, OTP_LENGTH - 1);
    otpInputRefs.current[focusIndex]?.focus();
    if (next.every((d) => d !== "")) {
      handleVerify(next.join(""));
    }
  };

  const handleOtpChange = (index, value) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
    if (next.every((d) => d !== "")) {
      handleVerify(next.join(""));
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    applyDigits(e.clipboardData.getData("text"));
  };

  const handleResend = () => {
    if (resendCooldown > 0) return;
    sendMagicAuthCode();
    otpInputRefs.current[0]?.focus();
  };

  const isOtpComplete = otp.every((digit) => digit !== "");

  return (
    <div className="min-h-screen bg-white">
      <div className="w-full grid grid-cols-1 md:grid-cols-2 min-h-screen">
        {/* Left — brand panel */}
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

        {/* Right — auth form */}
        <div className="relative bg-white flex items-center justify-center p-10 sm:p-14 min-h-screen">
          <Link href="/" className="absolute top-6 left-6 md:top-8 md:left-10">
            <Image src="/assets/images/logo.svg" alt="byro" width={80} height={32} className="h-7 w-auto" priority />
          </Link>
          <div className="w-full max-w-sm">
            {step === "email" ? (
              <>
                <h2 className="font-serif text-3xl text-gray-900 mb-2">Welcome to Byro</h2>
                <p className="text-gray-500 text-sm mb-8">
                  Enter your email to sign in or create an account.
                </p>

                <form className="space-y-4" onSubmit={handleEmailSubmit}>
                  <div>
                    <label htmlFor="email" className="block text-xs font-semibold text-gray-700 mb-1.5">
                      Email
                    </label>
                    <div className="relative">
                      <svg
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m2 7 10 6 10-6" />
                      </svg>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="amara@email.com"
                        className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-full text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                      />
                    </div>
                  </div>

                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <button
                    type="submit"
                    disabled={!email.trim() || isSubmittingEmail}
                    className="w-full bg-blue-600 text-white font-semibold py-3 rounded-full hover:bg-blue-700 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isSubmittingEmail ? "Sending..." : "Continue"}
                  </button>
                </form>

                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">OR</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled
                    title="Coming soon"
                    aria-disabled="true"
                    className="flex-1 flex items-center justify-center gap-2 border border-gray-200 rounded-full py-3 text-sm font-medium text-gray-400 opacity-60 cursor-not-allowed"
                  >
                    <FcGoogle size={18} />
                    Google
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Coming soon"
                    aria-disabled="true"
                    className="flex-1 flex items-center justify-center gap-2 border border-gray-200 rounded-full py-3 text-sm font-medium text-gray-400 opacity-60 cursor-not-allowed"
                  >
                    <FaApple size={18} />
                    Apple
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleChangeEmail}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors mb-6"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Back
                </button>

                <h2 className="font-serif text-3xl text-gray-900 mb-2">Check your email</h2>
                <p className="text-gray-500 text-sm mb-8">
                  Enter the 6-digit code we sent to{" "}
                  <span className="font-semibold text-gray-700">{email}</span>.
                </p>

                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (isOtpComplete) handleVerify(otp.join(""));
                  }}
                >
                  <div className="flex justify-between gap-2" onPaste={handleOtpPaste}>
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => {
                          otpInputRefs.current[index] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={1}
                        value={digit}
                        disabled={isVerifying}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        className="w-11 h-12 text-center text-lg font-semibold border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 disabled:opacity-60"
                      />
                    ))}
                  </div>

                  {error && <p className="text-sm text-red-600">{error}</p>}

                  <button
                    type="submit"
                    disabled={!isOtpComplete || isVerifying}
                    className="w-full bg-blue-600 text-white font-semibold py-3 rounded-full hover:bg-blue-700 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isVerifying ? "Verifying..." : "Verify"}
                  </button>
                </form>

                <p className="text-center text-sm text-gray-500 mt-6">
                  Didn&apos;t get a code?{" "}
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0}
                    className="text-blue-600 font-semibold hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend"}
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
