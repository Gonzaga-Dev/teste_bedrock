// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { invokeHaiku, type Msg } from "@/lib/bedrock";
import { retrieveFromKB } from "@/lib/retrieve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "us-east-1";

// --- utils ---
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

// --- POST /api/chat ---
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body?.message ?? "").trim();
    const history = toMsgArray(body?.history);

    if (!message) {
      return NextResponse.json({ error: "message vazio" }, { status: 400 });
    }

    // 1) Recupera exclusivamente da base vetorial
    const chunks = await retrieveFromKB(message, { maxResults: 50, minScore: 0.0 });
    if (chunks.length === 0) {
      return NextResponse.json(
        { reply: "Sem evidências suficientes na base de conhecimento para responder com segurança. Refine os termos ou atualize a KB." },
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

    // 2) Prompt de sistema (regras + exigência de usar apenas o contexto)
    const system = [
      "Você é um assistente de seleção técnica.",
      "USE EXCLUSIVAMENTE as informações do CONTEXTO para responder.",
      "É PROIBIDO inventar, completar a partir de conhecimento geral ou usar fontes externas.",
      "Se algo solicitado não constar no CONTEXTO, responda exatamente: 'Sem evidências suficientes no contexto.'",
      "",
      "=== REGRAS DE NEGÓCIO ===",
      "1. Filtro por Innovation Studio:",
      "- Selecionar inicialmente candidatos cujo campo innovation_studio seja igual ao da vaga.",
      "",
      "2. Filtro de Senioridade:",
      "- Vaga ESPECIALISTA: aceitar apenas candidatos ESPECIALISTA e SENIOR com pelo menos 12 meses.",
      "- Vaga SENIOR: aceitar apenas candidatos SENIOR e PLENO com pelo menos 12 meses.",
      "- Vaga PLENO: aceitar apenas candidatos PLENO e JUNIOR com pelo menos 20 meses de empresa.",
      "- Vaga JUNIOR ou TRAINEE: aceitar candidatos de nível igual ou inferior.",
      "",
      "3. Filtro de Habilidades:",
      "- Considerar apenas candidatos que preenchem todos os requisitos obrigatórios.",
      "- Eliminar candidatos com nível inferior a 2 na tecnologia principal exigida.",
      "- Conhecimentos devem ser apresentados no formato {categoria = [habilidade (nível)]}.",
      "",
      "4. Quantidade de Selecionados:",
      "- Caso o número de candidatos aprovados seja inferior a 10, suspender a restrição de innovation_studio.",
      "- Se ainda assim houver menos de 10, liberar o filtro de nível mínimo na tecnologia principal (admitir candidatos com nível < 2) e senioridade, aplicando penalização no score.",
      "",
      "5. Cálculo do Score Final:",
      "- Score total varia de 0 a 100%.",
      "- Pesos para composição do score:",
      "  • Tecnologia principal: até 30% (ou 10% se nível < 2).",
      "  • Requisitos obrigatórios: até 50%.",
      "  • Requisitos desejáveis: até 20%.",
      "",
      "6. Resultado:",
      "- Retornar 10 candidatos classificados por score em ordem decrescente.",
      "- Traga justificativas curtas citando o(s) trecho(s) do CONTEXTO (ex.: Trecho 2).",
      "",
      "=== CONTEXTO ===",
      contexto,
    ].join("\n");

    // 3) Invoca o modelo com o system + mensagem do usuário
    const reply = await invokeHaiku({
      message,           // seu enunciado/brief do formulário
      history,           // mantém histórico curto
      system,            // << regras entram aqui
      maxTokens: 1200,
      temperature: 0.2,
      topP: 0.9,
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

// --- GET /api/chat (diagnóstico) ---
export async function GET() {
  return NextResponse.json(
    {
      kbId: "N4OPVSX8NP",
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
