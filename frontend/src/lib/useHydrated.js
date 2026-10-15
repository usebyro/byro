import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and during the browser's first (hydrating) render, true after.
 * Anything read from the browser (the saved login, localStorage) waits for this, so the
 * first browser render matches the HTML the server sent.
 */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
