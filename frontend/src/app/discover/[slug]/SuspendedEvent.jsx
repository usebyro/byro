import Link from "next/link";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// "2026-10-11" and "09:00" arrive as plain strings; read them as written so the date never shifts with the viewer's timezone.
function dateParts(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || "");
  return m ? { month: MONTHS[Number(m[2]) - 1], date: String(Number(m[3])) } : null;
}

function timeLabel(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

const POINTS = [
  {
    title: "Your ticket is safe",
    body: "Your ticket is still valid. You don't need to do anything.",
    icon: <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />,
  },
  {
    title: "We'll keep you posted",
    body: "You'll get an email as soon as the event is back on or changes.",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </>
    ),
  },
  {
    title: "If it gets cancelled, you get a refund",
    body: "We'll refund you through the way you paid and send an email once we do.",
    icon: (
      <>
        <path d="M4 12a8 8 0 1 0 2.4-5.7" />
        <path d="M4 4v4h4" />
      </>
    ),
  },
];

export default function SuspendedEvent({ event }) {
  const when = dateParts(event.day);
  const details = [event.organizer, event.location].filter(Boolean).join(" · ");
  const time = timeLabel(event.time_from);

  return (
    <main className="mx-auto flex w-full max-w-[600px] flex-1 flex-col items-center gap-5 px-4 pb-16 pt-6 text-center md:gap-[22px] md:pt-10">
      <svg
        viewBox="0 0 400 280"
        role="img"
        aria-label="Illustration of a ticket on hold"
        className="block h-auto w-[300px] max-w-full md:w-[360px]"
      >
        <circle cx="200" cy="146" r="118" fill="#EEF3FF" />
        <circle cx="62" cy="58" r="16" fill="none" stroke="#3669F6" strokeWidth="3" strokeDasharray="5 5" />
        <rect x="326" y="40" width="26" height="26" rx="6" fill="#FFD84D" transform="rotate(18 339 53)" />
        <circle cx="344" cy="214" r="7" fill="#14161C" />
        <circle cx="58" cy="206" r="10" fill="#FFD84D" />
        <path d="M30 130 l10 0 M35 125 l0 10" stroke="#14161C" strokeWidth="3" strokeLinecap="round" />
        <path d="M362 128 l10 0 M367 123 l0 10" stroke="#3669F6" strokeWidth="3" strokeLinecap="round" />
        <g transform="rotate(-8 200 150)">
          <path
            d="M96 92 h208 a14 14 0 0 1 14 14 v20 a20 20 0 0 0 0 40 v20 a14 14 0 0 1 -14 14 h-208 a14 14 0 0 1 -14 -14 v-20 a20 20 0 0 0 0 -40 v-20 a14 14 0 0 1 14 -14z"
            fill="#FFFFFF"
            stroke="#14161C"
            strokeWidth="3"
          />
          <line x1="246" y1="98" x2="246" y2="194" stroke="#14161C" strokeWidth="3" strokeDasharray="6 7" />
          <rect x="108" y="114" width="96" height="12" rx="6" fill="#14161C" />
          <rect x="108" y="138" width="120" height="9" rx="4.5" fill="#C9D0DC" />
          <rect x="108" y="156" width="78" height="9" rx="4.5" fill="#C9D0DC" />
          <rect x="262" y="126" width="40" height="40" rx="8" fill="none" stroke="#C9D0DC" strokeWidth="3" />
        </g>
        <g transform="rotate(10 286 92)">
          <line x1="250" y1="40" x2="286" y2="70" stroke="#14161C" strokeWidth="2.5" />
          <circle cx="250" cy="40" r="5" fill="#14161C" />
          <rect x="244" y="68" width="92" height="40" rx="10" fill="#FFD84D" stroke="#14161C" strokeWidth="3" />
          <text x="290" y="94" textAnchor="middle" fontWeight="800" fontSize="16" fill="#14161C">
            ON HOLD
          </text>
        </g>
        <circle cx="140" cy="214" r="30" fill="#3669F6" stroke="#14161C" strokeWidth="3" />
        <rect x="128" y="200" width="8" height="28" rx="3" fill="#FFFFFF" />
        <rect x="144" y="200" width="8" height="28" rx="3" fill="#FFFFFF" />
      </svg>

      <span className="flex h-7 items-center gap-1.5 rounded-full bg-[#FFF4CC] px-3 text-xs font-extrabold tracking-[0.08em] text-[#6B4A08]">
        <span className="h-[7px] w-[7px] rounded-full bg-[#D99A00]" aria-hidden="true" />
        EVENT SUSPENDED
      </span>

      <div className="flex flex-col gap-2.5">
        <h1 className="font-display text-[30px] font-bold leading-[1.05] tracking-[-0.02em] text-ink md:text-[44px]">
          This event is on hold
        </h1>
        <p className="text-[15px] leading-[1.6] text-[#3B4252] md:text-[17px]">
          We&apos;ve paused this event while our team takes a look, so tickets can&apos;t be bought right now. If the
          event isn&apos;t restored, everyone with a ticket gets a refund.
        </p>
      </div>

      <div className="flex w-full items-center gap-3.5 rounded-[18px] border border-[#E3E8F0] bg-white p-3.5 text-left md:px-4">
        {when && (
          <div
            aria-hidden="true"
            className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-[#F3F6FB]"
          >
            <span className="text-[11px] font-extrabold text-muted">{when.month}</span>
            <span className="font-display text-xl font-bold leading-none">{when.date}</span>
          </div>
        )}
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <span className="break-words text-base font-extrabold text-ink">{event.name}</span>
          {(details || time) && (
            <span className="break-words text-[13px] text-muted">{[details, time].filter(Boolean).join(" · ")}</span>
          )}
        </div>
        <span className="hidden h-[26px] shrink-0 items-center rounded-full bg-[#F3F6FB] px-2.5 text-xs font-extrabold text-muted sm:flex">
          Sales paused
        </span>
      </div>

      <section className="flex w-full flex-col gap-4 rounded-[20px] border border-[#E3E8F0] bg-white p-[18px] text-left md:px-6 md:py-[22px]">
        <h2 className="text-[13px] font-extrabold tracking-[0.08em] text-muted">ALREADY HAVE A TICKET?</h2>
        {POINTS.map((p) => (
          <div key={p.title} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#F3F6FB]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14161C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {p.icon}
              </svg>
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-extrabold text-ink">{p.title}</span>
              <span className="text-sm leading-[1.5] text-muted">{p.body}</span>
            </div>
          </div>
        ))}
      </section>

      <div className="flex w-full flex-col gap-2.5 md:w-auto md:flex-row">
        <Link
          href="/discover"
          className="flex h-[50px] items-center justify-center rounded-full bg-brand px-[26px] text-base font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Find other events
        </Link>
        <a
          href="mailto:support@usebyro.com"
          className="flex h-[50px] items-center justify-center rounded-full border border-[#D5DBE5] bg-white px-[22px] text-[15px] font-bold text-ink transition-[background-color,scale] hover:bg-[#F7F9FC] active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Contact support
        </a>
      </div>

      <p className="text-[13px] leading-[1.6] text-muted">
        Are you the organiser? Check your email for details, or write to{" "}
        <a href="mailto:support@usebyro.com" className="font-bold text-[#2451D6]">
          support@usebyro.com
        </a>
        .
      </p>
    </main>
  );
}
