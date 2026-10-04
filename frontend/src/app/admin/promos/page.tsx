"use client";

import { useEffect, useState } from "react";
import { formatNaira } from "@/lib/eventFormat";

interface AdminPromo {
  id: number;
  code: string;
  event_name: string;
  discount_type: string;
  amount: string;
  redeemed_count: number;
  max_redemptions: number | null;
  active: boolean;
  is_valid: boolean;
  expires_at: string | null;
}

function discountLabel(p: AdminPromo) {
  const n = Number(p.amount);
  return p.discount_type === "percent" || p.discount_type === "percentage"
    ? `${n}% off`
    : `${formatNaira(n)} off`;
}

function formatDate(s: string | null) {
  if (!s) return "No expiry";
  return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminPromosPage() {
  const [promos, setPromos] = useState<AdminPromo[]>([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (debounced) params.set("search", debounced);
    fetch(`/api/admin/promos?${params}`)
      .then(async (res) => {
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error();
        if (cancelled) return;
        setPromos(Array.isArray(data) ? data : []);
        setError("");
      })
      .catch(() => { if (!cancelled) setError("Couldn't load promo codes."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="text-white text-xl font-bold">Promo codes</h1>
        <p className="text-gray-400 text-sm mt-1">Every code on the platform, with usage</p>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by code or event…"
        className="w-full sm:w-80 mb-6 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
      />

      {error && <p className="text-red-400 text-sm mb-6">{error}</p>}

      <div className="bg-[#1a1d27] border border-white/10 rounded-xl p-6 overflow-x-auto">
        {!loading && promos.length === 0 ? (
          <p className="text-gray-500 text-sm py-6 text-center">No promo codes match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                {["Code", "Event", "Discount", "Used", "Expires", "Status"].map((h) => (
                  <th key={h} className="pb-3 pr-6 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {promos.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 pr-6 text-white font-mono">{p.code}</td>
                  <td className="py-3 pr-6 text-gray-400 truncate max-w-[200px]">{p.event_name}</td>
                  <td className="py-3 pr-6 text-gray-300 whitespace-nowrap">{discountLabel(p)}</td>
                  <td className="py-3 pr-6 text-gray-300 tabular-nums">
                    {p.redeemed_count}
                    {p.max_redemptions !== null ? ` / ${p.max_redemptions}` : ""}
                  </td>
                  <td className="py-3 pr-6 text-gray-400 whitespace-nowrap">{formatDate(p.expires_at)}</td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.is_valid ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"
                    }`}>
                      {p.is_valid ? "Valid" : p.active ? "Expired / used up" : "Disabled"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
