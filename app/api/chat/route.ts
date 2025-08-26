// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { invokeHaiku, type Msg } from "@/lib/bedrock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = (body?.message ?? "").toString().trim();
    const history = (Array.isArray(body?.history) ? body.history : []) as Msg[];
    if (!message) return NextResponse.json({ error: "message vazio" }, { status: 400 });

    const reply = await invokeHaiku({ message, history });
    return NextResponse.json({ reply }, { status: 200 });
  } catch (e: any) {
    const msg = (e?.message || "erro").toString();
    return NextResponse.json({ error: msg, reply: `Erro do servidor: ${msg}` }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
