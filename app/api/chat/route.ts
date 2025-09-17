// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { invokeHaiku, type Msg } from "@/lib/bedrock";
import { retrieveFromKB } from "@/lib/retrieve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "us-east-1";

type ModeKey = "match_vagas" | "substituicao_profissional";

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

// --- system builders por modo ---
function sharedOutputAndConstraints(contexto: string) {
  return [
    "USE EXCLUSIVAMENTE as informações do CONTEXTO para responder.",
    "É PROIBIDO inventar, completar a partir de conhecimento geral ou usar fontes externas.",
    "Se algo solicitado não constar no CONTEXTO, responda exatamente: 'Sem evidências suficientes no contexto.'",
    "",
    "=== PRIORIDADES ===",
    "- Priorize candidatos com nível 3 ou 4 nas tecnologias informadas na solicitação.",
    "- Priorize candidatos do mesmo Innovation Studio informado.",
    "- Se menos candidatos do que o desejado forem encontrados no mesmo Studio, amplie a busca gradualmente para outros Studios.",
    "",
    "=== FORMATO DE SAÍDA (obrigatório) ===",
    "Para cada candidato aprovado, imprima EXATAMENTE estas 6 linhas, nesta ordem, e nada mais:",
    "- Nome: <nome do candidato>",
    "- Studio: <Studio do candidato>",
    "- Senioridade: <Senioridade do candidato>",
    "- Meses na empresa: <número de meses>",
    "- Justificativa: <síntese curta do porquê foi selecionado>",
    "- Email: <email do candidato>",
    "",
    "Entre um candidato e outro, deixe UMA linha em branco.",
    "Não inclua títulos, numeração, score, pontos fortes, recomendações de transição ou qualquer outro campo.",
    "",
    "=== CONTEXTO ===",
    contexto,
  ].join("\n");
}

function buildSystemForMatchVagas(contexto: string): string {
  return [
    "Você é um assistente de seleção técnica.",
    sharedOutputAndConstraints(contexto),
    "",
    "=== REGRAS DE NEGÓCIO (MATCH VAGAS) ===",
    "1) Filtro por Innovation Studio:",
    "- Selecionar inicialmente candidatos cujo campo innovation_studio seja igual ao da vaga.",
    "",
    "2) Filtro de Senioridade:",
    "- Vaga ESPECIALISTA: aceitar apenas candidatos ESPECIALISTA e SENIOR com pelo menos 12 meses.",
    "- Vaga SENIOR: aceitar apenas candidatos SENIOR e PLENO com pelo menos 12 meses.",
    "- Vaga PLENO: aceitar apenas candidatos PLENO e JUNIOR com pelo menos 20 meses de empresa.",
    "- Vaga JUNIOR ou TRAINEE: aceitar candidatos de nível igual ou inferior.",
    "",
    "3) Filtro de Habilidades:",
    "- Considerar apenas candidatos que preenchem todos os requisitos obrigatórios.",
    "- Eliminar candidatos com nível inferior a 2 na tecnologia principal exigida.",
    "- Priorize nível 3 e 4 nas tecnologias informadas.",
    "- Conhecimentos, quando mencionados, devem seguir o formato {categoria = [habilidade (nível)]}.",
    "",
    "4) Quantidade de Selecionados:",
    "- Retorne até 10 candidatos. Se não houver 10 no mesmo Studio, amplie para outros Studios.",
  ].join("\n");
}

function buildSystemForSubstituicao(contexto: string): string {
  return [
    "Você é um assistente de seleção técnica focado em continuidade de projetos.",
    sharedOutputAndConstraints(contexto),
    "",
    "=== REGRAS DE NEGÓCIO (SUBSTITUIÇÃO DE PROFISSIONAL) ===",
    "Objetivo: sugerir substitutos adequados para o profissional indicado, mitigando riscos e mantendo a continuidade do projeto.",
    "",
    "1) Filtros Base:",
    "- Innovation Studio: priorizar candidatos com innovation_studio igual; se menos de 10 aprovados, liberar para outros Studios.",
    "- Senioridade: aplicar as mesmas regras de senioridade do modo Match Vagas.",
    "- Habilidades: aplicar os mesmos critérios (obrigatórios e nível na tecnologia principal), priorizando nível 3 e 4.",
    "",
    "2) Continuidade e Risco (quando o CONTEXTO trouxer evidências):",
    "- Valorizar candidatos com histórico/fit no domínio do cliente, stack semelhante e menor curva de rampa.",
    "",
    "3) Quantidade de Selecionados:",
    "- Retorne até 10 substitutos. Se não houver 10 no mesmo Studio, amplie para outros Studios.",
  ].join("\n");
}

// --- POST /api/chat ---
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = String(body?.message ?? "").trim();
    const history = toMsgArray(body?.history);
    const mode = (String(body?.mode ?? "match_vagas") as ModeKey) || "match_vagas";

    if (!message) {
      return NextResponse.json({ error: "message vazio" }, { status: 400 });
    }
    if (mode !== "match_vagas" && mode !== "substituicao_profissional") {
      return NextResponse.json({ error: `mode inválido: ${String(mode)}` }, { status: 400 });
    }

    // 1) Recupera exclusivamente da base vetorial
    const chunks = await retrieveFromKB(message, { maxResults: 50, minScore: 0.0 });
    if (chunks.length === 0) {
      return NextResponse.json(
        {
          reply:
            "Sem evidências suficientes na base de conhecimento para responder com segurança. Refine os termos ou atualize a KB.",
        },
        { status: 200 },
      );
    }

    const contexto = chunks
      .map(
        (c, i) =>
          `### Trecho ${i + 1}\n${truncate(c.text, 1800)}${
            c.source ? `\n[Fonte]: ${c.source}` : ""
          }`,
      )
      .join("\n\n");

    // 2) System por modo (regras + exigência de usar apenas o contexto + formato fixo)
    const system =
      mode === "substituicao_profissional"
        ? buildSystemForSubstituicao(contexto)
        : buildSystemForMatchVagas(contexto);

    // 3) Invoca o modelo com o system + mensagem do usuário
    const reply = await invokeHaiku({
      message, // enunciado/brief do formulário (já inclui os campos do front)
      history, // mantém histórico curto
      system,
      maxTokens: 1200,
      temperature: 0.2,
      topP: 0.9,
    });

    return NextResponse.json({ reply }, { status: 200 });
  } catch (e: any) {
    const msg = (e?.message || "erro").toString();
    return NextResponse.json({ error: msg, reply: `Erro do servidor: ${msg}` }, { status: 500 });
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
    { status: 200 },
  );
}
