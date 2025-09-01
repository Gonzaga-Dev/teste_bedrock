// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { invokeHaiku, type Msg } from "@/lib/bedrock";
import { retrieveFromKB } from "@/lib/retrieve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "us-east-1";

// utils
function toMsgArray(x: unknown): Msg[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((m) => ({
      role:
        (m as any)?.role === "user" || (m as any)?.role === "assistant"
          ? (m as any).role
          : "user",
      content: String((m as any)?.content ?? ""),
    }))
    .filter((m) => m.content.trim() !== "");
}
function truncate(s: string, max = 2000) {
  return s.length <= max ? s : s.slice(0, max) + " …";
}

// POST /api/chat
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body?.message ?? "").trim();
    const history = toMsgArray(body?.history);
    if (!message) {
      return NextResponse.json({ error: "message vazio" }, { status: 400 });
    }

    // 1) Recupera exclusivamente da base vetorial
    const chunks = await retrieveFromKB(message, { maxResults: 12, minScore: 0.0 });
    if (chunks.length === 0) {
      return NextResponse.json(
        {
          reply:
            "Sem evidências suficientes na base de conhecimento para responder com segurança. " +
            "Refine os termos ou atualize a KB.",
        },
        { status: 200 }
      );
    }

    const contexto = chunks
      .map(
        (c, i) =>
          `### Trecho ${i + 1}\n${truncate(c.text, 1800)}${
            c.source ? `\n[Fonte]: ${c.source}` : ""
          }`
      )
      .join("\n\n");

    // 2) Prompt (system) com regra de exclusividade
    const system = [
      "Você é um assistente de seleção técnica.",
      "USE EXCLUSIVAMENTE as informações do CONTEXTO para responder.",
      "É PROIBIDO inventar, completar a partir de conhecimento geral ou usar fontes externas.",
      "Se algo solicitado não constar no CONTEXTO, responda exatamente: 'Sem evidências suficientes no contexto.'",
      "Traga justificativas curtas citando o(s) trecho(s) (ex.: Trecho 2).",
      "",
      "=== CONTEXTO ===",
      contexto,
    ].join("\n");

    // 3) Invoca o modelo com seu prompt de negócio em `message`
    const reply = await invokeHaiku({
      message,
      history,
      system,
      maxTokens: 1200,
      temperature: 0.2,
      topP: 0.9,
      // stopSequences: ["==="], // opcional, se quiser cortar ao fim do contexto
    });

    return NextResponse.json({ reply }, { status: 200 });
  } catch (e: any) {
    const msg = (e?.message || "erro").toString();
    return NextResponse.json(
      { error: msg, reply: `Erro do servidor: ${msg}` },
      { status: 500 }
    );
  }
}

// GET /api/chat (diagnóstico simples)
export async function GET() {
  return NextResponse.json(
    {
      kbId: "1YKO0N8MIV",
      region:
        process.env.BEDROCK_REGION ||
        process.env.AWS_REGION ||
        process.env.AWS_DEFAULT_REGION ||
        "us-east-1",
      ok: true,
    },
    { status: 200 }
  );
}
