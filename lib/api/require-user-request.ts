import type { NextRequest } from "next/server";
import { unauthorized } from "@/lib/api/errors";
import { getUserFromRequest } from "@/lib/api/get-user";

export async function requireUserFromRequest(request: NextRequest) {
  const { user, error } = await getUserFromRequest(request);
  if (!user) {
    return {
      user: null,
      response: unauthorized(error ?? "Unauthorized"),
    };
  }
  return { user, response: null };
}
