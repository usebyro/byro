"use client";

import MerchSlideshow from "@/components/merch/MerchSlideshow";

/** One merch item: a photo on a neutral tile, then name and price. Opens the organiser's store when there is one. */
export const merchPrice = (item) => (item.price ? `₦${Number(item.price).toLocaleString("en-NG")}` : "Price on request");
export const merchPhotos = (item) => (item.photos?.length ? item.photos.map((p) => p.url) : item.image_url ? [item.image_url] : []);
export const merchStock = (item) => {
  const hasStock = item.stock !== null && item.stock !== undefined;
  if (!hasStock) return null;
  if (item.stock <= 0) return "Sold out";
  return item.stock <= 5 ? `Only ${item.stock} left` : null;
};

export const bag = (
  <span className="flex h-full items-center justify-center text-[#3B4252]">
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  </span>
);

// A tile opens a preview first (board 8c); buying happens on the organiser's own store.
export default function MerchTile({ item, onOpen }) {
  const stock = merchStock(item);
  const photos = merchPhotos(item);
  const picture = (
    <MerchSlideshow photos={photos} alt={item.name} className="h-[200px] rounded-[20px] bg-mist" fallback={bag}>
      {stock && <span className="absolute left-3 top-3 flex h-7 items-center rounded-full bg-white px-2.5 text-xs font-extrabold">{stock}</span>}
    </MerchSlideshow>
  );
  const label = (
    <span className="flex items-baseline justify-between gap-2.5">
      <span className="text-base font-extrabold group-hover:underline">{item.name}</span>
      <span className="whitespace-nowrap text-[15px] font-bold">{merchPrice(item)}</span>
    </span>
  );
  const open = (children, { handler = true } = {}) => (
    <button
      type="button"
      onClick={handler ? () => onOpen(item) : undefined}
      aria-label={`${item.name}, ${merchPrice(item)}${stock ? `, ${stock}` : ""}`}
      className="group flex w-full flex-col gap-2.5 border-0 bg-transparent p-0 text-left text-ink transition-[scale] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {children}
    </button>
  );

  // Several photos: the slideshow keeps its own arrows and swiping, so the card itself takes the click.
  // Arrow buttons stop their own clicks, and a swipe is not a click. Keyboard and screen reader users reach
  // the name and price button, whose click bubbles up to the card.
  if (photos.length > 1) {
    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
      <li className="group flex cursor-pointer flex-col gap-2.5" onClick={() => onOpen(item)}>
        {picture}
        {open(label, { handler: false })}
      </li>
    );
  }
  return (
    <li>
      {open(
        <>
          <span className="block overflow-hidden rounded-[20px] [&_img]:transition-transform [&_img]:duration-300 group-hover:[&_img]:scale-[1.03] motion-reduce:[&_img]:transition-none">
            {picture}
          </span>
          {label}
        </>
      )}
    </li>
  );
}
