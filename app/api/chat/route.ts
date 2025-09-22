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

// aumentar truncate para preservar Nome/Email nos chunks
function truncate(s: string, max = 3800) {
  return s.length <= max ? s : s.slice(0, max) + " …";
}

// --- system builders por modo ---
function sharedOutputAndConstraints(contexto: string) {
  return [
    "USE EXCLUSIVAMENTE as informações do CONTEXTO para responder.",
    "É PROIBIDO inventar, completar com conhecimento geral ou usar fontes externas.",
    "",
    "=== PRIORIDADES ===",
    "- Priorize candidatos com nível 3 ou 4 nas tecnologias informadas na solicitação.",
    "- Priorize candidatos do mesmo Innovation Studio informado.",
    "- Se menos candidatos do que o desejado forem encontrados no mesmo Studio, AMPLIE OBRIGATORIAMENTE para outros Studios ATÉ completar 10 perfis elegíveis (ou esgotar o CONTEXTO).",
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
    "Regras rígidas de saída:",
    "- NÃO escreva cabeçalhos como 'Candidato', 'Trecho', 'Item', numeração, bullets ou títulos extras.",
    "- Se o campo 'Nome' não existir no CONTEXTO para um perfil, NÃO liste esse candidato.",
    "- Se 'Email' existir no CONTEXTO com chaves equivalentes (ex.: 'E-mail', 'email corporativo', 'email_principal'), normalize e imprima em 'Email:'. Se ausente, deixe a linha com valor vazio.",
    "- Nunca copie rótulos do CONTEXTO (ex.: 'Trecho 7', '[Fonte]'); imprima apenas as 6 linhas acima por candidato.",
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
    "1) Filtro por Innovation Studio: selecionar inicialmente candidatos cujo campo innovation_studio seja igual ao da vaga.",
    "",
    "2) Filtro de Senioridade:",
    "- Vaga ESPECIALISTA: aceitar apenas ESPECIALISTA e SÊNIOR com pelo menos 12 meses.",
    "- Vaga SÊNIOR: aceitar apenas SÊNIOR e PLENO com pelo menos 12 meses.",
    "- Vaga PLENO: aceitar apenas PLENO e JÚNIOR com pelo menos 20 meses.",
    "- Vaga JÚNIOR ou TRAINEE: aceitar níveis iguais ou inferiores.",
    "",
    "3) Filtro de Habilidades:",
    "- Considerar apenas candidatos que cumpram requisitos obrigatórios quando existirem no CONTEXTO.",
    "- Eliminar candidatos com nível inferior a 2 na tecnologia principal exigida.",
    "- Priorize níveis 3 e 4 nas tecnologias informadas.",
    "",
    "4) Quantidade:",
    "- Retorne ATÉ 10 candidatos. Se não houver 10 no Studio da vaga, AMPLIE para outros Studios ATÉ completar 10 (se existirem evidências suficientes).",
    "",
    "5) Justificativa:",
    "- Na linha 'Justificativa', faça uma síntese objetiva dos critérios de seleção (Studio, senioridade, habilidades/níveis e meses na empresa) encontrados no CONTEXTO.",
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
    "- Innovation Studio: priorizar candidatos com innovation_studio igual; se menos de 10 aprovados, AMPLIE para outros Studios ATÉ completar 10.",
    "- Senioridade: aplicar as mesmas regras do modo Match Vagas.",
    "- Habilidades: aplicar os mesmos critérios (obrigatórios e nível na tecnologia principal), priorizando nível 3 e 4.",
    "",
    "2) Continuidade e Risco (quando houver evidências no CONTEXTO):",
    "- Valorizar candidatos com histórico/fit no domínio do cliente, stack semelhante e menor curva de rampa.",
    "",
    "3) Quantidade:",
    "- Retorne ATÉ 10 substitutos; expanda Studios para atingir 10, se houver evidências suficientes.",
    "",
    "4) Justificativa:",
    "- Na linha 'Justificativa', EXPLICITE a similaridade com o profissional informado no formulário, usando os mesmos critérios: Studio, senioridade, habilidades-chave e níveis, meses na empresa e, quando houver no CONTEXTO, domínio/cliente e stack. Seja curto e direto.",
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

    // 1) Recupera exclusivamente da base vetorial (mais resultados para aumentar recall)
    const chunks = await retrieveFromKB(message, { maxResults: 100, minScore: 0.0 });
    if (chunks.length === 0) {
      return NextResponse.json(
        {
          reply:
            "Sem evidências suficientes na base de conhecimento para responder com segurança. Refine os termos ou atualize a KB.",
        },
        { status: 200 },
      );
    }

    // 2) Contexto sem rótulos "Trecho N" (evita vazar para a saída)
    const contexto = chunks
      .map((c) => {
        const bodyText = truncate(c.text, 3800);
        // Mantemos a fonte opcionalmente, mas sem cabeçalho que o modelo possa copiar
        return `${bodyText}${c.source ? `\n[Fonte]: ${c.source}` : ""}`;
      })
      .join("\n\n---\n\n");

    // 3) System por modo
    const system =
      mode === "substituicao_profissional"
        ? buildSystemForSubstituicao(contexto)
        : buildSystemForMatchVagas(contexto);

    // 4) Invoca o modelo com system + mensagem do usuário
    const reply = await invokeHaiku({
      message, // prompt construído no front
      history,
      system,
      maxTokens: 1200,
      temperature: 0.2, // menos restrito para melhorar recall
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
