"use client";

import { useRouter } from "next/navigation";

/**
 * Minimal logout control, rendered inline wherever it's placed (e.g. a page
 * header). Renders nothing unless login is enabled
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
      className="rounded border border-white/10 px-2 py-1 text-xs text-gray-500 hover:text-gray-200 hover:border-white/20 transition-colors"
      title="Sign out"
    >
      Sign out
    </button>
  );
}
