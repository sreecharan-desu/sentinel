import { NextResponse } from "next/server";
import { loadCollectors, listSnapshots, loadHeals } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    collectors: loadCollectors(),
    snapshots: listSnapshots().slice(0, 40),
    heals: loadHeals().slice(0, 40),
    generatedAt: new Date().toISOString(),
  });
}
