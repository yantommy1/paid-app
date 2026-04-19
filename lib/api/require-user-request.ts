import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api/get-user";

export async function requireUserFromRequest(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: error ?? "Unauthorized" },
        { status: 401 }
      ),
    };
  }
  return { user, response: null };
}
