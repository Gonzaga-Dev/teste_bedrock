"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";

type Msg = { role: "user" | "assistant"; content: string };
type ModeKey = "match_vagas" | "substituicao_profissional";

const MODES: Record<
  ModeKey,
  { label: string; legend: string; submitLabel: string; placeholder: string }
> = {
  match_vagas: {
    label: "Match Vagas",
    legend:
      "Descreva a vaga. Quanto mais detalhes, mais preciso o match. Informe requisitos, responsabilidades e contexto.",
    submitLabel: "Buscar candidatos",
    placeholder:
      "Requisitos desejáveis, nº de profissionais, atividades, escopo, necessidades do cliente…",
  },
  substituicao_profissional: {
    label: "Substituição de Profissional",
    legend:
      "Descreva a necessidade de substituição (contexto, riscos, prazos). Informe perfil desejado para a reposição.",
    submitLabel: "Sugerir substitutos",
    placeholder:
      "Motivo da substituição, riscos do projeto, prazos, skills essenciais e diferenciais…",
  },
};

const MODE_KEYS = Object.keys(MODES) as ModeKey[];

const STUDIOS = [
  "Agile Transformation",
  "Modern Applications",
  "Data & AI",
  "Cloud & DevSecOps",
  "Mobile Apps",
  "Digital Commerce & Experiences",
  "Delivery Management",
  "Quality Engineering",
  "Hyperautomation (RPA)",
  "User Experience",
  "Future Hacking",
  "AI Cockpit",
  "Financial Solutions",
  "Information Security",
  "Global Executive Management",
  "Business Management",
  "Internal Infrastructure & Support",
  "Gaming, XR & Metaverse",
  "AWS reStack",
  "People",
  "Communication & Marketing",
  "Academy",
  "Back-Office",
  "BackOffice Revenue",
  "Executive Management",
  "Privacy & Compliance",
  "Todos os Studios",
] as const;

const LEGEND_SPEED_MS = 25;

export default function Page() {
  const router = useRouter();
  const sp = useSearchParams();

  const urlMode = (sp.get("mode") as ModeKey) || undefined;
  const [mode, setMode] = useState<ModeKey>(urlMode || "match_vagas");

  const [legend, setLegend] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const [titulo, setTitulo] = useState("");
  const [studio, setStudio] = useState<typeof STUDIOS[number]>("Data & AI");
  const [senioridade, setSenioridade] = useState("Trainee");
  const [techs, setTechs] = useState("");
  const [descricao, setDescricao] = useState("");

  const [alvoSubstituicao, setAlvoSubstituicao] = useState("");
  const [contextoSubstituicao, setContextoSubstituicao] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    q.set("mode", mode);
    router.replace(`?${q.toString()}`);
    localStorage.setItem("mode", mode);
  }, [mode, router]);

  useEffect(() => {
    if (!urlMode) {
      const saved = localStorage.getItem("mode") as ModeKey | null;
      if (saved && MODES[saved]) setMode(saved);
    }
  }, [urlMode]);

  useEffect(() => {
    const target = MODES[mode].legend;
    setLegend("");
    let i = 0;
    const id = setInterval(() => {
      setLegend(target.slice(0, i + 1));
      i++;
      if (i >= target.length) clearInterval(id);
    }, LEGEND_SPEED_MS);
    return () => clearInterval(id);
  }, [mode]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const studioValue = (STUDIOS as readonly string[]).includes(studio) ? studio : STUDIOS[0];

  function buildPromptMatchVagas() {
    const brief =
      `Título: ${titulo.trim() || "-"}\n` +
      `Studio: ${studioValue}\n` +
      `Senioridade: ${senioridade}\n` +
      `Tecnologias: ${techs.trim() || "-"}\n` +
      `Descrição: ${descricao.trim() || "-"}`;

    return [
      "Objetivo: encontrar candidatos com melhor aderência à vaga abaixo.",
      "Regras:",
      "- Considere aderência técnica, senioridade e contexto informado.",
      "- Responda de forma objetiva, listando candidatos e justificativas resumidas.",
      "- Se houver múltiplos perfis possíveis, priorize os mais alinhados e aponte trade-offs.",
      "",
      "VAGA:",
      brief,
    ].join("\n");
  }

  function buildPromptSubstituicao() {
    const briefBase =
      `Título (se aplicável): ${titulo.trim() || "-"}\n` +
      `Studio: ${studioValue}\n` +
      `Senioridade desejada: ${senioridade}\n` +
      `Tecnologias-chave: ${techs.trim() || "-"}\n` +
      `Perfil desejado (descrição): ${descricao.trim() || "-"}`;

    const subInfo =
      `Profissional atual (nome/ID): ${alvoSubstituicao.trim() || "-"}\n` +
      `Contexto/Riscos/Prazos: ${contextoSubstituicao.trim() || "-"}`;

    return [
      "Objetivo: sugerir substitutos adequados para o profissional indicado, mitigando riscos e mantendo a continuidade do projeto.",
      "Regras:",
      "- Considere fit técnico, senioridade, domínio de domínio/cliente e riscos informados.",
      "- Liste substitutos potenciais com justificativas curtas e recomendações de transição (handover).",
      "- Se necessário, proponha plano de mitigação de curto prazo.",
      "",
      "DADOS DA SUBSTITUIÇÃO:",
      subInfo,
      "",
      "PERFIL ALVO PARA REPOSIÇÃO:",
      briefBase,
    ].join("\n");
  }

  function buildUserMessage(): string {
    return mode === "substituicao_profissional" ? buildPromptSubstituicao() : buildPromptMatchVagas();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;

    const prompt = buildUserMessage();
    const history = [...messages, { role: "user", content: prompt } as Msg].slice(-20);

    setMessages(history);
    setLoading(true);

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, history, mode }),
      });

      let reply = "⚠️ Resposta vazia do servidor";
      try {
        const data = await r.json();
        reply = (!r.ok && data?.error && `⚠️ ${data.error}`) || String(data?.reply ?? reply);
      } catch {
        reply = `⚠️ Falha ao parsear resposta (${r.status} ${r.statusText})`;
      }

      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (err: any) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Falhou ao contactar o modelo: ${err?.message || err}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant") ?? null;

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <h1 className={styles.title}>Talent Match Making</h1>

        <div className={styles.modes}>
          {MODE_KEYS.map((k) => (
            <button
              key={k}
              className={`${styles.modeCard} ${mode === k ? styles.active : ""}`}
              onClick={() => setMode(k)}
              type="button"
            >
              {MODES[k].label}
            </button>
          ))}
        </div>

        <p className={styles.legend}>
          {legend}
          <span className={styles.caret} aria-hidden="true" />
        </p>
      </header>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="titulo">Título</label>
          <input
            id="titulo"
            className={styles.input}
            placeholder="Ex.: Cientista de Dados / Engenheiro de Software"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="studio">Innovation Studio</label>
          <select
            id="studio"
            className={styles.input}
            value={studioValue}
            onChange={(e) => setStudio(e.target.value as typeof STUDIOS[number])}
            required
          >
            {STUDIOS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="senioridade">Senioridade</label>
          <select
            id="senioridade"
            className={styles.input}
            value={senioridade}
            onChange={(e) => setSenioridade(e.target.value)}
            required
          >
            <option>Trainee</option>
            <option>Júnior</option>
            <option>Pleno</option>
            <option>Sênior</option>
            <option>Especialista</option>
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="techs">Tecnologias</label>
          <input
            id="techs"
            className={styles.input}
            placeholder="Ex.: Python, Spark, AWS, SQL"
            value={techs}
            onChange={(e) => setTechs(e.target.value)}
            required
          />
        </div>

        <div className={styles.fieldFull}>
          <label htmlFor="desc">{mode === "match_vagas" ? "Descreva a Vaga" : "Perfil Desejado"}</label>
          <textarea
            id="desc"
            className={`${styles.input} ${styles.textarea}`}
            placeholder={MODES[mode].placeholder}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            required
          />
        </div>

        {mode === "substituicao_profissional" && (
          <>
            <div className={styles.field}>
              <label htmlFor="alvo">Profissional atual (nome/ID)</label>
              <input
                id="alvo"
                className={styles.input}
                placeholder="Ex.: João Silva (ID 12345)"
                value={alvoSubstituicao}
                onChange={(e) => setAlvoSubstituicao(e.target.value)}
                required={mode === "substituicao_profissional"}
              />
            </div>

            <div className={styles.fieldFull}>
              <label htmlFor="contexto">Contexto / Riscos / Prazos</label>
              <textarea
                id="contexto"
                className={`${styles.input} ${styles.textarea}`}
                placeholder="Ex.: Prazo crítico em 30 dias, risco de atraso em entregas, necessidade de handover…"
                value={contextoSubstituicao}
                onChange={(e) => setContextoSubstituicao(e.target.value)}
                required={mode === "substituicao_profissional"}
              />
            </div>
          </>
        )}

        <div className={styles.actions}>
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? "Gerando…" : MODES[mode].submitLabel}
          </button>
        </div>
      </form>

      <section className={styles.card}>
        {!lastAssistant && !loading && (
          <div className={styles.placeholder}>Os resultados aparecerão aqui.</div>
        )}

        {lastAssistant && (
          <div className={`${styles.msg} ${styles.assistant}`}>{lastAssistant.content}</div>
        )}

        {loading && <div className={`${styles.msg} ${styles.assistant}`}>Gerando resposta…</div>}
        <div ref={endRef} />
      </section>
    </div>
  );
}
