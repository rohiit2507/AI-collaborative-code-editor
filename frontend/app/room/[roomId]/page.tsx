"use client";

import { use } from "react";
import CodeEditor from "@/components/CodeEditor";

export default function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);

  return (
    <main className="cc-shell">
      <header style={{ margin: "0 auto", maxWidth: "1400px", padding: "0 0 18px" }}>
        <div className="cc-eyebrow">Collaborative session</div>
        <h1>CodeCollab Room</h1>

        <p>Room ID: {roomId}</p>
      </header>

      <CodeEditor roomId={roomId} />
    </main>
  );
}