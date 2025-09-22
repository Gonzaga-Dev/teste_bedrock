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

// Preserva Nome/Email nos chunks longos
function truncate(s: string, max = 3800) {
  return s.length <= max ? s : s.slice(0, max) + " …";
}

// --- system builders por modo ---
function sharedOutputAndConstraints(contexto: string) {
  return [
    "USE EXCLUSIVAMENTE as informações do CONTEXTO para responder.",
    "É PROIBIDO inventar ou usar conhecimento fora do CONTEXTO.",
    "",
    "=== PRIORIDADES ===",
    "- Priorize candidatos com nível 3 ou 4 nas tecnologias informadas na solicitação.",
    "- Priorize candidatos do mesmo Innovation Studio informado.",
    "- Se menos candidatos do que o desejado forem encontrados no mesmo Studio, amplie a busca gradualmente para outros Studios até atingir até 10 perfis (se houver evidências suficientes).",
    "",
    "=== FORMATO DE SAÍDA (obrigatório) ===",
    "Para cada candidato aprovado, imprima EXATAMENTE estas 6 linhas, nesta ordem, e nada mais:",
    "- Nome: <nome do candidato>",
    "- Studio: <Studio do candidato>",
    "- Senioridade: <Senioridade do candidato>",
    "- Meses na empresa: <número de meses>",
    "- Justificativa: <síntese curta>",
    "- Email: <email do candidato>",
    "",
    "Padronizações:",
    "- Se NÃO houver um campo de nome explícito no CONTEXTO, utilize um IDENTIFICADOR PRESENTE (ex.: id, matrícula, alias, ou o próprio e-mail) como valor de 'Nome:' — nunca invente nomes.",
    "- Para 'Email', aceite chaves equivalentes (ex.: 'E-mail', 'email corporativo', 'email_principal'). Se não houver, mantenha a linha com valor vazio.",
    "- Não escreva cabeçalhos ('Candidato', 'Trecho', 'Item'), bullets, numeração ou títulos extras.",
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
    "1) Innovation Studio: iniciar pelo Studio da vaga.",
    "",
    "2) Senioridade:",
    "- ESPECIALISTA: aceitar ESPECIALISTA e SÊNIOR com >= 12 meses.",
    "- SÊNIOR: aceitar SÊNIOR e PLENO com >= 12 meses.",
    "- PLENO: aceitar PLENO e JÚNIOR com >= 20 meses.",
    "- JÚNIOR/TRAINEE: aceitar níveis iguais ou inferiores.",
    "",
    "3) Habilidades:",
    "- Considerar requisitos obrigatórios quando existirem no CONTEXTO.",
    "- Eliminar candidatos com nível < 2 na tecnologia principal.",
    "- Priorize níveis 3 e 4 nas tecnologias informadas.",
    "",
    "4) Quantidade:",
    "- Retorne até 10 candidatos. Caso não atinja 10 no Studio-alvo, é recomendável ampliar para outros Studios (sem inventar dados).",
    "",
    "5) Justificativa:",
    "- Sintetize Studio, senioridade, habilidades/níveis e meses na empresa, conforme evidências do CONTEXTO.",
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
    "1) Filtros base:",
    "- Innovation Studio: priorizar o mesmo; se necessário, ampliar para outros Studios até retornar até 10.",
    "- Senioridade: aplicar as mesmas regras do modo Match Vagas.",
    "- Habilidades: aplicar os mesmos critérios (obrigatórios e nível na tecnologia principal), priorizando níveis 3 e 4.",
    "",
    "2) Continuidade e risco (quando houver evidências):",
    "- Valorizar histórico/fit no domínio do cliente, stack semelhante e menor curva de rampa.",
    "",
    "3) Quantidade:",
    "- Retorne até 10 substitutos; amplie Studios caso precise (sempre dentro das evidências).",
    "",
    "4) Justificativa (similaridade):",
    "- Na linha 'Justificativa', EXPLICITE a similaridade com o profissional informado no formulário, usando os MESMOS critérios do formulário: Studio, senioridade, habilidades-chave/níveis, meses e, quando houver, domínio/cliente/stack.",
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

    // 1) Recupera exclusivamente da KB — mais resultados ajudam recall sem ruído excessivo
    const chunks = await retrieveFromKB(message, { maxResults: 100, minScore: 0.0 });
    if (chunks.length === 0) {
      return NextResponse.json(
        { reply: "Sem evidências suficientes no contexto." },
        { status: 200 },
      );
    }

    // 2) Contexto: sem cabeçalhos “Trecho N” para não vazar; mantém [Fonte] opcional
    const contexto = chunks
      .map((c) => `${truncate(c.text, 3800)}${c.source ? `\n[Fonte]: ${c.source}` : ""}`)
      .join("\n\n---\n\n");

    // 3) System por modo
    const system =
      mode === "substituicao_profissional"
        ? buildSystemForSubstituicao(contexto)
        : buildSystemForMatchVagas(contexto);

    // 4) Invocação do modelo
    const reply = await invokeHaiku({
      message,    // prompt do front (inclui campos do formulário)
      history,    // histórico curto
      system,     // regras + formato + contexto
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
