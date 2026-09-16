const http = require("http");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const Y = require("yjs");
const syncProtocol = require("y-protocols/sync");
const awarenessProtocol = require("y-protocols/awareness");
const encoding = require("lib0/encoding");
const decoding = require("lib0/decoding");
const pool = require("./config/db");

const HOST = process.env.YJS_HOST || "0.0.0.0";
const PORT = Number(process.env.YJS_PORT || 1234);
const ROOM_NAME_PATTERN = /^codecollab-room-(\d+)(?:-file-\d+)?$/;
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const PING_INTERVAL_MS = 30_000;
const documents = new Map();

function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((cookies, cookie) => {
    const [name, ...valueParts] = cookie.trim().split("=");

    if (name) {
      cookies[name] = valueParts.join("=");
    }

    return cookies;
  }, {});
}

function getRoomId(requestUrl) {
  const url = new URL(requestUrl || "/", "http://localhost");
  const roomName = decodeURIComponent(url.pathname.slice(1));
  const match = ROOM_NAME_PATTERN.exec(roomName);

  return match ? Number(match[1]) : null;
}

async function authorizeRoomConnection(request) {
  const roomId = getRoomId(request.url);

  if (!roomId) {
    return false;
  }

  const token = parseCookies(request.headers.cookie).token;

  if (!token) {
    return false;
  }

  let user;

  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return false;
  }

  const result = await pool.query(
    `SELECT owner_id
     FROM rooms
     WHERE id = $1`,
    [roomId]
  );

  return (
    result.rows.length === 1 &&
    String(result.rows[0].owner_id) === String(user.userId)
  );
}

function send(document, connection, message) {
  if (connection.readyState !== WebSocket.OPEN) {
    closeConnection(document, connection);
    return;
  }

  connection.send(message, (error) => {
    if (error) {
      closeConnection(document, connection);
    }
  });
}

function broadcastAwarenessUpdate(document, clientIds) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(document.awareness, clientIds)
  );

  const message = encoding.toUint8Array(encoder);
  document.connections.forEach((_clientIds, connection) => {
    send(document, connection, message);
  });
}

function createDocument(name) {
  const document = new Y.Doc();
  document.name = name;
  document.connections = new Map();
  document.awareness = new awarenessProtocol.Awareness(document);
  document.awareness.setLocalState(null);

  document.on("update", (update) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);

    document.connections.forEach((_clientIds, connection) => {
      send(document, connection, message);
    });
  });

  document.awareness.on("update", ({ added, updated, removed }, connection) => {
    const changedClientIds = added.concat(updated, removed);
    const controlledClientIds = document.connections.get(connection);

    if (controlledClientIds) {
      added.forEach((clientId) => controlledClientIds.add(clientId));
      removed.forEach((clientId) => controlledClientIds.delete(clientId));
    }

    broadcastAwarenessUpdate(document, changedClientIds);
  });

  return document;
}

function getDocument(name) {
  if (!documents.has(name)) {
    documents.set(name, createDocument(name));
  }

  return documents.get(name);
}

function closeConnection(document, connection) {
  const controlledClientIds = document.connections.get(connection);

  if (!controlledClientIds) {
    return;
  }

  document.connections.delete(connection);
  awarenessProtocol.removeAwarenessStates(
    document.awareness,
    Array.from(controlledClientIds),
    null
  );

  if (document.connections.size === 0) {
    documents.delete(document.name);
    document.destroy();
  }

  if (connection.readyState === WebSocket.OPEN) {
    connection.close();
  }
}

function handleMessage(document, connection, message) {
  try {
    const decoder = decoding.createDecoder(new Uint8Array(message));
    const messageType = decoding.readVarUint(decoder);
    const encoder = encoding.createEncoder();

    if (messageType === MESSAGE_SYNC) {
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, document, connection);

      if (encoding.length(encoder) > 1) {
        send(document, connection, encoding.toUint8Array(encoder));
      }
    }

    if (messageType === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(
        document.awareness,
        decoding.readVarUint8Array(decoder),
        connection
      );
    }
  } catch (error) {
    console.error("Yjs message handling failed:", error.message);
    closeConnection(document, connection);
  }
}

function setupWSConnection(connection, request) {
  const documentName = decodeURIComponent(
    new URL(request.url || "/", "http://localhost").pathname.slice(1)
  );
  const document = getDocument(documentName);
  const pingInterval = setInterval(() => {
    if (connection.readyState === WebSocket.OPEN) {
      connection.ping();
    }
  }, PING_INTERVAL_MS);

  connection.binaryType = "arraybuffer";
  document.connections.set(connection, new Set());
  connection.on("message", (message) => handleMessage(document, connection, message));
  connection.on("close", () => {
    clearInterval(pingInterval);
    closeConnection(document, connection);
  });
  connection.on("error", () => closeConnection(document, connection));

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, document);
  send(document, connection, encoding.toUint8Array(encoder));

  const awarenessStates = document.awareness.getStates();

  if (awarenessStates.size > 0) {
    broadcastAwarenessUpdate(document, Array.from(awarenessStates.keys()));
  }
}

const webSocketServer = new WebSocket.Server({ noServer: true });

webSocketServer.on("connection", setupWSConnection);

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ success: true, service: "Yjs WebSocket", rooms: documents.size }));
});

server.on("upgrade", async (request, socket, head) => {
  try {
    const isAuthorized = await authorizeRoomConnection(request);

    if (!isAuthorized) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  } catch (error) {
    console.error("Yjs room authorization failed:", error.message);
    socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
    socket.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Yjs server running on ws://${HOST}:${PORT}`);
});
