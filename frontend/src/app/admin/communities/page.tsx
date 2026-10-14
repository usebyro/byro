"use client";

import { SkeletonRows } from "@/components/admin/ui";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAdminMe } from "@/components/admin/AdminMe";
import { publicHref } from "@/lib/adminNav";
import { formatNaira } from "@/lib/eventFormat";

interface Community {
  user_id: number;
  email: string;
  name: string;
  handle: string | null;
  avatar_url: string | null;
  bio: string;
  location: string;
  is_public: boolean;
  hidden_from_directory: boolean;
  verified: boolean;
  messaging_blocked: boolean;
  followers: number | null;
  events: number | null;
  merch: number | null;
}

interface Merch {
  id: number;
  name: string;
  price: string | null;
  image_url: string | null;
  purchase_link: string;
  is_active: boolean;
  removed_by_admin: boolean;
}

const FILTERS = [
  { value: "", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "hidden", label: "Hidden" },
];

function Toggle({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`inline-flex h-[22px] w-10 shrink-0 rounded-full p-[3px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none ${
        on ? "bg-brand" : "bg-[#C9D0DC]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(20,22,28,0.2)] transition-transform duration-150 ease-out motion-reduce:transition-none ${
          on ? "translate-x-[18px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function AdminCommunitiesPage() {
  const { can } = useAdminMe();
  const [rows, setRows] = useState<Community[]>([]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [merch, setMerch] = useState<Record<number, Merch[]>>({});
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (debounced) params.set("search", debounced);
    if (filter) params.set("filter", filter);
    try {
      const res = await fetch(`/api/admin/communities?${params}`);
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error();
      setRows(Array.isArray(data) ? data : []);
      setError("");
    } catch {
      setError("Couldn't load communities.");
    } finally {
      setLoading(false);
    }
  }, [debounced, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const expand = async (c: Community) => {
    if (open === c.user_id) {
      setOpen(null);
      return;
    }
    setOpen(c.user_id);
    if (merch[c.user_id]) return;
    const res = await fetch(`/api/admin/communities/${c.user_id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setMerch((m) => ({ ...m, [c.user_id]: data.merch_items || [] }));
  };

  const setFlag = async (c: Community, field: "hidden_from_directory" | "verified") => {
    // Easy to reverse, so no "are you sure?": it happens at once and the toast offers Undo.
    const next = !c[field];
    setBusy(`${field}-${c.user_id}`);
    try {
      const res = await fetch(`/api/admin/communities/${c.user_id}`, { method: "PATCH", body: JSON.stringify({ [field]: next }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error);
      setRows((prev) => prev.map((r) => (r.user_id === c.user_id ? { ...r, ...data } : r)));
      toast.success(
        field === "verified" ? (next ? "Community verified" : "Verified badge removed") : next ? "Hidden from directory" : "Shown in directory",
        { description: c.name, action: { label: "Undo", onClick: () => setFlag({ ...c, [field]: next }, field) } },
      );
    } catch (err) {
      toast.error("Couldn't update community", { description: (err as Error).message || "Try again." });
    } finally {
      setBusy("");
    }
  };

  const setRemoved = async (ownerId: number, item: Merch) => {
    const next = !item.removed_by_admin;
    setBusy(`merch-${item.id}`);
    try {
      const res = await fetch(`/api/admin/merch/${item.id}`, { method: "PATCH", body: JSON.stringify({ removed_by_admin: next }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error);
      setMerch((m) => ({ ...m, [ownerId]: (m[ownerId] || []).map((x) => (x.id === item.id ? { ...x, ...data } : x)) }));
      toast.success(next ? "Item taken down" : "Item restored", {
        description: item.name,
        action: { label: "Undo", onClick: () => setRemoved(ownerId, { ...item, removed_by_admin: next }) },
      });
    } catch (err) {
      toast.error("Couldn't update item", { description: (err as Error).message || "Try again." });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="font-display text-ink text-3xl font-extrabold tracking-tight">Communities</h1>
        <p className="text-muted text-sm mt-1">Organisers&apos; public pages: verify them, hide them from the directory, and review their merch</p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, handle or email…"
          aria-label="Search communities"
          className="w-full sm:w-80 bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-brand/40"
        />
        <div role="group" aria-label="Filter" className="flex gap-1 rounded-lg bg-mist p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${filter === f.value ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-danger text-sm mb-6">{error}</p>}

      <div className="bg-white border border-line rounded-xl p-6 overflow-x-auto">
        {loading && rows.length === 0 ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <p className="text-faint text-sm py-6 text-center">No communities match.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                {["Community", "Followers", "Events", "Merch", "Verified", "Hidden", ""].map((h, i) => (
                  <th scope="col" key={i} className="pb-3 pr-6 text-xs text-faint font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((c) => (
                <FragmentRows key={c.user_id}>
                  <tr className="align-middle">
                    <td className="py-3 pr-6">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink text-sm font-bold text-white">
                          {c.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.avatar_url} alt="" width={36} height={36} className="h-full w-full object-cover" />
                          ) : (
                            c.name.charAt(0).toUpperCase()
                          )}
                        </span>
                        <span className="min-w-0">
                          {c.handle ? (
                            <a href={publicHref(`/u/${c.handle}`)} target="_blank" rel="noopener noreferrer" className="block truncate text-ink font-semibold hover:underline">
                              {c.name}
                            </a>
                          ) : (
                            <span className="block truncate text-ink font-semibold">{c.name}</span>
                          )}
                          <span className="block truncate text-xs text-faint">
                            {c.handle ? `@${c.handle} · ` : ""}{c.email}
                            {!c.is_public && " · not listed by them"}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-6 tabular-nums text-body">{c.followers ?? "—"}</td>
                    <td className="py-3 pr-6 tabular-nums text-body">{c.events ?? "—"}</td>
                    <td className="py-3 pr-6 tabular-nums text-body">{c.merch ?? "—"}</td>
                    <td className="py-3 pr-6">
                      <Toggle on={c.verified} label={`${c.name} verified`} disabled={!can.moderate || busy !== ""} onChange={() => setFlag(c, "verified")} />
                    </td>
                    <td className="py-3 pr-6">
                      <Toggle
                        on={c.hidden_from_directory}
                        label={`${c.name} hidden from directory`}
                        disabled={!can.moderate || busy !== ""}
                        onChange={() => setFlag(c, "hidden_from_directory")}
                      />
                    </td>
                    <td className="py-3 text-right">
                      <button type="button" onClick={() => expand(c)} aria-expanded={open === c.user_id} className="text-xs font-bold text-muted hover:text-ink hover:underline">
                        {open === c.user_id ? "Close" : "Details"}
                      </button>
                    </td>
                  </tr>
                  {open === c.user_id && (
                    <tr>
                      <td colSpan={7} className="pb-4">
                        <div className="rounded-lg bg-mist p-4 space-y-4">
                          <div>
                            <p className="text-xs font-bold text-faint mb-1">Bio</p>
                            <p className="whitespace-pre-line text-sm text-ink">{c.bio || "—"}</p>
                            {c.location && <p className="text-xs text-muted mt-1">{c.location}</p>}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-faint mb-2">Merch</p>
                            {!merch[c.user_id] ? (
                              <p className="text-xs text-faint">Loading…</p>
                            ) : merch[c.user_id].length === 0 ? (
                              <p className="text-xs text-faint">No merch.</p>
                            ) : (
                              <ul className="divide-y divide-hairline">
                                {merch[c.user_id].map((m) => (
                                  <li key={m.id} className="flex items-center gap-3 py-2">
                                    <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white">
                                      {m.image_url && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={m.image_url} alt="" width={40} height={40} className="h-full w-full object-cover" />
                                      )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm text-ink">{m.name}</span>
                                      <span className="block text-xs text-muted">
                                        {m.price ? formatNaira(Number(m.price)) : "No price"}
                                        {m.removed_by_admin ? " · taken down by Byro" : !m.is_active ? " · hidden by them" : ""}
                                      </span>
                                    </span>
                                    {m.purchase_link && (
                                      <a href={m.purchase_link} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-muted hover:text-ink hover:underline">
                                        Link
                                      </a>
                                    )}
                                    {can.moderate && (
                                      <button
                                        type="button"
                                        onClick={() => setRemoved(c.user_id, m)}
                                        disabled={busy !== ""}
                                        className={`text-xs font-bold hover:underline disabled:opacity-50 ${m.removed_by_admin ? "text-good" : "text-danger"}`}
                                      >
                                        {m.removed_by_admin ? "Restore" : "Take down"}
                                      </button>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </FragmentRows>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
