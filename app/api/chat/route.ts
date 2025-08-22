// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { invokeHaiku } from "@/lib/bedrock";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { message, history } = await req.json().catch(() => ({}));
    const msg = (message || "").toString().trim();
    if (!msg) return NextResponse.json({ error: "message vazio" }, { status: 400 });

    // Se quiser proteger: verifique sessão Cognito aqui antes de invocar o Bedrock.
    const reply = await invokeHaiku({ message: msg, history: (history ?? []) });
    return NextResponse.json({ reply }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "erro" }, { status: 500 });
  }
}
