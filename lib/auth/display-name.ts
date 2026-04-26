import type { User } from "@supabase/supabase-js";

function titleCaseWord(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function displayNameFromEmail(email: string | null | undefined): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const cleaned = local.replace(/[0-9]/g, "");
  const firstToken = cleaned.split(/[.\-_]/).find((part) => part.trim().length > 0) ?? "";
  return titleCaseWord(firstToken) || "There";
}

export function getUserDisplayName(user: Pick<User, "email" | "user_metadata">): string {
  const meta = (user.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const fullName =
    typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (fullName) return fullName;

  const name = typeof meta.name === "string" ? meta.name.trim() : "";
  if (name) return name;

  return displayNameFromEmail(user.email);
}
