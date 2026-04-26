import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { getUserRoutingState, postLoginPathForState } from "@/lib/auth/post-login-path";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return response;
  }

  const state = await getUserRoutingState(supabase, user.id);
  const destination = postLoginPathForState(state);
  const subStatus = state.subscriptionStatus;
  console.info("[routing:middleware]", {
    userId: user.id,
    onboardingCompleted: state.onboardingCompleted,
    subscriptionStatus: subStatus,
    destination,
    pathname,
  });

  if (pathname === "/") {
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (pathname.startsWith("/dashboard") && destination !== "/dashboard") {
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (
    pathname.startsWith("/pricing") &&
    (subStatus === "trialing" || subStatus === "active")
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
