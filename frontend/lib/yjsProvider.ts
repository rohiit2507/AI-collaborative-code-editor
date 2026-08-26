import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

export function createYjsProvider(
  roomId: string,
  doc: Y.Doc
) {
  const provider = new WebsocketProvider(
    "ws://localhost:1234",
    `codecollab-room-${roomId}`,
    doc
  );

  return provider;
}