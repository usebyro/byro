"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDispatch } from "react-redux";
import axiosInstance from "@/utils/axios";
import API from "@/services/api";
import { authSuccess } from "@/redux/auth/authSlice";
import Link from "next/link";

function OAuthCallback() {
  const router = useRouter();
  const dispatch = useDispatch();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const exchanged = useRef(false);

  useEffect(() => {
    if (exchanged.current) return;
    exchanged.current = true;

    const oauthError = searchParams.get("error");
    if (oauthError) {
      setError(searchParams.get("error_description") || "Sign-in was cancelled.");
      return;
    }

    const code = searchParams.get("code");
    if (!code) {
      setError("Missing sign-in code. Please try again.");
      return;
    }

    (async () => {
      try {
        const { data } = await axiosInstance.post("auth/oauth/callback/", { code });
        API.setAuthToken(data.tokens.access);
        dispatch(authSuccess({ user: data.user, token: data.tokens }));
        router.replace(data.user.is_profile_complete ? "/home" : "/onboarding-preview");
      } catch (err) {
        setError(err.response?.data?.error || "Could not complete sign-in. Please try again.");
      }
    })();
  }, [searchParams, dispatch, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="text-center px-6">
        {error ? (
          <>
            <p className="text-red-600 mb-4">{error}</p>
            <Link href="/login" className="text-blue-600 font-semibold hover:underline text-sm">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Signing you in...</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallback />
    </Suspense>
  );
}
