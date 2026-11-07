import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const rows = await db.$queryRaw<{ db: string }[]>`select current_database() as db`;
    return NextResponse.json({ ok: true, database: rows[0]?.db });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
