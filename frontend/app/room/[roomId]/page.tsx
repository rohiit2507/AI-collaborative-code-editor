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
    <main>
      <h1>CodeCollab Room</h1>

      <p>Room ID: {roomId}</p>

      <CodeEditor roomId={roomId} />
    </main>
  );
}