"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import styles from "./page.module.css";

const LEGEND =
  "Quanto mais detalhes forem fornecidos, mais preciso será o match. Que tipo de profissional você busca hoje?";

type Msg = { role: "user" | "assistant"; content: string };

export default function Page() {
  const [legend, setLegend] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Campos do formulário
  const [titulo, setTitulo] = useState("");
  const [studio, setStudio] = useState("Data&IA");
  const [senioridade, setSenioridade] = useState("Trainee");
  const [techs, setTechs] = useState("");
  const [descricao, setDescricao] = useState("");

  // Efeito de digitação na legenda
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      setLegend(LEGEND.slice(0, i + 1));
      i++;
      if (i >= LEGEND.length) clearInterval(id);
    }, 25);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    const history = [...messages, { role: "user", content: prompt } as Msg].slice(-20);

    setMessages(history); // mantém histórico para o modelo (não renderizamos o 'user')
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

  {/* mantenha o estado `studio` como string */}
  <select
    id="studio"
    className={styles.input}
    value={studio}
    onChange={(e) => setStudio(e.target.value)}
  >
    {[
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
    ].map((opt) => (
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
          <label htmlFor="desc">Descrição das atividades</label>
          <textarea
            id="desc"
            className={`${styles.input} ${styles.textarea}`}
            placeholder="Contexto do projeto, requisitos desejáveis, diferenciais…"
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

      {/* Respostas (apenas assistant) */}
      <section className={styles.card}>
        {messages.filter((m) => m.role === "assistant").length === 0 && !loading && (
          <div className={styles.placeholder}>Os resultados aparecerão aqui.</div>
        )}

        {messages
          .filter((m) => m.role === "assistant")
          .map((m, i) => (
            <div key={i} className={`${styles.msg} ${styles.assistant}`}>
              {m.content}
            </div>
          ))}

        {loading && <div className={`${styles.msg} ${styles.assistant}`}>Gerando resposta…</div>}
        <div ref={endRef} />
      </section>
    </div>
  );
}
