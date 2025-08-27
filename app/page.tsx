"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import styles from "./page.module.css";

const LEGEND = "Sou o MX Lakinho, seu amiguinho. Posso ajudar?";
type Msg = { role: "assistant"; content: string };

export default function App() {
  const [legend, setLegend] = useState("");
  const [formData, setFormData] = useState({
    jobTitle: "",
    studio: "Data&IA",
    seniority: "Trainee",
    technologies: "",
    description: "",
  });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      setLegend(LEGEND.slice(0, i + 1));
      i++;
      if (i >= LEGEND.length) clearInterval(id);
    }, 35);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const { jobTitle, studio, seniority, technologies, description } = formData;

    const prompt = `Me indique os 5 candidatos mais adequados para a vaga de "${jobTitle}", que seja preferencialmente do studio ${studio}, tenha senioridade ${seniority}, domine ${technologies} e seja aderente à ${description}`;

    setMessages([{ role: "assistant", content: prompt }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, history: [] }),
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
        {
          role: "assistant",
          content: `Falhou ao contactar o modelo: ${err?.message || err}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <h1 className={styles.title}>Talent Match Making</h1>
        <div className={styles.legend}>
          {legend}
          <span className={styles.caret} />
        </div>
        <div className={styles.subtitle}>
          Quanto mais detalhes forem inseridos, mais precisa será a busca. Que tipo de profissional você está em busca hoje?
        </div>
      </header>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label>Título da vaga:</label>
          <input
            type="text"
            name="jobTitle"
            value={formData.jobTitle}
            onChange={handleChange}
            required
          />
        </div>
        <div className={styles.field}>
          <label>Innovation Studio:</label>
          <select name="studio" value={formData.studio} onChange={handleChange}>
            <option value="Data&IA">Data&IA</option>
            <option value="Modern Applications">Modern Applications</option>
            <option value="Outros">Outros</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>Senioridade da vaga:</label>
          <select name="seniority" value={formData.seniority} onChange={handleChange}>
            <option value="Trainee">Trainee</option>
            <option value="Junior">Junior</option>
            <option value="Pleno">Pleno</option>
            <option value="Senior">Senior</option>
            <option value="Especialista">Especialista</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>Tecnologias:</label>
          <input
            type="text"
            name="technologies"
            value={formData.technologies}
            onChange={handleChange}
          />
        </div>
        <div className={styles.field}>
          <label>Descrição das atividades:</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={4}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Enviando…" : "Buscar candidatos"}
        </button>
      </form>

      <section className={styles.chat}>
        {messages.map((m, i) => (
          <div key={i} className={`${styles.msg} ${styles.assistant}`}>
            {m.content}
          </div>
        ))}
        <div ref={endRef} />
      </section>
    </div>
  );
}
