"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAdminMe } from "@/components/admin/AdminMe";
import { Button, SidePanel, SkeletonRows, StatusBadge, fmtDateTime } from "@/components/admin/ui";

export interface SupportRequest {
  id: number;
  source: "tawk_chat" | "tawk_ticket";
  reference: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  transcript: { who: "agent" | "visitor" | "system"; name: string; text: string; time: string; files: (string | null)[] }[];
  location: string;
  page: string;
  status: "open" | "done";
  assigned_to_email: string;
  closed_by_email: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "mine", label: "Mine" },
  { value: "done", label: "Done" },
  { value: "", label: "All" },
];

const TAWK_DASHBOARD = "https://dashboard.tawk.to/";

const sourceLabel = (r: SupportRequest) =>
  r.source === "tawk_ticket" ? `Offline message${r.reference ? ` #${r.reference}` : ""}` : "Live chat";

async function patch(id: number, body: unknown) {
  const res = await fetch(`/api/admin/support/requests/${id}`, { method: "PATCH", body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Try again.");
  return data as SupportRequest;
}

/** Chats and offline messages from tawk.to, so the team can see who needs help and who is on it. */
export default function SupportRequests({ onLookup }: { onLookup: (email: string) => void }) {
  const me = useAdminMe();
  const canAct = me.can.moderate;
  const [filter, setFilter] = useState("open");
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<SupportRequest[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter === "mine") params.set("mine", "1");
    else if (filter) params.set("status", filter);
    if (term.trim()) params.set("search", term.trim());
    try {
      const res = await fetch(`/api/admin/support/requests?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      setRows(data.requests || []);
      setConfigured(data.configured !== false);
      setError("");
    } catch {
      setError("Couldn't load requests.");
    }
  }, [filter, term]);

  useEffect(() => {
    const t = setTimeout(load, term ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, term]);

  const current = rows?.find((r) => r.id === openId) || null;

  const update = async (r: SupportRequest, body: { status?: "open" | "done"; assign?: "me" | "" }, done: string, undo?: typeof body) => {
    setBusy(true);
    try {
      const saved = await patch(r.id, body);
      setRows((list) => list?.map((x) => (x.id === saved.id ? saved : x)) || null);
      toast.success(done, {
        description: r.name || r.email || undefined,
        action: undo ? { label: "Undo", onClick: () => update(saved, undo, "Undone") } : undefined,
      });
    } catch (err) {
      toast.error("Couldn't update request", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!configured && (
        <p className="mb-6 rounded-xl border border-waiting-hover bg-waiting-tint p-4 text-sm text-waiting">
          tawk.to isn&apos;t connected yet, so new chats won&apos;t show here. Set <code className="font-mono">TAWK_WEBHOOK_SECRET</code> on
          the server and add the webhook in tawk.to (see OPS_NOTES).
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter requests" className="flex w-fit flex-wrap gap-1 rounded-lg bg-mist p-1">
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
        <label htmlFor="request-q" className="sr-only">Search requests</label>
        <input
          id="request-q"
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Name, email or words in the message…"
          autoComplete="off"
          className="w-full sm:w-80 bg-mist border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-brand/40"
        />
        <a
          href={TAWK_DASHBOARD}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold text-brand-dark hover:underline sm:ml-auto"
        >
          Open tawk.to to reply ↗
        </a>
      </div>

      {error && <p className="text-danger text-sm mb-6">{error}</p>}

      {rows === null && !error && <SkeletonRows rows={4} label="Loading requests" />}

      {rows?.length === 0 && (
        <p className="bg-white border border-line rounded-xl p-6 text-faint text-sm text-center">
          {filter === "open" && !term ? "Nobody is waiting for help. All clear." : "No requests here."}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {rows?.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setOpenId(r.id)}
              className="w-full text-left bg-white border border-line rounded-xl p-4 hover:border-brand/40 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-ink">{r.name || r.email || "Visitor"}</span>
                {r.email && r.name && <span className="text-xs text-muted">{r.email}</span>}
                <span className="ml-auto flex items-center gap-2">
                  {r.assigned_to_email && (
                    <span className="text-xs text-faint">
                      {r.assigned_to_email === me.email ? "You're on it" : r.assigned_to_email}
                    </span>
                  )}
                  <StatusBadge tone={r.status === "open" ? "waiting" : "neutral"}>{r.status === "open" ? "Open" : "Done"}</StatusBadge>
                </span>
              </div>
              <p className="mt-1 text-sm text-ink line-clamp-2">
                {r.subject && <b className="mr-1">{r.subject}.</b>}
                {r.message || <span className="text-faint">No message yet</span>}
              </p>
              <p className="mt-1 text-xs text-faint">
                {sourceLabel(r)} · {fmtDateTime(r.created_at)}
                {r.location ? ` · ${r.location}` : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>

      {current && (
        <SidePanel title={current.name || current.email || "Visitor"} subtitle={`${sourceLabel(current)} · ${fmtDateTime(current.created_at)}`} onClose={() => setOpenId(null)}>
          <div className="flex flex-col gap-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><dt className="text-xs text-faint">Email</dt><dd className="text-ink break-all">{current.email || "—"}</dd></div>
              <div><dt className="text-xs text-faint">Where</dt><dd className="text-ink">{current.location || "—"}</dd></div>
              <div><dt className="text-xs text-faint">Status</dt><dd className="text-ink">
                {current.status === "open" ? "Open" : `Done${current.closed_by_email ? ` by ${current.closed_by_email}` : ""}`}
              </dd></div>
              <div><dt className="text-xs text-faint">Handling it</dt><dd className="text-ink break-all">{current.assigned_to_email || "Nobody yet"}</dd></div>
              {current.page && (
                <div className="col-span-2"><dt className="text-xs text-faint">Page they were on</dt><dd className="text-ink break-all text-xs">{current.page}</dd></div>
              )}
            </dl>

            <div className="flex flex-wrap gap-2">
              {current.email && (
                <Button size="sm" onClick={() => onLookup(current.email)}>Look up their orders</Button>
              )}
              {canAct && (current.assigned_to_email === me.email ? (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => update(current, { assign: "" }, "Unassigned")}>Unassign me</Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => update(current, { assign: "me" }, "Assigned to you")}>Assign to me</Button>
              ))}
              {canAct && (current.status === "open" ? (
                <Button size="sm" variant="primary" disabled={busy} onClick={() => update(current, { status: "done" }, "Marked done", { status: "open" })}>Mark done</Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => update(current, { status: "open" }, "Reopened")}>Reopen</Button>
              ))}
            </div>

            {current.subject && <h3 className="font-display text-lg font-bold text-ink">{current.subject}</h3>}

            {current.transcript.length > 0 ? (
              <ol className="flex flex-col gap-2" aria-label="Chat transcript">
                {current.transcript.filter((l) => l.text || l.files.some(Boolean)).map((l, i) => (
                  <li
                    key={i}
                    className={
                      l.who === "system"
                        ? "self-center text-xs text-faint"
                        : `max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-line break-words ${l.who === "agent" ? "self-end bg-brand/10 text-ink" : "self-start bg-mist text-ink"}`
                    }
                  >
                    {l.who !== "system" && <span className="block text-[11px] font-bold text-muted">{l.name || (l.who === "agent" ? "Byro" : "Visitor")}</span>}
                    {l.text}
                    {l.files.filter(Boolean).map((f) => (
                      <a key={f} href={f!} target="_blank" rel="noopener noreferrer" className="block text-xs font-bold text-brand-dark hover:underline">
                        Attachment ↗
                      </a>
                    ))}
                  </li>
                ))}
              </ol>
            ) : current.message ? (
              <p className="whitespace-pre-line break-words rounded-lg bg-mist p-3 text-sm text-ink">{current.message}</p>
            ) : (
              <p className="text-sm text-faint">The chat is still going. The full conversation appears here when it ends.</p>
            )}

            <p className="text-xs text-faint">
              Replies happen in tawk.to.{" "}
              <a href={TAWK_DASHBOARD} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-dark hover:underline">
                Open tawk.to ↗
              </a>
            </p>
          </div>
        </SidePanel>
      )}
    </>
  );
}
