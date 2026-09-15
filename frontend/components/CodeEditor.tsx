"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import type { WebsocketProvider } from "y-websocket";
import { createYjsDocument } from "@/lib/yjs";
import { createYjsProvider } from "@/lib/yjsProvider";
import { socket } from "@/lib/socket";
import { API_BASE_URL } from "@/lib/config";

interface CodeEditorProps {
  roomId: string;
}

interface RoomFile {
  id: number;
  room_id: number;
  filename: string;
  language: string;
  content: string;
  created_at?: string;
  updated_at?: string;
}

interface PresenceUser {
  id: number;
  name: string;
}

interface CursorPosition {
  lineNumber: number;
  column: number;
}

interface SelectionRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

interface AuthenticatedUser {
  id: number;
  username: string;
}

interface Participant extends PresenceUser {
  clientId: number;
  color: string;
  isCurrentUser: boolean;
  cursor: CursorPosition | null;
  selection: SelectionRange | null;
}

interface ChatMessage {
  id: number;
  room_id: number;
  user_id: number;
  username: string;
  message: string;
  created_at: string;
}

interface ExecutionResult {
  success: boolean;
  jobId?: string;
  language?: string;
  status: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  message?: string;
}

interface RoomUser {
  socketId: string;
  userId: number;
  username: string;
}

const PRESENCE_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function getPresenceColor(userId: number) {
  return PRESENCE_COLORS[userId % PRESENCE_COLORS.length];
}

export default function CodeEditor({ roomId }: CodeEditorProps) {
  const [language, setLanguage] = useState("python");
  const [output, setOutput] = useState("");
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [status, setStatus] = useState("Loading files...");
  const [files, setFiles] = useState<RoomFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<number | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [activeDocument, setActiveDocument] = useState(() => createYjsDocument());
  const providerRef = useRef<WebsocketProvider | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const bindingRef = useRef<{ destroy: () => void } | null>(null);
  const bindingRequestRef = useRef(0);

  const { doc, text } = activeDocument;

  const attachMonacoBinding = useCallback(
    (nextProvider: WebsocketProvider) => {
      const editor = editorRef.current;
      const model = editor?.getModel();

      if (!editor || !model) {
        return;
      }

      bindingRef.current?.destroy();
      bindingRef.current = null;
      const requestId = ++bindingRequestRef.current;

      void import("y-monaco").then(({ MonacoBinding }) => {
        if (
          requestId !== bindingRequestRef.current ||
          providerRef.current !== nextProvider
        ) {
          return;
        }

        bindingRef.current = new MonacoBinding(
          text,
          model,
          new Set([editor]),
          nextProvider.awareness
        );
      });
    },
    [text]
  );

  const syncLocalCursorState = useCallback(() => {
    const provider = providerRef.current;
    const editor = editorRef.current;

    if (!provider || !editor) {
      return;
    }

    const position = editor.getPosition();
    const selection = editor.getSelection();

    provider.awareness.setLocalStateField(
      "cursor",
      position
        ? {
            lineNumber: position.lineNumber,
            column: position.column,
          }
        : null
    );

    provider.awareness.setLocalStateField(
      "selection",
      selection
        ? {
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn,
          }
        : null
    );
  }, []);

  const loadRoomFiles = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/files/room/${roomId}`,
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.message || "Failed to load room files");
        return;
      }

      const roomFiles = Array.isArray(data.files) ? data.files : [];

      if (roomFiles.length === 0) {
        const created = await createNewFile("main.py", "python", "print(\"Hello from CodeCollab!\")\n");
        if (created) {
          setFiles([created]);
          setActiveFileId(created.id);
          setStatus(`Created ${created.filename}`);
          return;
        }

        setStatus("No files found in this room yet.");
        return;
      }

      setFiles(roomFiles);
      const firstFile = roomFiles[0];
      setActiveFileId(firstFile.id);
      setLanguage(firstFile.language);
      setStatus(`Loaded ${firstFile.filename}`);
    } catch {
      setStatus("Could not load project files.");
    }
  }, [roomId]);

  const createNewFile = useCallback(
    async (filename: string, nextLanguage = "python", content = "") => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/files`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roomId: Number(roomId),
            filename,
            language: nextLanguage,
            content,
          }),
        });

        const data = (await response.json()) as {
          file?: RoomFile;
          message?: string;
        };

        if (!response.ok) {
          setStatus(
            data.message || `File creation failed (${response.status})`
          );
          return null;
        }

        const createdFile = data.file;
        if (!createdFile) {
          setStatus("The backend returned no file after creation.");
          return null;
        }

        setFiles((previousFiles) => [...previousFiles, createdFile]);
        setActiveFileId(createdFile.id);
        setLanguage(createdFile.language);
        setStatus(`Created ${createdFile.filename}`);
        return createdFile;
      } catch {
        setStatus(
          `Backend unavailable at ${API_BASE_URL}. Start the backend and try again.`
        );
        return null;
      }
    },
    [roomId]
  );

  const loadRoomMessages = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/rooms/${roomId}/messages`,
        {
          credentials: "include",
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return;
      }

      setChatMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      // Ignore chat load failures for now.
    }
  }, [roomId]);

  useEffect(() => {
    void loadRoomFiles();
    void loadRoomMessages();
  }, [loadRoomFiles, loadRoomMessages]);

  useEffect(() => {
    if (!activeFileId) {
      return;
    }

    const currentFile = files.find((file) => file.id === activeFileId);

    if (!currentFile) {
      return;
    }

    const nextDocument = createYjsDocument();
    nextDocument.text.insert(0, currentFile.content || "");
    setActiveDocument(nextDocument);
    setLanguage(currentFile.language);
  }, [activeFileId]);

  useEffect(() => {
    if (!activeFileId) {
      return;
    }

    const nextProvider = createYjsProvider(roomId, doc, activeFileId);
    const abortController = new AbortController();

    providerRef.current = nextProvider;
    attachMonacoBinding(nextProvider);

    const updateParticipants = () => {
      const nextParticipants = Array.from(
        nextProvider.awareness.getStates().entries()
      )
        .map(([clientId, state]) => {
          const user = state.user as Partial<PresenceUser> | undefined;
          const cursor = state.cursor as Partial<CursorPosition> | undefined;
          const selection = state.selection as Partial<SelectionRange> | undefined;

          if (
            !user ||
            typeof user.id !== "number" ||
            typeof user.name !== "string"
          ) {
            return null;
          }

          return {
            clientId,
            id: user.id,
            name: user.name,
            color: getPresenceColor(user.id),
            isCurrentUser: clientId === doc.clientID,
            cursor:
              cursor &&
              typeof cursor.lineNumber === "number" &&
              typeof cursor.column === "number"
                ? { lineNumber: cursor.lineNumber, column: cursor.column }
                : null,
            selection:
              selection &&
              typeof selection.startLineNumber === "number" &&
              typeof selection.startColumn === "number" &&
              typeof selection.endLineNumber === "number" &&
              typeof selection.endColumn === "number"
                ? {
                    startLineNumber: selection.startLineNumber,
                    startColumn: selection.startColumn,
                    endLineNumber: selection.endLineNumber,
                    endColumn: selection.endColumn,
                  }
                : null,
          };
        })
        .filter((participant): participant is Participant => participant !== null)
        .sort(
          (first, second) =>
            Number(second.isCurrentUser) - Number(first.isCurrentUser) ||
            first.name.localeCompare(second.name)
        );

      setParticipants(nextParticipants);
    };

    const handleStatus = (event: { status: string }) => {
      if (event.status === "connected") {
        setStatus(`Connected to ${files.find((file) => file.id === activeFileId)?.filename ?? "file"}`);
      } else {
        setStatus(`Yjs: ${event.status}`);
      }
    };

    const handleSync = (isSynced: boolean) => {
      if (!isSynced) {
        return;
      }

      setStatus(`Synced ${files.find((file) => file.id === activeFileId)?.filename ?? "file"}`);
    };

    const loadPresence = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/me`, {
          credentials: "include",
          signal: abortController.signal,
        });

        if (!response.ok) {
          setStatus("Sign in to show your presence.");
          return;
        }

        const data = (await response.json()) as { user: AuthenticatedUser };
        const user = data.user;

        nextProvider.awareness.setLocalStateField("user", {
          id: user.id,
          name: user.username,
        });
        syncLocalCursorState();
        updateParticipants();
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setStatus("Could not load your profile for presence.");
        }
      }
    };

    nextProvider.on("status", handleStatus);
    nextProvider.on("sync", handleSync);
    nextProvider.awareness.on("change", updateParticipants);
    void loadPresence();

    return () => {
      abortController.abort();
      nextProvider.awareness.setLocalState(null);
      nextProvider.off("status", handleStatus);
      nextProvider.off("sync", handleSync);
      nextProvider.awareness.off("change", updateParticipants);
      nextProvider.destroy();
      providerRef.current = null;
      bindingRequestRef.current += 1;
      bindingRef.current?.destroy();
      bindingRef.current = null;
      setParticipants([]);
    };
  }, [activeFileId, attachMonacoBinding, doc, files, roomId, syncLocalCursorState]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;

    editor.onDidChangeCursorSelection(() => {
      syncLocalCursorState();
    });

    syncLocalCursorState();

    if (providerRef.current) {
      attachMonacoBinding(providerRef.current);
    }
  };

  useEffect(() => {
    socket.connect();

    socket.emit("join_room", Number(roomId));

    const handleRoomUsers = (users: RoomUser[]) => {
      setRoomUsers(users);
    };

    const handleRoomMessage = (message: ChatMessage) => {
      setChatMessages((previousMessages) => [...previousMessages, message]);
    };

    const handleUserLeft = (user: RoomUser) => {
      setRoomUsers((previousUsers) =>
        previousUsers.filter((entry) => entry.userId !== user.userId)
      );
    };

    socket.on("room_users", handleRoomUsers);
    socket.on("room_message", handleRoomMessage);
    socket.on("user_left", handleUserLeft);

    return () => {
      socket.off("room_users", handleRoomUsers);
      socket.off("room_message", handleRoomMessage);
      socket.off("user_left", handleUserLeft);
      socket.disconnect();
    };
  }, [roomId]);

  const handleSendChatMessage = () => {
    const trimmedMessage = chatInput.trim();

    if (!trimmedMessage) {
      return;
    }

    socket.emit("send_room_message", {
      roomId: Number(roomId),
      message: trimmedMessage,
    });

    setChatInput("");
  };

  const handleRun = async () => {
    setOutput("Queueing execution...");
    setExecutionResult(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/execute`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId: Number(roomId),
          fileId: activeFileId,
          code: text.toString(),
          language,
        }),
      });

      const data = (await response.json()) as ExecutionResult;
      setExecutionResult(data);

      if (!response.ok) {
        setOutput("");
        return;
      }

      setOutput(data.stdout || "");
    } catch {
      setOutput("Could not connect to backend.");
      setExecutionResult({
        success: false,
        status: "system_error",
        message: "Could not connect to the execution service.",
      });
    }
  };

  const handleSave = async () => {
    if (!activeFileId) {
      setStatus("Select a file to save.");
      return;
    }

    setStatus("Saving...");

    try {
      const currentFile = files.find((file) => file.id === activeFileId);
      if (!currentFile) {
        setStatus("File not found.");
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/files/${activeFileId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: currentFile.filename,
          language,
          content: text.toString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.message || "Failed to save");
        return;
      }

      setFiles((previousFiles) =>
        previousFiles.map((file) =>
          file.id === activeFileId
            ? { ...file, content: text.toString(), language }
            : file
        )
      );

      setStatus(`Saved ${currentFile.filename}`);
    } catch {
      setStatus("Could not connect to backend.");
    }
  };

  const handleRename = async () => {
    if (!activeFileId) {
      return;
    }

    const currentFile = files.find((file) => file.id === activeFileId);
    if (!currentFile) {
      return;
    }

    const nextName = window.prompt("Rename file:", currentFile.filename);
    if (!nextName || !nextName.trim()) {
      return;
    }

    const safeName = nextName.trim();

    try {
      const response = await fetch(`${API_BASE_URL}/api/files/${activeFileId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: safeName,
          language,
          content: text.toString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.message || "Failed to rename");
        return;
      }

      setFiles((previousFiles) =>
        previousFiles.map((file) =>
          file.id === activeFileId ? { ...file, filename: safeName } : file
        )
      );

      setStatus(`Renamed to ${safeName}`);
    } catch {
      setStatus("Could not rename file.");
    }
  };

  const handleDelete = async () => {
    if (!activeFileId) {
      return;
    }

    const currentFile = files.find((file) => file.id === activeFileId);
    if (!currentFile) {
      return;
    }

    const confirmed = window.confirm(`Delete ${currentFile.filename}?`);
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/files/${activeFileId}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.message || "Failed to delete file");
        return;
      }

      const remainingFiles = files.filter((file) => file.id !== activeFileId);
      setFiles(remainingFiles);

      if (remainingFiles.length === 0) {
        setActiveFileId(null);
        setStatus("No files left in this room.");
        return;
      }

      const nextFile = remainingFiles[0];
      setActiveFileId(nextFile.id);
      setStatus(`Deleted ${currentFile.filename}`);
    } catch {
      setStatus("Could not delete file.");
    }
  };

  const handleLoad = async () => {
    await loadRoomFiles();
  };

  return (
    <div style={{ padding: "20px" }}>
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "12px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => {
            const newName = `file-${files.length + 1}.py`;
            void createNewFile(newName, language || "python", "");
          }}
        >
          + New File
        </button>

        <button onClick={handleRename}>Rename</button>
        <button onClick={handleDelete}>Delete</button>
        <button onClick={handleLoad}>Refresh Files</button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px minmax(0, 1fr)",
          gap: "20px",
          alignItems: "start",
        }}
      >
        <aside
          style={{
            background: "#111827",
            color: "#f9fafb",
            border: "1px solid #374151",
            borderRadius: "10px",
            padding: "12px",
            minHeight: "220px",
          }}
        >
          <strong>Project Files</strong>
          <div style={{ marginTop: "12px", display: "grid", gap: "8px" }}>
            {files.length === 0 ? (
              <span>No files yet</span>
            ) : (
              files.map((file) => (
                <button
                  key={file.id}
                  onClick={() => setActiveFileId(file.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    border: file.id === activeFileId ? "1px solid #60a5fa" : "1px solid #374151",
                    background: file.id === activeFileId ? "#1d4ed8" : "#1f2937",
                    color: "#f9fafb",
                    cursor: "pointer",
                  }}
                >
                  {file.filename}
                </button>
              ))
            )}
          </div>

          <div
            style={{
              marginTop: "20px",
              paddingTop: "12px",
              borderTop: "1px solid #374151",
            }}
          >
            <strong>Online Users</strong>
            <div style={{ marginTop: "10px", display: "grid", gap: "6px" }}>
              {roomUsers.length === 0 ? (
                <span>Waiting for users...</span>
              ) : (
                roomUsers.map((user) => (
                  <div
                    key={user.socketId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#22c55e",
                        display: "inline-block",
                      }}
                    />
                    <span>{user.username}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div
            style={{
              marginTop: "20px",
              paddingTop: "12px",
              borderTop: "1px solid #374151",
            }}
          >
            <strong>Room Chat</strong>
            <div
              style={{
                marginTop: "10px",
                display: "grid",
                gap: "8px",
                maxHeight: "220px",
                overflowY: "auto",
              }}
            >
              {chatMessages.length === 0 ? (
                <span>No messages yet.</span>
              ) : (
                chatMessages.map((message) => (
                  <div key={message.id}>
                    <strong>{message.username}</strong>
                    <div style={{ color: "#d1d5db" }}>{message.message}</div>
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSendChatMessage();
                  }
                }}
                placeholder="Type a message..."
                style={{
                  padding: "8px",
                  borderRadius: "6px",
                  border: "1px solid #374151",
                  background: "#0f172a",
                  color: "#f9fafb",
                }}
              />
              <button onClick={handleSendChatMessage}>Send</button>
            </div>
          </div>
        </aside>

        <div>
          <div
            style={{
              display: "flex",
              gap: "10px",
              marginBottom: "10px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="cpp">C++</option>
            </select>

            <button onClick={handleRun}>Run</button>
            <button onClick={handleSave}>Save</button>
          </div>

          <p>
            Room: {roomId} | Active file: {files.find((file) => file.id === activeFileId)?.filename ?? "None"}
          </p>
          <p>{status}</p>

          <section
            aria-label="Room presence"
            style={{
              marginBottom: "12px",
              padding: "12px",
              border: "1px solid #374151",
              borderRadius: "8px",
              background: "#111827",
              color: "#f9fafb",
            }}
          >
            <strong>Online in this room ({participants.length})</strong>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                marginTop: "8px",
              }}
            >
              {participants.length === 0 ? (
                <span>Loading presence...</span>
              ) : (
                participants.map((participant) => (
                  <span
                    key={participant.clientId}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 8px",
                      borderRadius: "999px",
                      background: "#1f2937",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: "9px",
                        height: "9px",
                        borderRadius: "50%",
                        background: participant.color,
                      }}
                    />
                    {participant.name}
                    {participant.isCurrentUser ? " (you)" : ""}
                    {participant.cursor ? (
                      <span style={{ fontSize: "11px", opacity: 0.8 }}>
                        L{participant.cursor.lineNumber}:C{participant.cursor.column}
                      </span>
                    ) : (
                      <span style={{ fontSize: "11px", opacity: 0.7 }}>idle</span>
                    )}
                  </span>
                ))
              )}
            </div>
          </section>

          <style>
            {participants
              .filter((participant) => !participant.isCurrentUser)
              .map(
                (participant) => `
                  .yRemoteSelection-${participant.clientId} {
                    background-color: ${participant.color}44;
                  }

                  .yRemoteSelectionHead-${participant.clientId} {
                    border-left: 2px solid ${participant.color};
                  }
                `
              )
              .join("\n")}
          </style>

          {activeFileId ? (
            <Editor
              key={activeFileId}
              height="500px"
              language={language}
              theme="vs-dark"
              onMount={handleEditorMount}
            />
          ) : (
            <div
              style={{
                height: "500px",
                display: "grid",
                placeItems: "center",
                border: "1px solid #374151",
                borderRadius: "10px",
                color: "#9ca3af",
              }}
            >
              Create or select a file to begin editing.
            </div>
          )}

          <div
            style={{
              marginTop: "15px",
              padding: "15px",
              background: "#1e1e1e",
              color: "white",
              minHeight: "100px",
            }}
          >
            <strong>OUTPUT</strong>
            {executionResult ? (
              <div style={{ marginTop: "10px" }}>
                <div>
                  Status: <strong>{executionResult.status}</strong>
                  {executionResult.durationMs !== undefined
                    ? ` (${executionResult.durationMs} ms)`
                    : ""}
                </div>
                <pre>{executionResult.stdout || output || "No output"}</pre>
                {executionResult.stderr ? (
                  <>
                    <strong>ERROR</strong>
                    <pre style={{ color: "#fca5a5" }}>{executionResult.stderr}</pre>
                  </>
                ) : null}
                {executionResult.message && !executionResult.stderr ? (
                  <pre style={{ color: "#fca5a5" }}>{executionResult.message}</pre>
                ) : null}
              </div>
            ) : (
              <pre>{output || "Output will appear here..."}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
