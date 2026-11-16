// A buyer's merch cart, kept in this browser per seller (their page handle) until they pay.
// Nothing here is trusted: the server prices the order again and checks stock when they pay.

const key = (handle) => `byro:merch-cart:${String(handle || "").toLowerCase()}`;
const MAX_QUANTITY = 20;

const valid = (l) => l && Number.isInteger(l.item_id) && Number.isInteger(l.quantity) && l.quantity > 0;

export function readCart(handle) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key(handle)) || "[]");
    return Array.isArray(parsed) ? parsed.filter(valid) : [];
  } catch {
    return [];
  }
}

export function writeCart(handle, lines) {
  try {
    window.localStorage.setItem(key(handle), JSON.stringify(lines.filter(valid)));
  } catch {
    /* private mode or full storage: the cart just won't survive a reload */
  }
}

export function clearCart(handle) {
  try {
    window.localStorage.removeItem(key(handle));
  } catch {
    /* nothing to clear */
  }
}

// Same item and option adds to the quantity; anything else is a new line.
export function addToCart(handle, { item_id, option = "", quantity = 1 }) {
  const lines = readCart(handle);
  const same = lines.find((l) => l.item_id === item_id && (l.option || "") === option);
  if (same) same.quantity = Math.min(MAX_QUANTITY, same.quantity + quantity);
  else lines.push({ item_id, option, quantity: Math.min(MAX_QUANTITY, quantity) });
  writeCart(handle, lines);
  return lines;
}

export const cartCount = (handle) => readCart(handle).reduce((n, l) => n + l.quantity, 0);
export { MAX_QUANTITY };
