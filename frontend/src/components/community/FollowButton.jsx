"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import API from "@/services/api";
import { trackFollow } from "@/lib/analytics";

/**
 * Follow / Following for an organiser's community page.
 *
 * Signed-out visitors are sent to login (which also creates accounts) and come
 * straight back to the page they were on, where the follow they asked for is
 * completed for them (nothing counts until they are signed in). Signed-in
 * visitors follow instantly,
 * with the button updating first and rolling back if the request fails.
 * Your own page never shows the button.
 */
export default function FollowButton({ handle, initialFollowing = false, onChange, className = "" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { token, user } = useSelector((state) => state.auth);
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const resumed = useRef(false);

  // The server value arrives after the page loads, and again when the visitor signs in.
  useEffect(() => setFollowing(initialFollowing), [initialFollowing]);

  // Back from login with a follow waiting: do it once, then clean the URL.
  const pending = searchParams.get("follow");
  useEffect(() => {
    if (resumed.current || !token || !pending) return;
    if (pending.toLowerCase() !== String(handle).toLowerCase()) return;
    resumed.current = true;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("follow");
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });

    API.followProfile(handle)
      .then((data) => {
        setFollowing(data.following);
        trackFollow({ handle, following: data.following });
        onChange?.(data.followers_count, data.following);
      })
      .catch((err) => toast.error(err?.message || "Couldn't follow. Try again."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, pending, handle]);

  if (user?.handle && user.handle.toLowerCase() === String(handle).toLowerCase()) return null;

  const toggle = async () => {
    if (busy) return;

    if (!token) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("follow", handle);
      const back = `${pathname}?${params.toString()}`;
      router.push(`/login?redirect=${encodeURIComponent(back)}`);
      return;
    }

    const next = !following;
    setFollowing(next);
    setBusy(true);
    try {
      const data = next ? await API.followProfile(handle) : await API.unfollowProfile(handle);
      setFollowing(data.following);
      trackFollow({ handle, following: data.following });
      onChange?.(data.followers_count, data.following);
    } catch (err) {
      setFollowing(!next);
      toast.error(err?.message || "Couldn't update that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={following}
      disabled={busy}
      className={`flex items-center justify-center rounded-full font-bold transition-[filter,background-color,scale] active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-70 ${
        following ? "border border-line bg-white text-ink hover:bg-mist" : "bg-brand text-white hover:brightness-90"
      } ${className}`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
