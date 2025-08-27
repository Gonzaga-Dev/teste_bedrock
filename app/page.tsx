"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import styles from "./page.module.css";

const LEGEND = "Quanto mais detalhes você der, mais preciso fica o match. O que você busca hoje?";
type Msg = { role: "user" | "assistant"; content: string };

export default function Page() {
  const [legend, setLegend] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // typing effect na legenda
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

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const history = [...messages, { role: "user", content: text } as Msg].slice(-20);
    setMessages(history);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      let reply: string;
      try {
        const data = await res.json();
        reply =
          (!res.ok && data?.error && `⚠️ ${data.error}`) ||
          (data?.reply ?? "⚠️ Resposta vazia do servidor");
      } catch {
        reply = `⚠️ Falha ao parsear resposta (${res.status} ${res.statusText})`;
      }

      setMessages((m) => [...m, { role: "assistant", content: reply.toString() }]);
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
        <div className={styles.legend}>
          {legend}
          <span className={styles.caret} aria-hidden="true" />
        </div>
      </header>

      {/* Form */}
      <form className={styles.form} onSubmit={handleSend}>
        <div className={styles.field}>
          <label htmlFor="titulo">Título da vaga</label>
          <input id="titulo" type="text" className={styles.input} placeholder="Ex.: Cientista de Dados Pleno" />
        </div>

        <div className={styles.field}>
          <label htmlFor="studio">Innovation Studio</label>
          <select id="studio" className={styles.input}>
            <option>Data&IA</option>
            <option>Modern Apps</option>
            <option>Gaming / XR</option>
            <option>Cloud</option>
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="senioridade">Senioridade da vaga</label>
          <select id="senioridade" className={styles.input}>
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
            type="text"
            className={styles.input}
            placeholder="Ex.: Python, Spark, AWS, SQL"
          />
        </div>

        <div className={styles.fieldFull}>
          <label htmlFor="desc">Descrição das atividades</label>
          <textarea
            id="desc"
            className={`${styles.input} ${styles.textarea}`}
            placeholder="Contexto do projeto, requisitos desejáveis, diferenciais…"
          />
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? "Buscando…" : "Buscar candidatos"}
          </button>
        </div>
      </form>

      {/* Chat / Resultado */}
      <section className={styles.card}>
        {messages.length === 0 && !loading && (
          <div className={styles.placeholder}>Os resultados aparecerão aqui.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`${styles.msg} ${m.role === "user" ? styles.user : styles.assistant}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className={`${styles.msg} ${styles.assistant}`}>Gerando resposta…</div>}
        <div ref={endRef} />
      </section>

      {/* Input do chat “livre” (se quiser conversar com o modelo) */}
      <form onSubmit={handleSend} className={styles.inputBar}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escreva uma pergunta ou refine sua busca…"
          className={styles.textInput}
          disabled={loading}
        />
        <button type="submit" className={styles.sendBtn} aria-label="Enviar" disabled={loading}>
          ➤
        </button>
      </form>
    </div>
  );
}
