"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";

type Msg = { role: "user" | "assistant"; content: string };
type ModeKey = "match_vagas" | "substituicao_profissional";

/* Modos com legends/labels atualizados */
const MODES: Record<
  ModeKey,
  { label: string; legend: string; submitLabel: string; placeholder: string }
> = {
  match_vagas: {
    label: "Match Vagas",
    legend:
      "Quanto mais detalhes forem fornecidos, mais preciso será o match. Que tipo de profissional você busca hoje?",
    submitLabel: "Buscar candidatos",
    placeholder:
      "Requisitos desejáveis, nº de profissionais, atividades, escopo, necessidades do cliente…",
  },
  substituicao_profissional: {
    label: "Substituição de Profissional",
    legend:
      "Informe perfil desejado para a reposição. Quanto mais detalhes, mais adequados serão os profissionais.",
    submitLabel: "Sugerir substitutos",
    placeholder:
      "Motivo da substituição, skills essenciais, diferenciais, contexto do projeto…",
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

  // Splash screen (3s) com animação "carregando..."
  const [showSplash, setShowSplash] = useState(true);
  const [dots, setDots] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 3000);
    const i = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, []);

  // --- Modo ---
  const urlMode = (sp.get("mode") as ModeKey) || undefined;
  const [mode, setMode] = useState<ModeKey>(urlMode || "match_vagas");

  // --- Estado UI ---
  const [legend, setLegend] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // --- Form base (comum) ---
  const [titulo, setTitulo] = useState("");
  const [studio, setStudio] = useState<typeof STUDIOS[number]>("Data & AI");
  const [senioridade, setSenioridade] = useState("Trainee");
  const [techs, setTechs] = useState("");
  const [descricao, setDescricao] = useState("");

  // --- Campo para substituição (ajustado) ---
  const [alvoSubstituicao, setAlvoSubstituicao] = useState(""); // Nome do Profissional

  // Persistir modo na URL e no localStorage
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    q.set("mode", mode);
    router.replace(`?${q.toString()}`);
    localStorage.setItem("mode", mode);
  }, [mode, router]);

  // Restaurar modo salvo se não veio pela URL
  useEffect(() => {
    if (!urlMode) {
      const saved = localStorage.getItem("mode") as ModeKey | null;
      if (saved && MODES[saved]) setMode(saved);
    }
  }, [urlMode]);

  // Efeito de "digitação" na legenda ao trocar de modo
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

  // Auto scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const studioValue = (STUDIOS as readonly string[]).includes(studio) ? studio : STUDIOS[0];

  // --- Prompt builders ---
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

    const subInfo = `Nome do Profissional (atual): ${alvoSubstituicao.trim() || "-"}`;

    return [
      "Objetivo: sugerir substitutos adequados para o profissional indicado.",
      "Regras:",
      "- Considere fit técnico, senioridade, e dê preferência a profissionais do mesmo Studio",
      "- Liste substitutos potenciais com justificativas curtas",
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

  // --- Submit ---
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

  /* Splash screen simples, centralizado */
  if (showSplash) {
    return (
      <div className={styles.wrapper} style={{ display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <h1 className={styles.title}>Talent Match Making</h1>
          <p className={styles.legend}>carregando{dots}</p>
        </div>
      </div>
    );
  }

  // App normal
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
              <label htmlFor="alvo">Nome do Profissional</label>
              <input
                id="alvo"
                className={styles.input}
                placeholder="Ex.: João Silva"
                value={alvoSubstituicao}
                onChange={(e) => setAlvoSubstituicao(e.target.value)}
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
