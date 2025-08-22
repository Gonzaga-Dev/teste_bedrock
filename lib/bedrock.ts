// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { invokeHaiku, Msg } from "@/lib/bedrock";

export const runtime = "nodejs";        // Edge não tem crypto/http/https
export const dynamic = "force-dynamic"; // força SSR a cada requisição

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = (body?.message ?? "").toString().trim();
    const history = (Array.isArray(body?.history) ? body.history : []) as Msg[];

    if (!message) {
      return NextResponse.json({ error: "message vazio" }, { status: 400 });
    }

    // (Opcional) Validar sessão Cognito/SSO aqui antes de invocar o Bedrock.

    const reply = await invokeHaiku({ message, history });
    return NextResponse.json({ reply }, { status: 200 });
  } catch (e: any) {
    const msg = (e?.message || "erro").toString();
    // Enviamos erro e um reply legível para o cliente
    return NextResponse.json({ error: msg, reply: `Erro do servidor: ${msg}` }, { status: 500 });
  }
}

// health-check opcional
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
