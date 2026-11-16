"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import axiosInstance from "@/utils/axios";
import BusyButton, { useButtonResult } from "@/components/dashboard/v2/BusyButton";
import { naira } from "@/lib/merchOrders";

const toForm = (s) => ({
  pickup_address: s?.pickup_address || "",
  pickup_instructions: s?.pickup_instructions || "",
  delivery_enabled: !!s?.delivery_enabled,
  delivery_area: s?.delivery_area || "",
  delivery_fee: s?.delivery_fee && Number(s.delivery_fee) > 0 ? String(Math.round(Number(s.delivery_fee))) : "",
});

/**
 * How buyers get their order. Pickup is always on and free; delivery is the organiser's choice.
 * Merch can't take payment until there is a pickup address.
 * The parent gives this a `key` built from the saved settings, so the form starts fresh after each save.
 */
export default function FulfilmentSettings({ settings, onSaved, id = "fulfilment" }) {
  const [form, setForm] = useState(() => toForm(settings));
  const [saving, setSaving] = useState(false);
  const [result, flash] = useButtonResult();
  const [error, setError] = useState("");

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError("");
  };

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(settings));

  // Leaving with changes that were not saved asks first, so a new pickup address is not lost by accident.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const missingAddress = !form.pickup_address.trim();

  const save = async (e) => {
    e.preventDefault();
    if (missingAddress) {
      setError("Add a pickup address so buyers know where to collect.");
      return;
    }
    setSaving(true);
    flash(null);
    try {
      const { data } = await axiosInstance.put("dashboard/merch-orders/fulfilment/", {
        ...form,
        delivery_fee: form.delivery_enabled && form.delivery_fee ? form.delivery_fee : "0",
      });
      flash("done");
      onSaved?.(data);
      toast.success("Saved", {
        description: data.told_buyers ? `${data.told_buyers} ${data.told_buyers === 1 ? "buyer was" : "buyers were"} emailed the new pickup address.` : undefined,
      });
    } catch (err) {
      flash("failed");
      setError(err?.response?.data?.error || "That didn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const fee = Number(form.delivery_fee || 0);
  const shortAddress = form.pickup_address.trim().split(",").slice(0, 2).join(",") || "Add your pickup address";

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="v-card v-bf grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_320px]" style={{ "--i": 3 }}>
      <form onSubmit={save} className="flex min-w-0 flex-col gap-5" noValidate>
        <div className="flex flex-col gap-1">
          <h2 id={`${id}-title`} className="v-h2 !text-[19px]">How buyers get their order</h2>
          <p className="v-hint m-0">Pickup is always on and free. Add delivery if you can send orders out.</p>
        </div>

        {missingAddress && (
          <p role="status" className="m-0 rounded-[14px] bg-[#FFF6E5] p-3.5 text-[13px] text-[#6B4A08]">
            <b className="text-[#8A4B00]">Buy is switched off.</b> Buyers can see your merch, but they can&apos;t pay until you add where they can collect it.
          </p>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="m-0 text-[15px] font-extrabold">Pickup</h3>
            <span className="v-hint">Always on, free</span>
          </div>
          <label className="flex flex-col gap-2">
            <span className="v-lbl">Pickup address</span>
            <input
              className="v-input"
              type="text"
              value={form.pickup_address}
              onChange={(e) => set("pickup_address", e.target.value)}
              placeholder="Where buyers collect their order"
              maxLength={255}
              autoComplete="off"
              aria-invalid={error && missingAddress ? "true" : undefined}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="v-lbl">Pickup instructions <span className="font-medium text-muted">(optional)</span></span>
            <input
              className="v-input"
              type="text"
              value={form.pickup_instructions}
              onChange={(e) => set("pickup_instructions", e.target.value)}
              placeholder="Opening times, who to ask for, where to park"
              maxLength={300}
            />
          </label>
        </div>

        <div className="flex flex-col gap-4 border-t border-hairline pt-5">
          <div className="flex items-start justify-between gap-4">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span id={`${id}-delivery-label`} className="text-[15px] font-extrabold">Delivery</span>
              <span className="v-hint">{form.delivery_enabled ? "Buyers can choose delivery at checkout." : "Off. Buyers can only pick up."}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={form.delivery_enabled}
              aria-labelledby={`${id}-delivery-label`}
              onClick={() => set("delivery_enabled", !form.delivery_enabled)}
              className={`relative h-7 w-12 shrink-0 rounded-full border-0 transition-colors motion-reduce:transition-none ${form.delivery_enabled ? "bg-[#3669F6]" : "bg-[#C9D0DC]"}`}
            >
              <span aria-hidden="true" className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-[left] motion-reduce:transition-none ${form.delivery_enabled ? "left-[23px]" : "left-[3px]"}`} />
            </button>
          </div>

          {form.delivery_enabled && (
            <>
              <label className="flex flex-col gap-2">
                <span className="v-lbl">Where you deliver</span>
                <input
                  className="v-input"
                  type="text"
                  value={form.delivery_area}
                  onChange={(e) => set("delivery_area", e.target.value)}
                  placeholder="Lagos only"
                  maxLength={120}
                />
                <span className="v-hint">Buyers see this before they choose delivery.</span>
              </label>
              <label className="flex flex-col gap-2">
                <span className="v-lbl">Delivery fee <span className="font-medium text-muted">(optional)</span></span>
                <input
                  className="v-input"
                  type="text"
                  inputMode="numeric"
                  value={form.delivery_fee}
                  onChange={(e) => set("delivery_fee", e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="₦ Leave empty for free delivery"
                  aria-label="Delivery fee in naira"
                />
                <span className="v-hint">Buyers pay this at checkout. It goes to you in full.</span>
              </label>
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="m-0 text-sm font-bold text-[#B42318]">{error}</p>
        )}

        <div className="flex items-center gap-3">
          <BusyButton type="submit" className="v-btn v-btn-p v-btn-lg" busy={saving} result={result} busyLabel="Saving" doneLabel="Saved" disabled={!dirty && !result}>
            Save how buyers get orders
          </BusyButton>
          {dirty && !saving && <span className="v-hint">Unsaved changes</span>}
        </div>
      </form>

      <aside aria-label="What buyers see at checkout" className="flex flex-col gap-3 self-start rounded-2xl bg-[#F7F9FC] p-4">
        <span className="v-eyebrow">What buyers see at checkout</span>
        <p className="m-0 text-[15px] font-extrabold">How do you want it?</p>
        {missingAddress ? (
          <p className="v-hint m-0">Buy is off until you add a pickup address.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-col gap-0.5 rounded-xl border-2 border-[#3669F6] bg-white p-3">
              <span className="flex justify-between gap-2 text-sm font-extrabold"><span>Pick up</span><span className="v-tab">Free</span></span>
              <span className="v-hint break-words">{shortAddress}</span>
            </div>
            {form.delivery_enabled && (
              <div className="flex flex-col gap-0.5 rounded-xl border border-[#E3E8F0] bg-white p-3">
                <span className="flex justify-between gap-2 text-sm font-extrabold"><span>Deliver to me</span><span className="v-tab">{fee > 0 ? naira(fee) : "Free"}</span></span>
                <span className="v-hint break-words">{form.delivery_area.trim() || "Delivery area not set"}</span>
              </div>
            )}
          </div>
        )}
        <span className="v-hint">Updates as you type.</span>
      </aside>
    </section>
  );
}
