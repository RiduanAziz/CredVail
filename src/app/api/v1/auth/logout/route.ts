import { NextResponse } from "next/server";
import { getClearSessionCookieHeader } from "@/lib/auth/session";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    data: { message: "Successfully logged out" },
  });

  response.headers.set("Set-Cookie", getClearSessionCookieHeader());

  return response;
}
