// app/api/chat/route.ts
// Route Handler que chama o Bedrock via lib/bedrock.ts (sem SDK).

import { NextResponse } from "next/server";
import { invokeHaiku } from "@/lib/bedrock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = (body?.message ?? "").toString().trim();
    const history = (body?.history ?? []) as Msg[];

    if (!message) {
      return NextResponse.json({ error: "message vazio" }, { status: 400 });
    }

    // (Opcional) Validar sessão Cognito aqui, caso queira restringir a usuários logados.

    const reply = await invokeHaiku({ message, history });
    return NextResponse.json({ reply }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "erro" }, { status: 500 });
  }
}

// Health check opcional
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
