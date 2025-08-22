"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import styles from "./page.module.css";

const LEGEND = "Sou o MX Lakinho, seu amiguinho. Posso ajudar?";

type Msg = { role: "user" | "assistant"; content: string };

export default function App() {
  const [legend, setLegend] = useState("");
  const [input, setInput] = useState("");
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

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    // adiciona a mensagem do usuário ao histórico
    const newHistory = [...messages, { role: "user", content: text } as Msg];
    setMessages(newHistory);
    setInput("");
    setLoading(true);

    try {
      // chama o route handler (server) que invoca o Bedrock
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: newHistory }),
      });

      const data = await res.json();
      const reply = (data?.reply ?? "Erro: resposta vazia").toString();

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
      <header className={styles.header}>
        <h1 className={styles.title}>Talent Match Making</h1>
        <div className={styles.legend}>
          {legend}
          <span className={styles.caret} />
        </div>
      </header>

      <section className={styles.chat}>
        {messages.length === 0 && !loading && (
          <div className={styles.placeholder}>Envie uma mensagem para começar.</div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`${styles.msg} ${m.role === "user" ? styles.user : styles.assistant}`}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className={`${styles.msg} ${styles.assistant}`}>
            Gerando resposta…
          </div>
        )}
        <div ref={endRef} />
      </section>

      <form onSubmit={handleSend} className={styles.inputBar}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite sua mensagem…"
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
