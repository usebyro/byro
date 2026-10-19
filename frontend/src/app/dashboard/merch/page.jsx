"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import axiosInstance from "@/utils/axios";
import { useAuth } from "@/redux/useAuth";
import { useConfirm } from "@/components/admin/ui";
import MerchSlideshow from "@/components/merch/MerchSlideshow";
import SectionError from "@/components/dashboard/v2/SectionError";

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  stock: "",
  purchase_link: "",
  is_active: true,
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 6;
const LOW_STOCK = 5;
const BAG_PATH = "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2";

function fmtPrice(price) {
  if (price === null || price === undefined || price === "") return "Price on request";
  return `₦${Number(price).toLocaleString("en-NG")}`;
}

const hasStock = (item) => item.stock !== null && item.stock !== undefined && item.stock !== "";

// "https://paystack.shop/x/tee" → "paystack.shop/x/tee"
const shortLink = (url) => (url || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

function stockCell(item) {
  if (!hasStock(item)) return { text: "No limit", ink: "text-muted" };
  const n = Number(item.stock);
  if (n <= 0) return { text: "Sold out", ink: "text-muted" };
  if (n <= LOW_STOCK) return { text: `${n} left`, ink: "text-[#8A4B00]" };
  return { text: n.toLocaleString("en-NG"), ink: "text-ink" };
}

function statusOf(item) {
  if (item.removed_by_admin) return { text: "Taken down by Byro", ink: "text-[#B42318]", dot: "bg-[#D92D20]" };
  if (item.is_active) return { text: "On profile", ink: "text-[#1F7A52]", dot: "bg-[#2F9E6E]" };
  return { text: "Hidden", ink: "text-muted", dot: "bg-[#CBD3DF]" };
}

// What the organiser should look at: take-downs first, then empty and low stock, then hidden items.
function attentionList(items) {
  const out = [];
  for (const item of items) {
    if (item.removed_by_admin) {
      out.push({ item, kind: "down", title: `${item.name} was taken down`, detail: "Email support@usebyro.com if you think this is a mistake", action: "Edit" });
    } else if (hasStock(item) && Number(item.stock) <= 0) {
      out.push({ item, kind: "warn", title: `${item.name}: sold out`, detail: item.is_active ? "Still on your profile, marked sold out" : "Sold out, not on your profile", action: "Restock" });
    } else if (hasStock(item) && Number(item.stock) <= LOW_STOCK) {
      out.push({ item, kind: "warn", title: `${item.name}: ${item.stock} left`, detail: "Running low", action: "Restock" });
    } else if (!item.is_active) {
      out.push({ item, kind: "hidden", title: `${item.name} is hidden`, detail: "Not on your profile", action: "Edit" });
    }
  }
  const rank = { down: 0, warn: 1, hidden: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

function ItemIcon({ size = 22, stroke = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={BAG_PATH} />
    </svg>
  );
}

const ALERT_STYLE = {
  warn: { bg: "bg-[#FFF6E5]", ink: "#8A4B00", sub: "text-[#6B4A08]", path: "M12 3l9 16H3zM12 10v4M12 17h.01" },
  down: { bg: "bg-[#FDECEA]", ink: "#B42318", sub: "text-[#912018]", path: "M12 3l9 16H3zM12 10v4M12 17h.01" },
  hidden: {
    bg: "bg-[#F3F5F9]",
    ink: "#3B4252",
    sub: "text-muted",
    path: "M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 5 9 7a9.6 9.6 0 0 1-2.3 3.2M6.6 6.6C4.4 8 3 10.3 3 12c0 2 4 7 9 7 1.6 0 3.1-.5 4.4-1.2",
  },
};

export default function MerchPage() {
  const confirm = useConfirm();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // item being edited, or null for create
  const [form, setForm] = useState(EMPTY_FORM);
  // Photos in the sheet, in order (first = cover): saved ones have an id, new ones a file.
  const [photos, setPhotos] = useState([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [focusField, setFocusField] = useState("name");
  // Phones get a bottom sheet, desktop keeps the side sheet. Read when the sheet opens.
  const [sheetUp, setSheetUp] = useState(false);
  const nameRef = useRef(null);
  const stockRef = useRef(null);

  const [loadFailed, setLoadFailed] = useState(false);

  const loadItems = () => {
    setLoading(true);
    setLoadFailed(false);
    axiosInstance
      .get("merch/")
      .then((res) => setItems(Array.isArray(res.data) ? res.data : res.data?.results ?? []))
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadItems();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPhotos([]);
    setRemovedPhotoIds([]);
    setFocusField("name");
    setSheetUp(window.matchMedia("(max-width: 767px)").matches);
    setModalOpen(true);
  };

  const openEdit = (item, field = "name") => {
    setEditing(item);
    setForm({
      name: item.name || "",
      description: item.description || "",
      price: item.price ?? "",
      stock: item.stock ?? "",
      purchase_link: item.purchase_link || "",
      is_active: item.is_active,
    });
    setPhotos(
      item.photos?.length
        ? item.photos.map((p) => ({ key: `s${p.id}`, id: p.id, url: p.url }))
        : item.image_url
          ? [{ key: "cover", url: item.image_url }]
          : []
    );
    setRemovedPhotoIds([]);
    setFocusField(field);
    setSheetUp(window.matchMedia("(max-width: 767px)").matches);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  // Escape closes the sheet; focus lands on the field the organiser came for.
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    const target = focusField === "stock" ? stockRef.current : nameRef.current;
    target?.focus({ preventScroll: true });
    if (focusField === "stock") target?.select?.();
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen, focusField]);

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const tooBig = files.filter((f) => f.size > MAX_IMAGE_BYTES);
    if (tooBig.length) toast.error("Photo is too big", { description: "Use photos under 5 MB." });
    const room = MAX_PHOTOS - photos.length;
    const ok = files.filter((f) => f.size <= MAX_IMAGE_BYTES);
    if (ok.length > room) toast.error(`Up to ${MAX_PHOTOS} photos`, { description: room ? `Added the first ${room}` : "Remove one to add another" });
    const added = ok.slice(0, Math.max(0, room)).map((file, i) => ({ key: `n${Date.now()}${i}`, file, url: URL.createObjectURL(file) }));
    if (added.length) setPhotos((prev) => [...prev, ...added]);
  };

  const removePhoto = (photo) => {
    setPhotos((prev) => prev.filter((p) => p.key !== photo.key));
    if (photo.id) setRemovedPhotoIds((prev) => [...prev, photo.id]);
  };

  const makeCover = (photo) => setPhotos((prev) => [photo, ...prev.filter((p) => p.key !== photo.key)]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Item needs a name");
      return;
    }

    const payload = new FormData();
    payload.append("name", form.name.trim());
    payload.append("description", form.description.trim());
    payload.append("price", form.price === "" ? "" : form.price);
    payload.append("stock", form.stock === "" ? "" : form.stock);
    payload.append("purchase_link", form.purchase_link.trim());
    payload.append("is_active", String(form.is_active));
    photos.filter((p) => p.file).forEach((p) => payload.append("new_photos", p.file));
    removedPhotoIds.forEach((id) => payload.append("remove_photos", String(id)));
    // Saved photos in the order shown; new ones are added after them.
    photos.filter((p) => p.id).forEach((p) => payload.append("photo_order", String(p.id)));

    setSaving(true);
    try {
      const res = editing
        ? await axiosInstance.patch(`merch/${editing.id}/`, payload)
        : await axiosInstance.post("merch/", payload);
      // New photos are stored after the saved ones; if a new one was put first (the cover), send the order again.
      const saved = res.data?.photos || [];
      const newIds = saved.slice(photos.filter((p) => p.id).length).map((p) => p.id);
      const wanted = photos.map((p) => p.id ?? newIds.shift()).filter(Boolean);
      if (wanted.join() !== saved.map((p) => p.id).join()) {
        await axiosInstance.patch(`merch/${res.data.id}/`, { photo_order: wanted });
      }
      toast.success(editing ? "Merch item updated" : "Merch item added");
      closeModal();
      loadItems();
    } catch (err) {
      const data = err?.response?.data;
      const firstField = data && typeof data === "object" ? Object.values(data).flat()[0] : null;
      toast.error("Couldn't save item", { description: data?.detail || (typeof firstField === "string" ? firstField : undefined) });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item) => {
    setTogglingId(item.id);
    try {
      await axiosInstance.patch(`merch/${item.id}/`, { is_active: !item.is_active });
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_active: !i.is_active } : i))
      );
    } catch {
      toast.error("Couldn't update item");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (item) => {
    const ok = await confirm({
      title: `Remove “${item.name}” from your merch?`,
      body: "It comes off your public page.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setDeletingId(item.id);
    try {
      await axiosInstance.delete(`merch/${item.id}/`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success(`${item.name} removed from your page`);
      if (editing?.id === item.id) closeModal();
    } catch {
      toast.error("Couldn't remove item");
    } finally {
      setDeletingId(null);
    }
  };

  const profileHref = user?.handle ? `/u/${user.handle}` : "/dashboard/profile";
  const alerts = attentionList(items);

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 pb-12 pt-2 sm:px-[clamp(16px,3vw,40px)] md:gap-6">
      <div className="v-bf flex flex-wrap items-end gap-4" style={{ "--i": 0 }}>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <h1 className="v-h1">Merch</h1>
          <p className="v-sub">Sell to your community from your public profile. Buyers pay through your own link.</p>
        </div>
        <Link href={profileHref} className="v-btn v-btn-s v-btn-lg">
          View on profile
        </Link>
        <button type="button" className="v-btn v-btn-p v-btn-lg" onClick={openCreate}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add item
        </button>
      </div>

      {!loading && alerts.length > 0 && (
        <section aria-label="Needs attention" className="v-card v-bf flex flex-col gap-4 p-5 sm:p-6" style={{ "--i": 1 }}>
          <h2 className="v-h2 !text-[17px]">Needs attention</h2>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]">
            {alerts.map(({ item, kind, title, detail, action }) => {
              const s = ALERT_STYLE[kind];
              return (
                <div key={item.id} className={`flex items-center gap-3 rounded-[14px] p-3.5 ${s.bg}`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={s.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                    <path d={s.path} />
                  </svg>
                  <span className="flex min-w-0 flex-grow flex-col">
                    <span className="break-words text-sm font-extrabold">{title}</span>
                    <span className={`text-[13px] ${s.sub}`}>{detail}</span>
                  </span>
                  <button type="button" className="v-btn v-btn-s v-btn-sm shrink-0" onClick={() => openEdit(item, action === "Restock" ? "stock" : "name")}>
                    {action}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section aria-label="Items" className="v-card v-bf overflow-hidden" style={{ "--i": 2 }}>
        {loading ? (
          <div className="flex flex-col gap-4 p-5" aria-busy="true" aria-label="Loading merch">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3.5">
                <span className="v-skel h-12 w-12 shrink-0 !rounded-xl" />
                <span className="flex flex-grow flex-col gap-2">
                  <span className="v-skel h-3.5 w-40 max-w-full" />
                  <span className="v-skel h-3 w-56 max-w-full" />
                </span>
              </div>
            ))}
          </div>
        ) : loadFailed ? (
          <SectionError what="your merch" onRetry={loadItems} />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
            <span className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-mist text-body">
              <ItemIcon size={26} />
            </span>
            <p className="v-h2 !text-[17px]">No merch yet</p>
            <p className="v-hint max-w-xs">Add something your community can buy. It shows on your public profile.</p>
            <button type="button" className="v-btn v-btn-p mt-2" onClick={openCreate}>
              Add your first item
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="v-stack w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="border-b border-hairline">
                    <th scope="col" className="v-th px-5 py-3.5 text-left">Item</th>
                    <th scope="col" className="v-th px-3 py-3.5 text-right">Price</th>
                    <th scope="col" className="v-th px-3 py-3.5 text-right">Stock</th>
                    <th scope="col" className="v-th py-3.5 pl-6 pr-3 text-left">Status</th>
                    <th scope="col" className="px-5 py-3.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const stock = stockCell(item);
                    const status = statusOf(item);
                    return (
                      <tr key={item.id} className="v-row v-al border-b border-hairline last:border-b-0" style={{ "--i": i }}>
                        <td className="px-5 py-3">
                          <button type="button" onClick={() => openEdit(item)} className="flex w-full min-w-0 items-center gap-3.5 rounded-xl text-left" aria-label={`Edit ${item.name}`}>
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-mist text-body">
                              {item.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <ItemIcon />
                              )}
                            </span>
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-[15px] font-extrabold">{item.name}</span>
                              {item.purchase_link ? (
                                <span className="v-tab max-w-[280px] truncate text-xs text-muted">{shortLink(item.purchase_link)}</span>
                              ) : (
                                <span className="text-xs text-faint">No buy link</span>
                              )}
                            </span>
                          </button>
                        </td>
                        <td data-l="Price" className="v-tab whitespace-nowrap p-3 text-right text-[15px] font-extrabold">{fmtPrice(item.price)}</td>
                        <td data-l="Stock" className={`v-tab whitespace-nowrap p-3 text-right text-sm font-bold ${stock.ink}`}>{stock.text}</td>
                        <td data-l="Status" className="py-3 pl-6 pr-3">
                          <span
                            className={`v-status ${status.ink}`}
                            title={item.removed_by_admin ? "Byro took this item down. Email support@usebyro.com if you think this is a mistake." : undefined}
                          >
                            <span className={`v-dot ${status.dot}`} />
                            {status.text}
                          </span>
                        </td>
                        <td className="px-5 py-3 max-md:ml-auto">
                          <span className="flex items-center justify-end gap-2">
                            {!item.removed_by_admin && (
                              <button
                                type="button"
                                className="v-btn v-btn-s v-btn-sm"
                                onClick={() => toggleActive(item)}
                                disabled={togglingId === item.id}
                                aria-label={`${item.is_active ? "Hide" : "Show"} ${item.name} on your profile`}
                              >
                                {item.is_active ? "Hide" : "Show"}
                              </button>
                            )}
                            <button type="button" className="v-btn v-btn-s v-btn-sm" onClick={() => openEdit(item)} aria-label={`Edit ${item.name}`}>
                              Edit
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="v-hint m-0 px-5 py-3.5">Byro doesn&apos;t take merch payments yet, so sales happen on your link.</p>
          </>
        )}
      </section>

      {modalOpen && (
        <div className={`fixed inset-0 z-50 flex ${sheetUp ? "flex-col justify-end" : "justify-end"}`}>
          <button type="button" aria-label="Close" onClick={closeModal} className="v-scrim absolute inset-0 cursor-pointer border-0 bg-[rgba(20,22,28,.28)]" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="merch-sheet-title"
            className={
              sheetUp
                ? "v-sheet-up relative box-border flex max-h-[92dvh] w-full flex-col overflow-y-auto rounded-t-3xl bg-white px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-20px_50px_-20px_rgba(20,22,28,.35)]"
                : "v-sheet relative box-border flex h-full w-[min(460px,100%)] flex-col overflow-y-auto bg-white p-6"
            }
          >
            {sheetUp && <span aria-hidden="true" className="mx-auto mb-2.5 mt-0.5 block h-1 w-10 shrink-0 rounded-full bg-[#CBD3DF]" />}
            <form onSubmit={handleSubmit} className="flex min-h-full flex-col gap-[18px]">
              <div className="flex items-center">
                <h2 id="merch-sheet-title" className="v-h2 flex-grow !text-[22px]">{editing ? "Edit item" : "New item"}</h2>
                <button type="button" className="v-icon-btn ghost max-md:!h-11 max-md:!w-11" aria-label="Close" onClick={closeModal}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              {editing?.removed_by_admin && (
                <p className="m-0 rounded-[14px] bg-[#FDECEA] p-3.5 text-[13px] text-[#912018]">
                  <b className="text-[#B42318]">Taken down by Byro.</b> It won&apos;t show on your profile, whatever you set here. Email support@usebyro.com if you think this is a mistake.
                </p>
              )}

              <div className="flex flex-col gap-2.5">
                {photos.length > 0 && (
                  <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0" aria-label="Photos">
                    {photos.map((p, i) => (
                      <li key={p.key} className="relative h-[88px] w-[88px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={`Photo ${i + 1}`} className="h-full w-full rounded-xl object-cover" />
                        {i === 0 ? (
                          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-ink/80 px-1.5 py-0.5 text-[10px] font-extrabold text-white">Cover</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => makeCover(p)}
                            className="absolute bottom-1.5 left-1.5 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-extrabold text-ink"
                          >
                            Make cover
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removePhoto(p)}
                          aria-label={`Remove photo ${i + 1}`}
                          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white shadow-[0_0_0_2px_#FFFFFF]"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {photos.length < MAX_PHOTOS && (
                  <label className="v-press flex h-[88px] cursor-pointer items-center justify-center gap-4 rounded-2xl border-[1.5px] border-dashed border-[#9DB6FF] bg-[#F5F8FF] px-4 text-[#2451D6] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
                    <span className="flex flex-col items-center gap-1 text-center">
                      <span className="text-[15px] font-extrabold">{photos.length ? "Add more photos" : "Add photos"}</span>
                      <span className="v-hint">Up to {MAX_PHOTOS}, 5 MB each. The first is the cover.</span>
                    </span>
                    <input type="file" accept="image/*" multiple className="sr-only" onChange={handleImageChange} />
                  </label>
                )}
              </div>

              <label className="flex flex-col gap-2">
                <span className="v-lbl">Name</span>
                <input
                  ref={nameRef}
                  className="v-input"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Community hoodie"
                  maxLength={120}
                  required
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="v-lbl">Description</span>
                <textarea
                  className="v-input"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Sizes, materials, anything buyers should know"
                  rows={3}
                />
              </label>

              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-0 flex-[1_1_140px] flex-col gap-2">
                  <span className="v-lbl">Price (₦)</span>
                  <input
                    className="v-input"
                    type="text"
                    inputMode="decimal"
                    value={form.price}
                    onChange={(e) => {
                      // A number input reports "" the moment a comma sneaks in
                      // (e.g. "5,000"), which reads as no price. Strip anything
                      // but digits and a single decimal point instead.
                      const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                      setForm((f) => ({ ...f, price: cleaned }));
                    }}
                    placeholder="Leave blank for price on request"
                  />
                </label>
                <label className="flex min-w-0 flex-[1_1_140px] flex-col gap-2">
                  <span className="v-lbl">Stock</span>
                  <input
                    ref={stockRef}
                    className="v-input"
                    type="text"
                    inputMode="numeric"
                    value={form.stock}
                    onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value.replace(/[^0-9]/g, "") }))}
                    placeholder="Leave blank for no limit"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-2">
                <span className="v-lbl">Buy link</span>
                <input
                  className="v-input"
                  type="url"
                  spellCheck={false}
                  value={form.purchase_link}
                  onChange={(e) => setForm((f) => ({ ...f, purchase_link: e.target.value }))}
                  placeholder="https://paystack.shop/your-store/item"
                />
                <span className="v-hint">Buyers go here to pay. Byro doesn&apos;t take merch payments yet.</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="h-[18px] w-[18px] rounded border-[#CBD3DF] text-brand focus:ring-brand/30"
                />
                Show on my public profile
              </label>

              <div className="flex flex-col gap-2.5">
                <span className="v-eyebrow">How it shows on your profile</span>
                <div className="v-card v-lift w-[200px] overflow-hidden border border-hairline">
                  <MerchSlideshow
                    photos={photos.map((p) => p.url)}
                    alt={form.name.trim()}
                    className="h-[150px] bg-mist"
                    fallback={
                      <span className="flex h-full items-center justify-center text-faint">
                        <ItemIcon size={40} stroke={1.6} />
                      </span>
                    }
                  >
                    {form.stock !== "" && Number(form.stock) <= 0 && (
                      <span className="absolute left-2.5 top-2.5 flex h-6 items-center rounded-full bg-white px-2 text-xs font-extrabold text-ink">Sold out</span>
                    )}
                  </MerchSlideshow>
                  <div className="flex flex-col gap-0.5 px-3.5 py-3">
                    <span className="break-words text-sm font-extrabold">{form.name.trim() || "Item name"}</span>
                    <span className="text-sm text-body">{fmtPrice(form.price)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-2">
                {editing && (
                  <button
                    type="button"
                    className="v-btn v-btn-danger v-btn-lg mr-auto"
                    onClick={() => handleDelete(editing)}
                    disabled={deletingId === editing.id}
                  >
                    {deletingId === editing.id ? "Removing…" : "Remove"}
                  </button>
                )}
                <button type="button" className="v-btn v-btn-s v-btn-lg" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="v-btn v-btn-p v-btn-lg" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Publish item"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}
