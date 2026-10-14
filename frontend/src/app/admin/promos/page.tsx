"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAdminMe } from "@/components/admin/AdminMe";
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
  const { can } = useAdminMe();
  const [busy, setBusy] = useState<number | null>(null);
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

  const toggle = async (p: AdminPromo) => {
    const next = !p.active;
    if (!window.confirm(next ? `Switch ${p.code} back on?` : `Switch ${p.code} off? Nobody can use it until it's switched back on.`)) return;
    setBusy(p.id);
    try {
      const res = await fetch(`/api/admin/promos/${p.id}`, { method: "PATCH", body: JSON.stringify({ active: next }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error);
      setPromos((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: data.active, is_valid: data.is_valid } : x)));
      toast.success(next ? "Code switched on" : "Code switched off", { description: p.code });
    } catch (err) {
      toast.error("Couldn't update code", { description: (err as Error).message || "Try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Promo codes</h1>
        <p className="text-muted text-sm mt-1">Every code on the platform, with usage</p>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by code or event…"
        className="w-full sm:w-80 mb-6 bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-brand/40"
      />

      {error && <p className="text-red-600 text-sm mb-6">{error}</p>}

      <div className="bg-white border border-line rounded-xl p-6 overflow-x-auto">
        {!loading && promos.length === 0 ? (
          <p className="text-faint text-sm py-6 text-center">No promo codes match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                {["Code", "Event", "Discount", "Used", "Expires", "Status", "On"].map((h, i) => (
                  <th key={i} className="pb-3 pr-6 text-xs text-faint font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {promos.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 pr-6 text-ink font-mono">{p.code}</td>
                  <td className="py-3 pr-6 text-muted truncate max-w-[200px]">{p.event_name}</td>
                  <td className="py-3 pr-6 text-[#3B4252] whitespace-nowrap">{discountLabel(p)}</td>
                  <td className="py-3 pr-6 text-[#3B4252] tabular-nums">
                    {p.redeemed_count}
                    {p.max_redemptions !== null ? ` / ${p.max_redemptions}` : ""}
                  </td>
                  <td className="py-3 pr-6 text-muted whitespace-nowrap">{formatDate(p.expires_at)}</td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.is_valid ? "bg-green-500/10 text-green-700" : "bg-gray-500/10 text-muted"
                    }`}>
                      {p.is_valid ? "Valid" : p.active ? "Expired / used up" : "Switched off"}
                    </span>
                  </td>
                  <td className="py-3 pl-4 text-right whitespace-nowrap">
                    {can.moderate && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={p.active}
                        aria-label={`${p.code} ${p.active ? "on" : "off"}`}
                        title={p.active ? "Switch off" : "Switch on"}
                        onClick={() => toggle(p)}
                        disabled={busy !== null}
                        className={`inline-flex h-[22px] w-10 shrink-0 rounded-full p-[3px] align-middle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none ${
                          p.active ? "bg-brand" : "bg-[#C9D0DC]"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(20,22,28,0.2)] transition-transform duration-150 ease-out motion-reduce:transition-none ${
                            p.active ? "translate-x-[18px]" : "translate-x-0"
                          }`}
                        />
                      </button>
                    )}
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
