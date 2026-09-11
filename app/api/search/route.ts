import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { search } from "@/lib/search/search";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q") ?? "";
  const result = await search(q);
  return NextResponse.json(result);
}
