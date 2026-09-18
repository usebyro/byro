import { Suspense } from "react";
import AuthScreen from "@/components/auth/AuthScreen";

export const metadata = {
  title: "Log in",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthScreen />
    </Suspense>
  );
}
