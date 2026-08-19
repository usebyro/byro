"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ProfileRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(qs ? `/dashboard/profile?${qs}` : "/dashboard/profile");
  }, [router, searchParams]);

  return null;
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileRedirect />
    </Suspense>
  );
}
