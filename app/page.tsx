"use client";

import { useEffect, useRef, useState, FormEvent, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";

type Msg = { role: "user" | "assistant"; content: string };
type ModeKey = "match_vagas" | "substituicao_profissional";

type Candidate = {
  nome?: string;
  studio?: string;
  senioridade?: string;
  meses?: string;
  justificativa?: string;
  email?: string;
};

/* Textos compartilhados entre os modos (pedido 4) */
const COMMON_LEGEND =
  "Quanto mais detalhes forem fornecidos, mais preciso será o match. Que tipo de profissional você busca hoje?";
const COMMON_PLACEHOLDER =
  "Requisitos desejáveis, nº de profissionais, atividades, escopo, necessidades do cliente…";

/* Modos com legends/labels atualizados */
const MODES: Record<
  ModeKey,
  { label: string; legend: string; submitLabel: string; placeholder: string }
> = {
  match_vagas: {
    label: "Match Vagas",
    legend: COMMON_LEGEND,
    submitLabel: "Buscar candidatos",
    placeholder: COMMON_PLACEHOLDER,
  },
  substituicao_profissional: {
    label: "Substituição de Profissional",
    legend: COMMON_LEGEND, // igual ao match
    submitLabel: "Sugerir substitutos",
    placeholder: COMMON_PLACEHOLDER, // igual ao match
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

const SENIORIDADES = ["Trainee", "Júnior", "Pleno", "Sênior", "Especialista"] as const;

const LEGEND_SPEED_MS = 25;

/* ---------- Helpers ---------- */
function splitBlocks(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n{2,}/g)
    .map((b) => b.trim())
    .filter(Boolean);
}

function norm(line: string) {
  return line.replace(/^[\s\-•*]+/, "").trim();
}

function parseLineKV(line: string): [string, string] | null {
  const L = norm(line);
  const m = L.match(/^([^:]+):\s*(.+)$/i);
  if (!m) return null;
  return [m[1].toLowerCase().trim(), m[2].trim()];
}

function parseCandidates(text: string): Candidate[] {
  if (!text) return [];
  const blocks = splitBlocks(text);

  const out: Candidate[] = [];
  for (const b of blocks) {
    const cand: Candidate = {};
    const lines = b
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    for (const raw of lines) {
      const kv = parseLineKV(raw);
      if (!kv) continue;
      const [k, v] = kv;

      if (k.startsWith("nome")) cand.nome = v;
      else if (k.startsWith("studio")) cand.studio = v;
      else if (k.startsWith("senior")) cand.senioridade = v;
      else if (k.startsWith("meses")) cand.meses = v.replace(/[^\d.,]/g, "").replace(/,$/, "");
      else if (k.startsWith("just")) cand.justificativa = v;
      else if (k.startsWith("email")) cand.email = v;
    }

    if (cand.nome && (cand.studio || cand.justificativa)) out.push(cand);
  }

  return out;
}

export default function Page() {
  const router = useRouter();
  const sp = useSearchParams();

  // Splash (3s)
  const [showSplash, setShowSplash] = useState(true);
  const [dots, setDots] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 3000);
    const i = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 400);
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
  const [titulo, setTitulo] = useState(""); // (3) rótulo muda abaixo
  const [studio, setStudio] = useState<typeof STUDIOS[number]>("Data & AI");
  const [techs, setTechs] = useState("");
  const [descricao, setDescricao] = useState("");

  // Senioridades — (2) padrão agora é Trainee
  const DEFAULT_SENIORIDADES = ["Trainee"];
  const [senioridadesSel, setSenioridadesSel] = useState<string[]>(DEFAULT_SENIORIDADES);

  // Substituição
  const [alvoSubstituicao, setAlvoSubstituicao] = useState("");

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

  // Função de reset geral (1)
  const resetAll = () => {
    setTitulo("");
    setStudio("Data & AI");
    setTechs("");
    setDescricao("");
    setSenioridadesSel(DEFAULT_SENIORIDADES); // Trainee
    setAlvoSubstituicao("");
    setMessages([]); // limpa resultados também
  };

  // Ao trocar de modo, zera campos e anima legenda
  useEffect(() => {
    resetAll();

    const target = MODES[mode].legend;
    setLegend("");
    let i = 0;
    const id = setInterval(() => {
      setLegend(target.slice(0, i + 1));
      i++;
      if (i >= target.length) clearInterval(id);
    }, LEGEND_SPEED_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Auto scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const studioValue = (STUDIOS as readonly string[]).includes(studio) ? studio : STUDIOS[0];

  // --- Prompt builders ---
  function buildPromptMatchVagas() {
    const brief =
      `Título da Vaga: ${titulo.trim() || "-"}\n` +
      `Studio: ${studioValue}\n` +
      `Senioridades: ${senioridadesSel.length ? senioridadesSel.join(", ") : "-"}\n` +
      `Tecnologias: ${techs.trim() || "-"}\n` +
      `Descrição: ${descricao.trim() || "-"}`;

    return [
      "Objetivo: encontrar candidatos com melhor aderência à vaga abaixo.",
      "Regras:",
      "- Considere aderência técnica, senioridade e contexto informado.",
      "- Priorize candidatos com nível 3 ou 4 nas tecnologias informadas e do mesmo Studio; se não atingir quantidade, amplie para outros Studios.",
      "- Responda de forma objetiva, listando candidatos e justificativas resumidas.",
      "",
      "VAGA:",
      brief,
    ].join("\n");
  }

  function buildPromptSubstituicao() {
    const briefBase =
      `Título da Vaga (se aplicável): ${titulo.trim() || "-"}\n` +
      `Studio: ${studioValue}\n` +
      `Senioridades desejadas: ${senioridadesSel.length ? senioridadesSel.join(", ") : "-"}\n` +
      `Tecnologias-chave: ${techs.trim() || "-"}\n` +
      `Descrição: ${descricao.trim() || "-"}`;

    const subInfo = `Nome do Profissional (atual): ${alvoSubstituicao.trim() || "-"}`;

    return [
      "Objetivo: sugerir substitutos adequados para o profissional indicado.",
      "Regras:",
      "- Considere fit técnico e senioridade; priorize candidatos do mesmo Studio e níveis 3–4 nas tecnologias informadas.",
      "- Liste substitutos potenciais com justificativas curtas.",
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

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant") ?? null,
    [messages],
  );

  const candidates = useMemo(() => parseCandidates(lastAssistant?.content || ""), [lastAssistant]);

  /* Splash */
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

  // App
  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <h1 className={styles.title}>Talent Match Making</h1>

        <div className={styles.modes}>
          {MODE_KEYS.map((k) => (
            <button
              key={k}
              className={`${styles.modeCard} ${mode === k ? styles.active : ""}`}
              onClick={() => setMode(k)} // alternar aba -> reset no useEffect
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
          <label htmlFor="titulo">Título da Vaga</label> {/* (3) */}
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

        {/* Senioridades: checkboxes (múltipla seleção) */}
        <div className={styles.field}>
          <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>
            Senioridades
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
            {SENIORIDADES.map((s) => {
              const id = `sen_${s}`;
              const checked = senioridadesSel.includes(s);
              return (
                <label key={s} htmlFor={id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      setSenioridadesSel((prev) =>
                        e.target.checked ? [...prev, s] : prev.filter((x) => x !== s),
                      );
                    }}
                  />
                  <span>{s}</span>
                </label>
              );
            })}
          </div>
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
          {/* (4) Mesmo rótulo nos dois modos */}
          <label htmlFor="desc">Descreva a Vaga</label>
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
        )}

        <div className={styles.actions}>
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? "Gerando…" : MODES[mode].submitLabel}
          </button>
        </div>
      </form>

      {/* Resultado em Cards */}
      <section className={styles.card}>
        {!lastAssistant && !loading && (
          <div className={styles.placeholder}>Os resultados aparecerão aqui.</div>
        )}

        {loading && <div className={`${styles.msg} ${styles.assistant}`}>Gerando resposta…</div>}

        {!loading && lastAssistant && candidates.length === 0 && (
          <div className={`${styles.msg} ${styles.assistant}`}>{lastAssistant.content}</div>
        )}

        {!loading && candidates.length > 0 && (
          <div
            className={styles.cgrid}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {candidates.map((c, idx) => (
              <article
                key={`${c.nome || "c"}-${idx}`}
                className={styles.ccard}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 12,
                  background: "var(--surface)",
                }}
              >
                <h3 style={{ margin: "0 0 6px", fontSize: 16, color: "var(--text)" }}>
                  {c.nome || "—"}
                </h3>
                <div style={{ fontSize: 13, color: "var(--text)" }}>
                  <div>
                    <strong>Studio:</strong> {c.studio || "—"}
                  </div>
                  <div>
                    <strong>Senioridade:</strong> {c.senioridade || "—"}
                  </div>
                  <div>
                    <strong>Meses na empresa:</strong> {c.meses || "—"}
                  </div>
                </div>
                {c.justificativa && (
                  <p style={{ marginTop: 8, fontSize: 13, color: "var(--text)" }}>
                    <strong>Justificativa:</strong> {c.justificativa}
                  </p>
                )}
                {c.email && (
                  <p style={{ marginTop: 6, fontSize: 13 }}>
                    <a
                      href={`mailto:${c.email}`}
                      style={{ color: "var(--brand)", textDecoration: "none" }}
                    >
                      {c.email}
                    </a>
                  </p>
                )}
              </article>
            ))}
          </div>
        )}

        <div ref={endRef} />
      </section>
    </div>
  );
}
