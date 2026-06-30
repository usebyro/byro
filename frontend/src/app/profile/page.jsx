"use client";

import { useState, useEffect } from "react";
import { useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser } from "@web3auth/modal/react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  UserIcon,
  Ticket01Icon,
  FavouriteIcon,
  Notification01Icon,
  Logout01Icon,
  Camera01Icon,
  Location01Icon,
  MusicNote01Icon,
  Moon02Icon,
  FootballIcon,
  Mic01Icon,
  HappyIcon,
  FireworksIcon,
} from "@hugeicons/core-free-icons";
import AppLayout from "@/layout/app";

const PREFERENCES = [
  { id: "entertainment", label: "Concerts", icon: MusicNote01Icon },
  { id: "art_culture", label: "Nightlife", icon: Moon02Icon },
  { id: "fitness", label: "Sports", icon: FootballIcon },
  { id: "conference", label: "Conferences", icon: Mic01Icon },
  { id: "comedy", label: "Comedy", icon: HappyIcon },
  { id: "festivals", label: "Festivals", icon: FireworksIcon },
];

const NAV = [
  { id: "profile", label: "Profile", icon: UserIcon, href: "/profile" },
  { id: "tickets", label: "My tickets", icon: Ticket01Icon, href: "/tickets" },
  { id: "saved", label: "Saved events", icon: FavouriteIcon, href: "/saved" },
  { id: "notifications", label: "Notifications", icon: Notification01Icon, href: "/notifications" },
];

export default function ProfilePage() {
  const router = useRouter();
  const { isConnected } = useWeb3AuthConnect();
  const { disconnect } = useWeb3AuthDisconnect();
  const { userInfo } = useWeb3AuthUser();

  const [formData, setFormData] = useState({ firstName: "", lastName: "", email: "", phone: "", city: "" });
  const [savedForm, setSavedForm] = useState({ firstName: "", lastName: "", email: "", phone: "", city: "" });
  const [preferences, setPreferences] = useState(["entertainment", "art_culture"]);
  const [savedPrefs, setSavedPrefs] = useState(["entertainment", "art_culture"]);

  useEffect(() => {
    if (!isConnected) {
      router.push("/");
      return;
    }
    if (userInfo) {
      const parts = (userInfo.name || "").split(" ");
      const firstName = parts[0] || "";
      const lastName = parts.slice(1).join(" ") || "";
      const initial = { firstName, lastName, email: userInfo.email || "", phone: "", city: "" };
      setFormData(initial);
      setSavedForm(initial);
    }
  }, [isConnected, userInfo, router]);

  const initials = `${formData.firstName?.[0] || ""}${formData.lastName?.[0] || ""}`.toUpperCase() || "?";

  const field = (key, value) => setFormData(p => ({ ...p, [key]: value }));

  const handleSave = () => {
    setSavedForm({ ...formData });
    setSavedPrefs([...preferences]);
    // TODO: persist via API when endpoint is available
  };

  const handleCancel = () => {
    setFormData({ ...savedForm });
    setPreferences([...savedPrefs]);
  };

  const togglePref = (id) =>
    setPreferences(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#F0F2F5] py-6 sm:py-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row gap-6 items-start">

          {/* ── Left sidebar ── */}
          <div className="w-full md:w-60 shrink-0">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              {/* Avatar + name */}
              <div className="flex items-center gap-3 pb-4 mb-4 border-b border-gray-100">
                <div className="w-11 h-11 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {formData.firstName} {formData.lastName}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Member since 2024</p>
                </div>
              </div>

              {/* Nav */}
              <nav className="space-y-0.5">
                {NAV.map(item => (
                  <button
                    key={item.id}
                    onClick={() => router.push(item.href)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                      item.id === "profile"
                        ? "bg-blue-50 text-blue-600"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <HugeiconsIcon
                      icon={item.icon}
                      size={16}
                      color={item.id === "profile" ? "#2563eb" : "#6b7280"}
                    />
                    {item.label}
                  </button>
                ))}

                <div className="pt-3 mt-2 border-t border-gray-100">
                  <button
                    onClick={() => disconnect()}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors text-left"
                  >
                    <HugeiconsIcon icon={Logout01Icon} size={16} color="#9ca3af" />
                    Sign out
                  </button>
                </div>
              </nav>
            </div>
          </div>

          {/* ── Main content ── */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-2xl p-5 sm:p-8 shadow-sm border border-gray-100">
              {/* Heading */}
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Profile</h1>
              <p className="text-sm text-gray-400 mb-8">
                Manage your personal information and how you appear on Byro.
              </p>

              {/* Profile photo */}
              <div className="flex items-center gap-5 pb-8 mb-8 border-b border-gray-100">
                <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xl shrink-0">
                  {initials}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm mb-1">Profile photo</p>
                  <p className="text-xs text-gray-400 mb-3">JPG or PNG, at least 200×200px.</p>
                  <div className="flex items-center gap-3">
                    <button className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors text-gray-700">
                      <HugeiconsIcon icon={Camera01Icon} size={12} color="#374151" />
                      Upload new
                    </button>
                    <button className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              {/* Form fields */}
              <div className="space-y-5">
                {/* First + Last name */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">First name</label>
                    <input
                      type="text"
                      value={formData.firstName}
                      onChange={e => field("firstName", e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      placeholder="Amara"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Last name</label>
                    <input
                      type="text"
                      value={formData.lastName}
                      onChange={e => field("lastName", e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      placeholder="Okafor"
                    />
                  </div>
                </div>

                {/* Email + Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={e => field("email", e.target.value)}
                        className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        placeholder="amara@email.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                        <line x1="12" y1="18" x2="12.01" y2="18" />
                      </svg>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={e => field("phone", e.target.value)}
                        className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        placeholder="+234 801 234 5678"
                      />
                    </div>
                  </div>
                </div>

                {/* City */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
                  <div className="relative">
                    <HugeiconsIcon
                      icon={Location01Icon}
                      size={14}
                      color="#9ca3af"
                      className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    />
                    <input
                      type="text"
                      value={formData.city}
                      onChange={e => field("city", e.target.value)}
                      className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      placeholder="Lagos, Nigeria"
                    />
                  </div>
                </div>
              </div>

              {/* Event preferences */}
              <div className="mt-8 pt-8 border-t border-gray-100">
                <h3 className="font-semibold text-gray-900 text-sm mb-4">Event preferences</h3>
                <div className="flex flex-wrap gap-2">
                  {PREFERENCES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => togglePref(cat.id)}
                      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        preferences.includes(cat.id)
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      <HugeiconsIcon icon={cat.icon} size={14} color="currentColor" />
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-5">
              <button
                onClick={handleCancel}
                className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
