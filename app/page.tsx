"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import styles from "./page.module.css";

const LEGEND =
  "Quanto mais detalhes forem fornecidos, mais preciso será o match. Que tipo de profissional você busca hoje?";

type Msg = { role: "user" | "assistant"; content: string };

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
  "Buscar em Todos",
] as const;

export default function Page() {
  const [legend, setLegend] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Form state
  const [titulo, setTitulo] = useState("");
  const [studio, setStudio] = useState<typeof STUDIOS[number]>("Data & AI");
  const [senioridade, setSenioridade] = useState("Trainee");
  const [techs, setTechs] = useState("");
  const [descricao, setDescricao] = useState("");

  // Typing effect for legend
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      setLegend(LEGEND.slice(0, i + 1));
      i++;
      if (i >= LEGEND.length) clearInterval(id);
    }, 25);
    return () => clearInterval(id);
  }, []);

  // Auto scroll to latest rendered msg (even que exibamos só a última)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function buildPrompt() {
    const brief =
      `Título: ${titulo.trim() || "-"}\n` +
      `Studio: ${studio}\n` +
      `Senioridade: ${senioridade}\n` +
      `Tecnologias: ${techs.trim() || "-"}\n` +
      `Descrição: ${descricao.trim() || "-"}`;

    return (
      "Encontre candidatos que melhor atendam à vaga abaixo. " +
      "Considere aderência técnica e senioridade. Responda com uma lista enxuta e justificativas.\n\n" +
      brief
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;

    const prompt = buildPrompt();
    // mantém histórico (para o backend), mas só exibiremos a última resposta
    const history = [...messages, { role: "user", content: prompt } as Msg].slice(-20);

    setMessages(history);
    setLoading(true);

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, history }),
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

  // Apenas a última resposta do assistant para renderização
  const lastAssistant =
    [...messages].reverse().find((m) => m.role === "assistant") ?? null;

  // Fallback: se o estado tiver valor fora da lista por qualquer razão
  const studioValue = (STUDIOS as readonly string[]).includes(studio)
    ? studio
    : STUDIOS[0];

  return (
    <div className={styles.wrapper}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>Talent Match Making</h1>
        <p className={styles.legend}>
          {legend}
          <span className={styles.caret} aria-hidden="true" />
        </p>
      </header>

      {/* Form */}
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="titulo">Título da vaga</label>
          <input
            id="titulo"
            className={styles.input}
            placeholder="Ex.: Cientista de Dados"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="studio">Innovation Studio da Vaga</label>
          <select
            id="studio"
            className={styles.input}
            value={studioValue}
            onChange={(e) => setStudio(e.target.value as typeof STUDIOS[number])}
          >
            {STUDIOS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="senioridade">Senioridade da vaga</label>
          <select
            id="senioridade"
            className={styles.input}
            value={senioridade}
            onChange={(e) => setSenioridade(e.target.value)}
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
          />
        </div>

        <div className={styles.fieldFull}>
          <label htmlFor="desc">Descreva o que Busca</label>
          <textarea
            id="desc"
            className={`${styles.input} ${styles.textarea}`}
            placeholder="Requisitos desejáveis, nº de profissionais, Descrição das atividades"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? "Buscando…" : "Buscar candidatos"}
          </button>
        </div>
      </form>

      {/* Apenas a última resposta */}
      <section className={styles.card}>
        {!lastAssistant && !loading && (
          <div className={styles.placeholder}>Os resultados aparecerão aqui.</div>
        )}

        {lastAssistant && (
          <div className={`${styles.msg} ${styles.assistant}`}>
            {lastAssistant.content}
          </div>
        )}

        {loading && (
          <div className={`${styles.msg} ${styles.assistant}`}>Gerando resposta…</div>
        )}
        <div ref={endRef} />
      </section>
    </div>
  );
}
