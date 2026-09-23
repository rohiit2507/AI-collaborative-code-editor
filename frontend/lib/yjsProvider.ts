import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { YJS_URL } from "@/lib/config";

export function createYjsProvider(
  roomId: string,
  doc: Y.Doc,
  fileId?: number | string,
  token?: string
) {
  const roomName =
    fileId === undefined || fileId === null
      ? `codecollab-room-${roomId}`
      : `codecollab-room-${roomId}-file-${fileId}`;

  const provider = new WebsocketProvider(YJS_URL, roomName, doc, {
    params: token ? { token } : {},
  });

  return provider;
}