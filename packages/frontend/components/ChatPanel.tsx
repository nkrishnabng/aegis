"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessageRecord } from "@testingmcp/shared";

interface ChatPanelProps {
  messages: ChatMessageRecord[];
  streamingText: string;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, streamingText, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft.trim());
    setDraft("");
  }

  return (
    <div className="chat-panel">
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && !streamingText && (
          <p className="muted">
            Try: &ldquo;Generate test cases for the login page&rdquo; or &ldquo;Test an
            invalid password&rdquo;.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {streamingText && <div className="chat-bubble assistant">{streamingText}</div>}
      </div>
      <form className="chat-input-row" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask the agent to generate, edit, or explain tests..."
        />
        <button className="btn primary" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
