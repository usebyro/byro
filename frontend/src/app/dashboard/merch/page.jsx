"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Cancel01Icon,
  Edit02Icon,
  Delete02Icon,
  ShoppingBag01Icon,
  ImageUploadIcon,
} from "@hugeicons/core-free-icons";
import axiosInstance from "@/utils/axios";

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  stock: "",
  purchase_link: "",
  is_active: true,
};

function fmtPrice(price) {
  if (price === null || price === undefined || price === "") return "Price on request";
  return `₦${Number(price).toLocaleString()}`;
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-md p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-gray-900">{title}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <HugeiconsIcon icon={Cancel01Icon} size={16} color="currentColor" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function MerchPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // item being edited, or null for create
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadItems = () => {
    setLoading(true);
    axiosInstance
      .get("merch/")
      .then((res) => setItems(Array.isArray(res.data) ? res.data : res.data?.results ?? []))
      .catch(() => toast.error("Couldn't load your merch."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadItems();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview(null);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      name: item.name || "",
      description: item.description || "",
      price: item.price ?? "",
      stock: item.stock ?? "",
      purchase_link: item.purchase_link || "",
      is_active: item.is_active,
    });
    setImageFile(null);
    setImagePreview(item.image_url || null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Give this item a name.");
      return;
    }

    const payload = new FormData();
    payload.append("name", form.name.trim());
    payload.append("description", form.description.trim());
    payload.append("price", form.price === "" ? "" : form.price);
    payload.append("stock", form.stock === "" ? "" : form.stock);
    payload.append("purchase_link", form.purchase_link.trim());
    payload.append("is_active", String(form.is_active));
    if (imageFile) payload.append("image", imageFile);

    setSaving(true);
    try {
      if (editing) {
        await axiosInstance.patch(`merch/${editing.id}/`, payload);
        toast.success("Merch item updated");
      } else {
        await axiosInstance.post("merch/", payload);
        toast.success("Merch item added");
      }
      closeModal();
      loadItems();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't save this item.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item) => {
    try {
      await axiosInstance.patch(`merch/${item.id}/`, { is_active: !item.is_active });
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_active: !i.is_active } : i))
      );
    } catch {
      toast.error("Couldn't update this item.");
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Remove "${item.name}" from your merch?`)) return;
    setDeletingId(item.id);
    try {
      await axiosInstance.delete(`merch/${item.id}/`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("Removed");
    } catch {
      toast.error("Couldn't remove this item.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Merch</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            List items your community can buy. Active items show on your public profile.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-[#4F6EF7] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm shadow-[#4F6EF7]/10 shrink-0"
        >
          <HugeiconsIcon icon={Add01Icon} size={15} color="white" />
          Add item
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-400">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 flex flex-col items-center text-center gap-2">
            <HugeiconsIcon icon={ShoppingBag01Icon} size={28} color="#d1d5db" />
            <p className="text-sm font-semibold text-gray-700">No merch yet</p>
            <p className="text-xs text-gray-400 max-w-xs">
              Add a t-shirt, sticker pack, or anything else your community can buy from you.
            </p>
            <button
              onClick={openCreate}
              className="mt-2 text-sm font-semibold text-[#4F6EF7] hover:underline"
            >
              Add your first item
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-4 p-4">
                <div className="w-14 h-14 rounded-lg bg-gray-50 border border-gray-100 shrink-0 overflow-hidden flex items-center justify-center">
                  {item.image_url ? (
                    <Image src={item.image_url} alt={item.name} width={56} height={56} className="object-cover w-full h-full" />
                  ) : (
                    <HugeiconsIcon icon={ShoppingBag01Icon} size={20} color="#d1d5db" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                    {!item.is_active && (
                      <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        Hidden
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {fmtPrice(item.price)}
                    {item.stock !== null && item.stock !== undefined && ` · ${item.stock} in stock`}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive(item)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    {item.is_active ? "Hide" : "Show"}
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                    aria-label="Edit"
                  >
                    <HugeiconsIcon icon={Edit02Icon} size={15} color="currentColor" />
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    disabled={deletingId === item.id}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    aria-label="Delete"
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={15} color="currentColor" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modalOpen && (
        <Modal title={editing ? "Edit item" : "Add merch item"} onClose={closeModal}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Photo</label>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="w-16 h-16 rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                  {imagePreview ? (
                    <Image src={imagePreview} alt="" width={64} height={64} className="object-cover w-full h-full" />
                  ) : (
                    <HugeiconsIcon icon={ImageUploadIcon} size={18} color="#9ca3af" />
                  )}
                </div>
                <span className="text-xs font-semibold text-[#4F6EF7]">
                  {imagePreview ? "Change photo" : "Upload photo"}
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Community hoodie"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/30"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Sizes, materials, anything buyers should know"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/30 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Price (₦)</label>
                <input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="Optional"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Stock</label>
                <input
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                  placeholder="Unlimited"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/30"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Purchase link
              </label>
              <input
                type="url"
                value={form.purchase_link}
                onChange={(e) => setForm((f) => ({ ...f, purchase_link: e.target.value }))}
                placeholder="Where buyers go to pay (form, DM, store link)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4F6EF7]/30"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Byro doesn&apos;t process merch payments yet — this link is how people buy.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="rounded border-gray-300 text-[#4F6EF7] focus:ring-[#4F6EF7]/30"
              />
              Show on my public profile
            </label>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 border border-gray-200 text-gray-700 text-sm font-semibold py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-[#4F6EF7] text-white text-sm font-semibold py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Add item"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
