import { NextResponse } from "next/server";

type ErrorCode = "UNAUTHORIZED" | "NOT_FOUND" | "SERVER_ERROR";

export function apiError(error: string, code: ErrorCode, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export function unauthorized(error = "Unauthorized") {
  return apiError(error, "UNAUTHORIZED", 401);
}

export function notFound(error = "Not found") {
  return apiError(error, "NOT_FOUND", 404);
}

export function serverError(error = "Server error", status = 500) {
  return apiError(error, "SERVER_ERROR", status);
}
