"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    window.location.replace("/intent.html");
  }, []);

  return (
    <main className="sites-handoff" aria-live="polite">
      <img src="/assets/intent-mark-v2.png" alt="Intent" />
      <p>Opening the agentic commerce decision room…</p>
    </main>
  );
}
