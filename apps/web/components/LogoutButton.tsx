"use client";

import { useRouter } from "next/navigation";

/**
 * Minimal logout control. Renders nothing unless login is enabled
 * (NEXT_PUBLIC_REQUIRE_LOGIN=true) so it doesn't clutter the dev UI.
 */
export function LogoutButton() {
  const router = useRouter();
  if (process.env.NEXT_PUBLIC_REQUIRE_LOGIN !== "true") return null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      className="fixed right-3 top-3 z-50 rounded border border-white/10 bg-black/40 px-2 py-1 text-xs text-white/60 hover:text-white"
    >
      Sign out
    </button>
  );
}
