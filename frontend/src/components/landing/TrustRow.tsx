import { Reveal } from "./Reveal";

const items = [
  {
    title: "Secure checkout",
    body: "Card, transfer or USSD through Paystack.",
    bg: "bg-sky",
    icon: (
      <>
        <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
        <path d="M8.5 12l2.5 2.5 4.5-4.5" />
      </>
    ),
    color: "#3669F6",
  },
  {
    title: "Tickets, instantly",
    body: "QR ticket and calendar invite by email.",
    bg: "bg-blush",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </>
    ),
    color: "#C2527A",
  },
  {
    title: "Real people to help",
    body: "Questions about a ticket? Our team answers.",
    bg: "bg-butter border border-[#F3EBC0]",
    icon: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
    color: "#A16207",
  },
];

export default function TrustRow() {
  return (
    <section className="mx-auto grid max-w-[1440px] gap-8 px-4 pt-16 md:grid-cols-3 md:gap-12 md:px-12 md:pt-[120px] xl:px-24">
      {items.map((it, i) => (
        <Reveal key={it.title} delay={i * 130} className="flex gap-4">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${it.bg}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={it.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {it.icon}
            </svg>
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-extrabold">{it.title}</h3>
            <p className="text-[15px] leading-[1.5] text-muted">{it.body}</p>
          </div>
        </Reveal>
      ))}
    </section>
  );
}
