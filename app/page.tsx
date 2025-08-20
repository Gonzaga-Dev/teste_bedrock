"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import styles from "./page.module.css";

// Amplify Auth UI
import { Amplify } from "aws-amplify";
import outputs from "@/amplify_outputs.json";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";

// configure Amplify (client-side)
Amplify.configure(outputs);

const LEGEND = "Sou o MX Lakinho, seu amiguinho. Posso ajudar?";
type Msg = { role: "user" | "assistant"; content: string };

// (opcional) allowlist: só estes e-mails permanecem logados
const ALLOW = new Set<string>([
  "ricardo.gonzaga@compasso.com.br",
  "lrgr3000@gmail.com",
]);

export default function App() {
  const [legend, setLegend] = useState("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
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

  function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");

    setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", content: "Num sei." }]);
    }, 400);
  }

  return (
    <Authenticator>
      {({ user, signOut }) => {
        const email =
          // loginId cobre e-mail em provedores diferentes
          (user as any)?.signInDetails?.loginId?.toLowerCase?.() ||
          (user as any)?.attributes?.email?.toLowerCase?.() ||
          "";

        // (opcional) se não estiver na allowlist, desloga
        if (email && !ALLOW.has(email)) {
          signOut();
          return null;
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
              {messages.length === 0 && (
                <div className={styles.placeholder}>
                  Envie uma mensagem para começar.
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`${styles.msg} ${
                    m.role === "user" ? styles.user : styles.assistant
                  }`}
                >
                  {m.content}
                </div>
              ))}
              <div ref={endRef} />
            </section>

            <form onSubmit={handleSend} className={styles.inputBar}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Digite sua mensagem…"
                className={styles.textInput}
              />
              <button type="submit" className={styles.sendBtn} aria-label="Enviar">
                ➤
              </button>
            </form>
          </div>
        );
      }}
    </Authenticator>
  );
}
