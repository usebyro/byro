"use client";

import { useState } from "react";
import Image from "next/image";
import { FcGoogle } from "react-icons/fc";
import { FaApple } from "react-icons/fa";

const COPY = {
  signup: {
    tabLabel: "Create account",
    heading: "Hello",
    subtext: "Sign Up to Create, view your tickets and saved events.",
    cta: "Sign Up",
    switchPrompt: "New to Byro?",
    switchAction: "Sign in",
  },
  signin: {
    tabLabel: "Sign in",
    heading: "Welcome back",
    subtext: "Sign in to view your tickets and saved events.",
    cta: "Sign In",
    switchPrompt: "Don't have an account?",
    switchAction: "Create account",
  },
};

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

export default function AuthScreen() {
  const [mode, setMode] = useState("signup");
  const copy = COPY[mode];

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 rounded-3xl overflow-hidden shadow-2xl">
        {/* Left — brand panel */}
        <div
          className="relative hidden md:flex flex-col justify-between p-10 overflow-hidden"
          style={{
            background:
              "radial-gradient(120% 100% at 75% 45%, #a855f7 0%, #7c3aed 35%, #4c1d95 60%, #0f0a2e 100%)",
          }}
        >
          <Image
            src="/assets/images/logo.svg"
            alt="byro"
            width={80}
            height={32}
            className="h-8 w-auto brightness-0 invert relative z-10"
          />

          <div className="relative z-10">
            <h1 className="font-serif text-4xl leading-tight text-white mb-4">
              Every ticket,
              <br />
              one tap away.
            </h1>
            <p className="text-white/70 text-sm leading-relaxed max-w-xs mb-8">
              Join 340,000 people who hold their live-event tickets in Byro — instant QR entry, no paper, no stress.
            </p>

            <div className="flex items-center gap-3 bg-white/10 border border-white/20 backdrop-blur-md rounded-2xl p-3 max-w-xs">
              <div className="bg-white rounded-lg p-2 flex items-center justify-center shrink-0">
                <FakeQrGlyph />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-widest text-white/60 uppercase mb-0.5">
                  Your entry pass
                </p>
                <p className="text-white text-sm font-semibold leading-snug">Afrobeats Arena Live</p>
                <p className="text-white/50 text-xs font-mono">BYR-2026-X84K</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right — auth form */}
        <div className="bg-white flex items-center justify-center p-10 sm:p-14">
          <div className="w-full max-w-sm">
            <div className="inline-flex bg-gray-100 rounded-full p-1 mb-8">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  mode === "signin" ? "bg-white text-gray-900 shadow-sm font-semibold" : "text-gray-500"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  mode === "signup" ? "bg-white text-gray-900 shadow-sm font-semibold" : "text-gray-500"
                }`}
              >
                Create account
              </button>
            </div>

            <h2 className="font-serif text-3xl text-gray-900 mb-2">{copy.heading}</h2>
            <p className="text-gray-500 text-sm mb-8">{copy.subtext}</p>

            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
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
                    placeholder="amara@email.com"
                    className="w-full pl-11 pr-4 py-3 border border-gray-200 rounded-full text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-full hover:bg-blue-700 transition-colors text-sm"
              >
                {copy.cta}
              </button>
            </form>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">or continue with</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 flex items-center justify-center gap-2 border border-gray-200 rounded-full py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <FcGoogle size={18} />
                Google
              </button>
              <button
                type="button"
                className="flex-1 flex items-center justify-center gap-2 border border-gray-200 rounded-full py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <FaApple size={18} />
                Apple
              </button>
            </div>

            <p className="text-center text-sm text-gray-500 mt-8">
              {copy.switchPrompt}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
                className="text-blue-600 font-semibold hover:underline"
              >
                {copy.switchAction}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
