"use client";

import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon, Attachment01Icon } from "@hugeicons/core-free-icons";
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

const initials = (r: SupportRequest) =>
  (r.name || r.email || "?").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** "14:05" for a chat line, or nothing if tawk.to sent no usable time. */
const clock = (t: string) => {
  const d = t ? new Date(t) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
};

/** The path of the page they chatted from, without the domain. */
const pageLabel = (url: string) => {
  try {
    const u = new URL(url);
    return `On ${u.pathname === "/" ? "the home page" : u.pathname}`;
  } catch {
    return url;
  }
};

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
  const [team, setTeam] = useState<string[]>([]);
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
      setTeam(data.team || []);
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

  const update = async (r: SupportRequest, body: { status?: "open" | "done"; assign?: string }, done: string, undo?: typeof body) => {
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
          className="inline-flex items-center gap-1 text-xs font-bold text-brand-dark hover:underline sm:ml-auto"
        >
          Open tawk.to to reply
          <HugeiconsIcon icon={LinkSquare02Icon} size={14} color="currentColor" aria-hidden="true" />
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
        <SidePanel
          wide
          title={current.name || current.email || "Visitor"}
          subtitle={`${sourceLabel(current)} · ${fmtDateTime(current.created_at)}`}
          onClose={() => setOpenId(null)}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              {current.email && (
                <Button size="sm" onClick={() => onLookup(current.email)}>Look up their orders</Button>
              )}
              <a
                href={TAWK_DASHBOARD}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold text-muted transition-colors hover:bg-mist hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Reply in tawk.to
                <HugeiconsIcon icon={LinkSquare02Icon} size={14} color="currentColor" aria-hidden="true" />
              </a>
              {canAct && (
                <span className="ml-auto">
                  {current.status === "open" ? (
                    <Button size="sm" variant="primary" disabled={busy} onClick={() => update(current, { status: "done" }, "Marked done", { status: "open" })}>
                      Mark done
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy} onClick={() => update(current, { status: "open" }, "Reopened")}>Reopen</Button>
                  )}
                </span>
              )}
            </div>
          }
        >
          <div className="space-y-6 p-6">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 font-display text-sm font-bold text-brand-dark"
              >
                {initials(current)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{current.name || "No name given"}</p>
                {current.email ? (
                  <a href={`mailto:${current.email}`} className="block truncate text-sm text-brand-dark hover:underline">{current.email}</a>
                ) : (
                  <p className="text-sm text-faint">No email given</p>
                )}
                <p className="mt-1 text-xs text-faint">{[current.location, current.page && pageLabel(current.page)].filter(Boolean).join(" · ") || "Location unknown"}</p>
              </div>
              <StatusBadge tone={current.status === "open" ? "waiting" : "neutral"}>{current.status === "open" ? "Open" : "Done"}</StatusBadge>
            </div>

            <div className="grid gap-3 rounded-xl bg-mist p-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-bold text-muted">
                Handled by
                <select
                  value={current.assigned_to_email}
                  disabled={!canAct || busy}
                  onChange={(e) => {
                    const to = e.target.value;
                    update(current, { assign: to }, to ? (to === me.email ? "Assigned to you" : `Assigned to ${to}`) : "Unassigned");
                  }}
                  className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
                >
                  <option value="">Nobody yet</option>
                  {team
                    .concat(current.assigned_to_email && !team.includes(current.assigned_to_email) ? [current.assigned_to_email] : [])
                    .map((email) => (
                      <option key={email} value={email}>
                        {email === me.email ? `Me (${email})` : email}
                      </option>
                    ))}
                </select>
              </label>
              <div className="flex flex-col gap-1 text-xs font-bold text-muted">
                {current.status === "done" ? "Marked done" : "Last update"}
                <p className="flex h-9 items-center text-sm font-semibold text-ink">
                  {current.status === "done"
                    ? `${fmtDateTime(current.closed_at)}${current.closed_by_email ? ` by ${current.closed_by_email.split("@")[0]}` : ""}`
                    : fmtDateTime(current.updated_at)}
                </p>
              </div>
            </div>

            <section aria-labelledby="request-thread">
              <h3 id="request-thread" className="mb-3 text-xs font-bold text-faint">
                {current.transcript.length > 0 ? "Conversation" : current.source === "tawk_ticket" ? "Their message" : "First message"}
              </h3>
              {current.subject && <p className="mb-2 font-display text-lg font-bold text-ink">{current.subject}</p>}
              {current.transcript.length > 0 ? (
                <ol className="flex flex-col gap-3" aria-label="Chat transcript">
                  {current.transcript.filter((l) => l.text || l.files.some(Boolean)).map((l, i) =>
                    l.who === "system" ? (
                      <li key={i} className="self-center rounded-full bg-mist px-3 py-1 text-[11px] text-muted">{l.text}</li>
                    ) : (
                      <li key={i} className={`flex max-w-[85%] flex-col gap-1 ${l.who === "agent" ? "items-end self-end" : "items-start self-start"}`}>
                        <span className="px-1 text-[11px] text-faint">
                          <b className="font-bold text-muted">{l.name || (l.who === "agent" ? "Byro" : "Visitor")}</b>
                          {clock(l.time) && ` · ${clock(l.time)}`}
                        </span>
                        <div
                          className={`whitespace-pre-line break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                            l.who === "agent" ? "rounded-br-md bg-brand text-white" : "rounded-bl-md bg-mist text-ink"
                          }`}
                        >
                          {l.text}
                          {l.files.filter(Boolean).map((f) => (
                            <a key={f} href={f!} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 text-xs font-bold underline-offset-2 hover:underline">
                              <HugeiconsIcon icon={Attachment01Icon} size={14} color="currentColor" aria-hidden="true" />
                              Attachment
                            </a>
                          ))}
                        </div>
                      </li>
                    ),
                  )}
                </ol>
              ) : current.message ? (
                <p className="whitespace-pre-line break-words rounded-2xl rounded-bl-md bg-mist px-4 py-3 text-sm leading-relaxed text-ink">{current.message}</p>
              ) : (
                <p className="rounded-xl border border-dashed border-line p-4 text-sm text-faint">
                  The chat is still going. The full conversation appears here when it ends.
                </p>
              )}
            </section>
          </div>
        </SidePanel>
      )}
    </>
  );
}
