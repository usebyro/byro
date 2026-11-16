"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import axiosInstance from "@/utils/axios";
import { useAuth } from "@/redux/useAuth";
import { calculateTicketFees } from "@/lib/pricing";
import { MAX_QUANTITY, readCart, writeCart } from "@/lib/merchCart";
import { naira } from "@/lib/merchOrders";

const input = "h-11 w-full rounded-xl border border-[#CBD3DF] bg-white px-3.5 text-base text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 aria-[invalid=true]:border-[#B42318]";
const card = "flex flex-col gap-3.5 rounded-[20px] bg-white p-5 sm:p-[22px]";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Shell({ seller, children }) {
  return (
    <div className="min-h-[100dvh] bg-[#F6F8FB] text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-ink focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-white">Skip to content</a>
      <header className="mx-auto flex max-w-[1040px] items-center justify-between gap-3 px-4 py-4 sm:px-8">
        <Link href="/" aria-label="Byro home"><Image src="/assets/images/logo.svg" alt="Byro" width={64} height={26} style={{ width: "auto", height: 26 }} priority /></Link>
        {seller && <span className="text-sm font-bold">{seller}</span>}
      </header>
      {children}
    </div>
  );
}

export default function MerchCheckoutClient({ handle }) {
  const { user, ready } = useAuth();
  const [profile, setProfile] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | missing
  const [cart, setCart] = useState([]);
  const [how, setHow] = useState("pickup");
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", note: "" });
  const [inArea, setInArea] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pickRef = useRef(null);
  const delRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setCart(readCart(handle));
    axiosInstance
      .get(`profile/${handle}/`)
      .then((res) => {
        if (!alive) return;
        setProfile(res.data);
        setState("ready");
      })
      .catch(() => alive && setState("missing"));
    return () => {
      alive = false;
    };
  }, [handle]);

  // Fill in what we already know about a signed-in buyer, once.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!ready || !user || prefilled.current) return;
    prefilled.current = true;
    setForm((f) => ({ ...f, email: f.email || user.email || "", name: f.name || user.display_name || user.name || "" }));
  }, [ready, user]);

  const checkout = profile?.merch_checkout;
  const delivery = checkout?.delivery?.enabled ? checkout.delivery : null;
  const deliveryOn = how === "delivery" && !!delivery;

  // Today's price and stock for what is in the cart; a line the seller took down is flagged, not silently dropped.
  const lines = useMemo(() => {
    const items = Object.fromEntries((profile?.merch_items || []).map((i) => [i.id, i]));
    return cart.map((l) => {
      const item = items[l.item_id];
      const stockLeft = item && item.stock !== null && item.stock !== undefined ? Math.max(0, item.stock) : null;
      const price = item?.price ? Number(item.price) : 0;
      return {
        ...l, item, price, total: price * l.quantity, stockLeft,
        problem: !item || !price ? "No longer available" : stockLeft !== null && stockLeft < l.quantity ? (stockLeft === 0 ? "Sold out" : `Only ${stockLeft} left`) : "",
      };
    });
  }, [cart, profile]);

  const subtotal = lines.reduce((n, l) => n + l.total, 0);
  const deliveryFee = deliveryOn ? Number(delivery.fee || 0) : 0;
  const amount = subtotal + deliveryFee;
  const needArea = deliveryOn && !!delivery.area && !inArea;
  const pickupPlace = (checkout?.pickup?.address || "").split(",").slice(-2).join(",").trim();
  const charge = amount > 0 ? Math.round(calculateTicketFees(amount, false, 0).paystackFee) : 0;
  const total = amount + charge;

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError("");
  };
  const update = (next) => {
    setCart(next);
    writeCart(handle, next);
  };
  const setQty = (idx, qty) => update(cart.map((l, i) => (i === idx ? { ...l, quantity: Math.max(1, Math.min(MAX_QUANTITY, qty)) } : l)));
  const remove = (idx) => update(cart.filter((_, i) => i !== idx));

  const problems = {
    name: form.name.trim() ? "" : "Enter your name.",
    email: EMAIL.test(form.email.trim()) ? "" : "That email doesn't look right. Check it and try again.",
    phone: deliveryOn && form.phone.replace(/\D/g, "").length < 7 ? "Enter a phone number the seller can call about your delivery." : "",
    address: deliveryOn && form.address.trim().length < 10 ? "Enter your full delivery address." : "",
    area: deliveryOn && delivery.area && !inArea ? `Confirm your address is in ${delivery.area.replace(/\s+only$/i, "")} to pay.` : "",
  };
  const cartProblem = lines.find((l) => l.problem);
  const blocked = lines.length === 0 || !!cartProblem || Object.values(problems).some(Boolean);

  const onRadioKey = (e) => {
    if (!delivery || !["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.key)) return;
    e.preventDefault();
    const next = how === "pickup" ? "delivery" : "pickup";
    setHow(next);
    (next === "pickup" ? pickRef : delRef).current?.focus();
  };

  const pay = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (blocked) {
      if (cartProblem) setError(`${cartProblem.item?.name || "An item"}: ${cartProblem.problem}. Remove it or change the quantity to continue.`);
      // Take keyboard and screen reader users to the first thing to fix, in the order the form shows them.
      const firstId = [["address", "addr"], ["area", "in-area"], ["name", "name"], ["email", "email"], ["phone", "phone"]].find(([key]) => problems[key])?.[1];
      if (firstId) document.getElementById(firstId)?.focus();
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { data } = await axiosInstance.post("merch-orders/checkout/", {
        handle,
        items: lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity, option: l.option || "" })),
        fulfilment: deliveryOn ? "delivery" : "pickup",
        name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
        address: deliveryOn ? form.address.trim() : "", note: form.note.trim(),
      });
      window.location.assign(data.authorization_url);
    } catch (err) {
      setError(err?.response?.data?.error || "We couldn't start your payment. You haven't been charged. Try again in a minute.");
      setSubmitting(false);
    }
  };

  if (state === "loading") {
    return (
      <Shell>
        <main id="main" className="mx-auto max-w-[640px] px-4 pb-16" aria-busy="true" aria-label="Loading checkout">
          <span className="block h-8 w-40 animate-pulse rounded-lg bg-[#E3E8F0] motion-reduce:animate-none" />
        </main>
      </Shell>
    );
  }
  const name = profile?.display_name || profile?.handle || "this seller";
  if (state === "missing" || !profile) {
    return (
      <Shell>
        <main id="main" className="mx-auto max-w-[640px] px-4 pb-16">
          <section className={card} role="alert">
            <h1 className="font-display text-2xl font-bold">We couldn&apos;t find that seller</h1>
            <Link href="/discover" className="text-sm font-bold text-[#2451D6]">Find communities</Link>
          </section>
        </main>
      </Shell>
    );
  }
  if (!checkout?.enabled) {
    return (
      <Shell seller={name}>
        <main id="main" className="mx-auto max-w-[640px] px-4 pb-16">
          <section className={card} role="status">
            <h1 className="font-display text-2xl font-bold">{name} isn&apos;t taking payments yet</h1>
            <p className="m-0 text-[15px] text-[#3B4252]">You can still see what they sell on their page.</p>
            <Link href={`/u/${handle}`} className="text-sm font-bold text-[#2451D6]">Back to {name}</Link>
          </section>
        </main>
      </Shell>
    );
  }
  if (lines.length === 0) {
    return (
      <Shell seller={name}>
        <main id="main" className="mx-auto max-w-[640px] px-4 pb-16">
          <section className={card}>
            <h1 className="font-display text-2xl font-bold">Your order is empty</h1>
            <p className="m-0 text-[15px] text-[#3B4252]">Pick something from {name}&apos;s merch to get started.</p>
            <Link href={`/u/${handle}`} className="flex h-12 items-center justify-center rounded-full bg-brand px-6 text-base font-bold text-white">See {name}&apos;s merch</Link>
          </section>
        </main>
      </Shell>
    );
  }

  return (
    <Shell seller={name}>
      <main id="main" className="mx-auto flex max-w-[1040px] flex-wrap items-start gap-6 px-4 pb-16 max-sm:pb-44 sm:px-8">
        <form onSubmit={pay} noValidate className="flex min-w-0 flex-[3_1_460px] flex-col gap-4" aria-label="Checkout">
          <div className="flex flex-col gap-1.5">
            <Link href={`/u/${handle}`} className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-bold text-[#2451D6] hover:underline">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
              <span className="sr-only">Back to</span>{" "}{name}
            </Link>
            <h1 className="font-display text-[clamp(26px,3vw,34px)] font-bold leading-tight tracking-tight">Checkout</h1>
          </div>

          <section className={card} aria-labelledby="how-title">
            <h2 id="how-title" className="m-0 font-display text-lg font-bold">{delivery ? "How do you want it?" : "Pick up your order"}</h2>
            {delivery && (
              <div role="radiogroup" aria-labelledby="how-title" onKeyDown={onRadioKey} className="grid gap-2.5 sm:grid-cols-2">
                <Choice buttonRef={pickRef} checked={how === "pickup"} onSelect={() => setHow("pickup")} icon="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 7.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" title="Pick up" price="Free" hint={pickupPlace || `From ${name}`} />
                <Choice buttonRef={delRef} checked={how === "delivery"} onSelect={() => setHow("delivery")} icon="M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" title="Deliver to me" price={Number(delivery.fee) > 0 ? naira(delivery.fee) : "Free"} hint={delivery.area || "Delivery available"} />
              </div>
            )}

            {!deliveryOn ? (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="m-0 text-base font-extrabold">Pick up from</h3>
                  {!delivery && <span className="text-[13px] font-bold text-[#5B6272]">Pickup only · Free</span>}
                </div>
                <div className="flex gap-3 rounded-[14px] bg-[#F6F8FB] p-3.5 text-sm leading-relaxed">
                  <svg className="mt-0.5 shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 7.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" /></svg>
                  <span className="flex flex-col gap-1"><b>{checkout.pickup.address}</b>{checkout.pickup.instructions && <span className="text-[#3B4252]">{checkout.pickup.instructions}</span>}</span>
                </div>
                <p className="m-0 text-[13px] text-[#5B6272]">We&apos;ll email you when it&apos;s ready, with a short code to show when you collect.</p>
              </>
            ) : (
              <div className="flex flex-col gap-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="m-0 text-base font-extrabold">Deliver to</h3>
                  {delivery.area && <span className="text-[13px] font-bold text-[#5B6272]">{delivery.area}</span>}
                </div>
                <Field label="Delivery address" error={touched && problems.address} htmlFor="addr">
                  <textarea id="addr" rows={3} autoComplete="street-address" className={`${input} h-auto py-3 leading-normal`} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="House number, street, area, city" aria-invalid={touched && !!problems.address} />
                </Field>
                {delivery.area && (
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <input id="in-area" type="checkbox" checked={inArea} onChange={(e) => setInArea(e.target.checked)} className="mt-0.5 h-[18px] w-[18px] accent-[#3669F6]" />
                    <span>This address is in {delivery.area.replace(/\s+only$/i, "")}.<span className="block text-[13px] text-[#5B6272]">{name} delivers in {delivery.area.replace(/\s+only$/i, "")} only.</span></span>
                  </label>
                )}
                {touched && problems.area && <p role="alert" className="m-0 text-[13px] font-bold text-[#B42318]">{problems.area}</p>}
                <Field label={<>Note for {name} <span className="font-medium text-[#5B6272]">(optional)</span></>} htmlFor="note">
                  <input id="note" className={input} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="Landmark, gate code, best time to call" maxLength={300} />
                </Field>
              </div>
            )}
          </section>

          <section className={card} aria-labelledby="you-title">
            <h2 id="you-title" className="m-0 font-display text-lg font-bold">Your details</h2>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Full name" error={touched && problems.name} htmlFor="name">
                <input id="name" className={input} autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={touched && !!problems.name} />
              </Field>
              <Field label={<>Phone{deliveryOn ? "" : <span className="font-medium text-[#5B6272]"> (optional)</span>}</>} error={touched && problems.phone} htmlFor="phone">
                <input id="phone" type="tel" className={input} autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={touched && !!problems.phone} />
              </Field>
            </div>
            <Field label="Email" error={touched && problems.email} htmlFor="email">
              <input id="email" type="email" className={input} autoComplete="email" spellCheck={false} value={form.email} onChange={(e) => set("email", e.target.value)} aria-invalid={touched && !!problems.email} />
            </Field>
            <p className="m-0 text-[13px] leading-normal text-[#5B6272]">
              Your receipt and order updates go to this email. {deliveryOn ? "The courier may call your phone." : `Phone is so ${name} can reach you about pickup.`}
            </p>
          </section>
        </form>

        <aside aria-label="Order summary" className="flex min-w-0 flex-[2_1_300px] flex-col gap-4 lg:sticky lg:top-4">
          <section className={card}>
            <h2 className="m-0 font-display text-lg font-bold">Your order</h2>
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
              {lines.map((l, i) => (
                <li key={`${l.item_id}-${l.option}`} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-grow break-words text-[15px] font-bold">{l.item?.name || "Item"}{l.option && <span className="font-medium text-[#5B6272]"> ({l.option})</span>}</span>
                    <span className="font-extrabold [font-variant-numeric:tabular-nums]">{l.price ? naira(l.total) : ""}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-full border border-[#E3E8F0]" role="group" aria-label={`Quantity of ${l.item?.name || "item"}`}>
                      <button type="button" onClick={() => setQty(i, l.quantity - 1)} disabled={l.quantity <= 1} aria-label="One fewer" className="flex h-11 w-11 items-center justify-center text-lg disabled:opacity-40">−</button>
                      <span className="w-7 text-center text-sm font-bold [font-variant-numeric:tabular-nums]" aria-live="polite">{l.quantity}</span>
                      <button type="button" onClick={() => setQty(i, l.quantity + 1)} disabled={l.quantity >= MAX_QUANTITY || (l.stockLeft !== null && l.quantity >= l.stockLeft)} aria-label="One more" className="flex h-11 w-11 items-center justify-center text-lg disabled:opacity-40">+</button>
                    </div>
                    <button type="button" onClick={() => remove(i)} className="inline-flex min-h-11 items-center px-2 text-[13px] font-bold text-[#5B6272] hover:text-[#B42318]">Remove<span className="sr-only"> {l.item?.name}</span></button>
                    {l.problem && <span role="alert" className="ml-auto text-[13px] font-bold text-[#B42318]">{l.problem}</span>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 text-sm [font-variant-numeric:tabular-nums]">
              <div className="flex justify-between"><span>Items</span><span>{naira(subtotal)}</span></div>
              <div className="flex justify-between"><span>{deliveryOn ? "Delivery" : "Pickup"}</span><span>{deliveryOn && deliveryFee > 0 ? naira(deliveryFee) : "Free"}</span></div>
              <div className="flex justify-between"><span>Payment charge (estimate)</span><span>{naira(charge)}</span></div>
              <div className="flex justify-between border-t border-[#EEF1F6] pt-2.5 text-[17px] font-extrabold max-sm:hidden"><span>Total</span><span>{naira(total)}</span></div>
            </div>
            {error && <p role="alert" className="m-0 text-sm font-bold text-[#B42318]">{error}</p>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:bg-white max-sm:px-4 max-sm:pt-3 max-sm:pb-[calc(12px+env(safe-area-inset-bottom))] max-sm:shadow-[0_-1px_0_rgba(20,22,28,.08)]">
              {needArea && <span id="pay-hint" className="basis-full text-center text-[13px] font-bold text-[#8A4B00]">Tick “This address is in {delivery.area.replace(/\s+only$/i, "")}” to pay.</span>}
              <div className="flex shrink-0 flex-col text-xs text-[#5B6272] sm:hidden"><span>Total</span><b className="text-lg text-ink [font-variant-numeric:tabular-nums]">{naira(total)}</b></div>
              <button
                type="button"
                onClick={pay}
                disabled={submitting}
                aria-disabled={needArea || (touched && blocked) || undefined}
                aria-describedby={needArea ? "pay-hint" : undefined}
                className="flex h-[52px] w-full items-center justify-center rounded-full bg-brand px-4 text-base font-bold text-white transition-[filter,scale] hover:brightness-90 active:scale-[0.97] disabled:cursor-progress disabled:opacity-70 aria-disabled:opacity-60 max-sm:w-auto max-sm:flex-1"
              >
                {submitting ? "Taking you to Paystack" : `Pay ${naira(total)}`}
              </button>
            </div>
            <p className="m-0 text-center text-[13px] text-[#5B6272] max-sm:hidden">Payments by Paystack</p>
          </section>
        </aside>
      </main>
    </Shell>
  );
}

function Choice({ checked, onSelect, title, price, hint, icon, buttonRef }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={checked ? 0 : -1}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-[20px] bg-white p-3.5 text-left transition-[border-color,box-shadow] motion-reduce:transition-none focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-brand ${checked ? "border border-brand shadow-[inset_0_0_0_1px_#3669F6]" : "border border-[#E3E8F0]"}`}
    >
      <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${checked ? "bg-brand text-white" : "bg-[#F3F6FB] text-[#3B4252]"}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
      </span>
      <span className="flex min-w-0 flex-grow flex-col gap-px">
        <b className="text-[15px]">{title}</b>
        <span className="truncate text-[13px] text-[#5B6272]">{hint}</span>
      </span>
      <b className="shrink-0 text-[15px] [font-variant-numeric:tabular-nums]">{price}</b>
    </button>
  );
}

function Field({ label, hint, error, htmlFor, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-bold">{label}</label>
      {children}
      {error ? <p role="alert" className="m-0 text-[13px] font-bold text-[#B42318]">{error}</p> : hint ? <p className="m-0 text-[13px] text-[#5B6272]">{hint}</p> : null}
    </div>
  );
}
