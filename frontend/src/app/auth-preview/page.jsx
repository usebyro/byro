import { Suspense } from "react";
import AuthScreen from "@/components/auth/AuthScreen";

export default function AuthPreviewPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen />
    </Suspense>
  );
}
