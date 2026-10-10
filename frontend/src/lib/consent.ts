/**
 * Cookie consent: what the visitor chose, and the switches it flips.
 *
 * Essential cookies (sign-in, checkout, security) never need consent. Two
 * optional groups do:
 *   analytics - Google Analytics storage and Sentry session replay
 *   marketing - Google's ad signals (nothing on the site uses them yet)
 * Until a choice exists, both stay off.
 */

export type ConsentChoice = { analytics: boolean; marketing: boolean };

export const CONSENT_KEY = "byro_cookie_consent";
export const OPEN_SETTINGS_EVENT = "byro:open-cookie-settings";
export const CONSENT_SAVED_EVENT = "byro:consent-saved";

export function readConsent(): ConsentChoice | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { analytics: parsed?.analytics === true, marketing: parsed?.marketing === true };
  } catch {
    return null;
  }
}

type GtagFn = (...args: unknown[]) => void;

let replayAdded = false;

// Session replay records what visitors do on the page, so it only runs with analytics consent.
async function syncReplay(on: boolean) {
  try {
    const Sentry = await import("@sentry/nextjs");
    if (on) {
      if (!replayAdded) {
        Sentry.addIntegration(Sentry.replayIntegration());
        replayAdded = true;
      } else {
        Sentry.getReplay()?.start();
      }
    } else {
      await Sentry.getReplay()?.stop();
    }
  } catch {
    // Blocked by an ad blocker or not loaded: nothing to switch.
  }
}

/** Push a choice to the tools that honour it. Safe to call on every page load. */
export function applyConsent(choice: ConsentChoice) {
  if (typeof window === "undefined") return;

  const gtag = (window as unknown as { gtag?: GtagFn }).gtag;
  if (typeof gtag === "function") {
    const ads = choice.marketing ? "granted" : "denied";
    gtag("consent", "update", {
      analytics_storage: choice.analytics ? "granted" : "denied",
      ad_storage: ads,
      ad_user_data: ads,
      ad_personalization: ads,
    });
  }
  void syncReplay(choice.analytics);
}

export function saveConsent(choice: ConsentChoice) {
  try {
    window.localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ ...choice, v: 1, ts: Date.now() })
    );
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  applyConsent(choice);
  window.dispatchEvent(new Event(CONSENT_SAVED_EVENT));
}

/** Reopen the banner from anywhere (a footer link, the cookies page). */
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}
