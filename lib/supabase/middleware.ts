import { getPostLoginPath } from "@/lib/auth/post-login-path";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && request.nextUrl.pathname === "/") {
    const { data: profile } = await supabase
      .from("users")
      .select("onboarding_completed, subscription_status")
      .eq("id", user.id)
      .maybeSingle();

    const target = getPostLoginPath(profile);
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((c) => {
      redirectResponse.cookies.set(c.name, c.value, {
        path: c.path,
        domain: c.domain,
        maxAge: c.maxAge,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite as "lax" | "strict" | "none" | undefined,
        expires: c.expires,
      });
    });
    return redirectResponse;
  }

  return supabaseResponse;
}
