import { NextResponse, type NextRequest } from "next/server";

/**
 * Page gate for the single-user login. Active only when WEB_REQUIRE_LOGIN=true,
 * so local dev stays frictionless until you opt in (alongside AUTH_PASSWORD_HASH
 * on the API).
 *
 * This is a lightweight presence check on the httpOnly `session` cookie for the
 * redirect UX — the API is the real gate and rejects an invalid/forged cookie
 * with 401 regardless.
 */
export function middleware(request: NextRequest) {
  if (process.env.WEB_REQUIRE_LOGIN !== "true") return NextResponse.next();

  const hasSession = request.cookies.has("session");
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except the login page, Next internals, API (gated by the
  // API itself), and static assets.
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
