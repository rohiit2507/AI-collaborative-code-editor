import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

export function createYjsProvider(
  roomId: string,
  doc: Y.Doc,
  fileId?: number | string
) {
  const roomName =
    fileId === undefined || fileId === null
      ? `codecollab-room-${roomId}`
      : `codecollab-room-${roomId}-file-${fileId}`;

  const provider = new WebsocketProvider(
    "ws://localhost:1234",
    roomName,
    doc
  );

  return provider;
}