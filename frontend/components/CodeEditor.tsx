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
  activeFileName: string;
}

interface ChatMessage {
  id: number;
  room_id: number;
  user_id: number;
  username: string;
  message: string;
  created_at: string;
}

interface FileVersion {
  id: number;
  versionNumber: number;
  filename: string;
  language: string;
  content: string;
  summary: string;
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
  const [openFileIds, setOpenFileIds] = useState<number[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [roomUsers, setRoomUsers] = useState<RoomUser[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [versionHistory, setVersionHistory] = useState<FileVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiResponse, setAiResponse] = useState<string>("");
  const [generatedPreview, setGeneratedPreview] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [projectMatches, setProjectMatches] = useState<string[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [yjsToken, setYjsToken] = useState<string | null>(null);
  const [activeDocument, setActiveDocument] = useState(() => createYjsDocument());
  const providerRef = useRef<WebsocketProvider | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const bindingRef = useRef<{ destroy: () => void } | null>(null);
  const bindingsRef = useRef(new Map<WebsocketProvider, { destroy: () => void }>());
  const bindingRequestRef = useRef(0);
  const documentsRef = useRef<Record<number, ReturnType<typeof createYjsDocument>>>({});
  const filesRef = useRef(files);
  filesRef.current = files;

  const { doc, text } = activeDocument;

  const attachMonacoBinding = useCallback(
    (nextProvider: WebsocketProvider) => {
      const editor = editorRef.current;
      const model = editor?.getModel();

      if (!editor || !model) {
        return;
      }

      if (bindingRef.current) {
        const previousBinding = bindingRef.current;
        previousBinding.destroy();
        bindingsRef.current.forEach((binding, provider) => {
          if (binding === previousBinding) {
            bindingsRef.current.delete(provider);
          }
        });
        bindingRef.current = null;
      }
      const requestId = ++bindingRequestRef.current;

      void import("y-monaco").then(({ MonacoBinding }) => {
        if (
          requestId !== bindingRequestRef.current ||
          providerRef.current !== nextProvider
        ) {
          return;
        }

        const binding = new MonacoBinding(
          text,
          model,
          new Set([editor]),
          nextProvider.awareness
        );
        bindingsRef.current.set(nextProvider, binding);
        bindingRef.current = binding;
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

  const loadVersionHistory = useCallback(async (fileId: number | null) => {
    if (!fileId) {
      setVersionHistory([]);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/files/${fileId}/versions`, {
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        setVersionHistory([]);
        return;
      }

      setVersionHistory(Array.isArray(data.versions) ? data.versions : []);
    } catch {
      setVersionHistory([]);
    }
  }, []);

  const openFile = useCallback((fileId: number, fileContent = "") => {
    if (!documentsRef.current[fileId]) {
      const nextDocument = createYjsDocument();
      nextDocument.text.insert(0, fileContent || "");
      documentsRef.current[fileId] = nextDocument;
    }

    setOpenFileIds((previousFiles) =>
      previousFiles.includes(fileId) ? previousFiles : [...previousFiles, fileId]
    );
    setActiveFileId(fileId);
    setActiveDocument(documentsRef.current[fileId]);
  }, []);

  useEffect(() => {
    void loadRoomFiles();
    void loadRoomMessages();
  }, [loadRoomFiles, loadRoomMessages]);

  useEffect(() => {
    const abortController = new AbortController();
    setYjsToken(null);

    const refreshYjsToken = async () => {
      const response = await fetch(`${API_BASE_URL}/api/yjs/token`, {
        credentials: "include",
        signal: abortController.signal,
      });
      const data = (await response.json()) as { token?: string; message?: string };
      if (!response.ok || !data.token) {
        throw new Error(data.message || "Could not authenticate Yjs");
      }

      if (providerRef.current) {
        (providerRef.current as WebsocketProvider & { params: Record<string, string> }).params.token = data.token;
      }
      setYjsToken((currentToken) => currentToken || data.token || null);
    };

    void refreshYjsToken().catch((error) => {
      if (error.name !== "AbortError") {
        setStatus("Could not authenticate Yjs.");
      }
    });

    const refreshInterval = window.setInterval(() => {
      void refreshYjsToken().catch((error) => {
        if (error.name !== "AbortError") {
          setStatus("Could not refresh Yjs authentication.");
        }
      });
    }, 60_000);

    return () => {
      window.clearInterval(refreshInterval);
      abortController.abort();
    };
  }, [roomId]);

  useEffect(() => {
    void loadVersionHistory(activeFileId);
  }, [activeFileId, loadVersionHistory]);

  useEffect(() => {
    if (!activeFileId) {
      return;
    }

    const currentFile = files.find((file) => file.id === activeFileId);

    if (!currentFile) {
      return;
    }

    const nextDocument = documentsRef.current[activeFileId] ?? createYjsDocument();
    if (!documentsRef.current[activeFileId]) {
      nextDocument.text.insert(0, currentFile.content || "");
      documentsRef.current[activeFileId] = nextDocument;
    }

    setActiveDocument(nextDocument);
    setLanguage(currentFile.language);
  }, [activeFileId, files]);

  useEffect(() => {
    if (!activeFileId || !yjsToken) {
      return;
    }

    const nextProvider = createYjsProvider(roomId, doc, activeFileId, yjsToken);
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
          const activeFileIdInAwareness = state.activeFileId as number | undefined;

          if (
            !user ||
            typeof user.id !== "number" ||
            typeof user.name !== "string"
          ) {
            return null;
          }

          const activeFile = filesRef.current.find((file) => file.id === activeFileIdInAwareness);

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
            activeFileName: activeFile?.filename ?? "idle",
          };
        })
        .filter((participant): participant is Participant => participant !== null)
        .sort((first, second) => {
          if (!first || !second) {
            return 0;
          }

          return (
            Number(second.isCurrentUser) - Number(first.isCurrentUser) ||
            first.name.localeCompare(second.name)
          );
        });

      setParticipants(nextParticipants);
    };

    const handleStatus = (event: { status: string }) => {
      if (event.status === "connected") {
        setStatus(`Connected to ${filesRef.current.find((file) => file.id === activeFileId)?.filename ?? "file"}`);
      } else {
        setStatus(`Yjs: ${event.status}`);
      }
    };

    const handleSync = (isSynced: boolean) => {
      if (!isSynced) {
        return;
      }

      setStatus(`Synced ${filesRef.current.find((file) => file.id === activeFileId)?.filename ?? "file"}`);
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
        nextProvider.awareness.setLocalStateField("activeFileId", activeFileId);
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
      const binding = bindingsRef.current.get(nextProvider);
      if (binding) {
        binding.destroy();
        bindingsRef.current.delete(nextProvider);
        if (bindingRef.current === binding) {
          bindingRef.current = null;
        }
      }
      nextProvider.awareness.setLocalState(null);
      nextProvider.off("status", handleStatus);
      nextProvider.off("sync", handleSync);
      nextProvider.awareness.off("change", updateParticipants);
      bindingRequestRef.current += 1;
      nextProvider.destroy();
      if (providerRef.current === nextProvider) {
        providerRef.current = null;
      }
      setParticipants([]);
    };
  }, [activeFileId, attachMonacoBinding, doc, roomId, syncLocalCursorState, yjsToken]);

  useEffect(() => {
    if (!activeFileId || !activeDocument) {
      return;
    }

    const currentFile = files.find((file) => file.id === activeFileId);
    const content = activeDocument.text.toString();

    if (!currentFile || content === currentFile.content) {
      return;
    }

    const timer = setTimeout(() => {
      void handleSave({ silent: true, contentOverride: content, languageOverride: language });
    }, 900);

    return () => clearTimeout(timer);
  }, [activeDocument, activeFileId, files, language]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;

    editor.onDidChangeCursorSelection(() => {
      syncLocalCursorState();
      const selection = editor.getSelection();
      if (!selection) {
        setSelectedCode("");
        return;
      }

      const selected = editor.getModel()?.getValueInRange(selection) ?? "";
      setSelectedCode(selected);
    });

    syncLocalCursorState();

    if (providerRef.current) {
      attachMonacoBinding(providerRef.current);
    }
  };

  useEffect(() => {
    const handleRoomUsers = (users: RoomUser[]) => {
      setRoomUsers(users);
    };

    const handleConnect = () => {
      socket.emit("join_room", Number(roomId));
    };

    const handleRoomMessage = (message: ChatMessage) => {
      setChatMessages((previousMessages) => [...previousMessages, message]);
    };

    const handleUserTyping = ({ username, isTyping }: { username: string; isTyping: boolean }) => {
      setTypingUsers((previousUsers) => {
        const nextUsers = previousUsers.filter((user) => user !== username);
        return isTyping ? [...nextUsers, username] : nextUsers;
      });
    };

    const handleUserLeft = (user: RoomUser) => {
      setRoomUsers((previousUsers) =>
        previousUsers.filter((entry) => entry.userId !== user.userId)
      );
    };

    socket.on("connect", handleConnect);
    socket.on("room_users", handleRoomUsers);
    socket.on("room_message", handleRoomMessage);
    socket.on("user_typing", handleUserTyping);
    socket.on("user_left", handleUserLeft);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      socket.emit("leave_room", Number(roomId));
      socket.off("connect", handleConnect);
      socket.off("room_users", handleRoomUsers);
      socket.off("room_message", handleRoomMessage);
      socket.off("user_typing", handleUserTyping);
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

    socket.emit("typing_status", {
      roomId: Number(roomId),
      isTyping: false,
    });

    setChatInput("");
    setTypingUsers([]);
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("Room link copied to clipboard.");
    } catch {
      setStatus("Could not copy the room link automatically.");
    }
  };

  const extractCodeBlock = (value: string) => {
    const match = value.match(/```(?:[A-Za-z0-9_-]+)?\n([\s\S]*?)```/);
    return match?.[1]?.trim() || null;
  };

  const applyGeneratedCode = (value: string) => {
    const editor = editorRef.current;
    const model = editor?.getModel();

    if (!editor || !model) {
      return;
    }

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return;
    }

    const selection = editor.getSelection() ?? model.getFullModelRange();
    const patch = trimmedValue.endsWith("\n") ? trimmedValue : `${trimmedValue}\n`;

    editor.executeEdits("ai-insert", [
      {
        range: selection,
        text: patch,
        forceMoveMarkers: true,
      },
    ]);
    editor.focus();
  };

  const handleAskAi = async (promptOverride?: string, options?: { autoInsert?: boolean; previewOnly?: boolean }) => {
    const prompt = (promptOverride ?? aiInput).trim();
    if (!prompt) {
      return;
    }

    const currentFile = files.find((file) => file.id === activeFileId)?.filename ?? "untitled";

    setAiLoading(true);
    setAiResponse("Thinking...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/ai`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          currentFile,
          selectedCode: selectedCode || text.toString(),
          language,
          projectFiles: files.map((file) => ({
            filename: file.filename,
            language: file.language,
            content: file.content,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setAiResponse(data.message || "AI request failed.");
        setGeneratedPreview("");
        return;
      }

      const reply = data.reply || "AI did not return a response.";
      const extractedCode = extractCodeBlock(reply);
      const nextPreview = extractedCode || reply;

      setAiResponse(reply);
      setGeneratedPreview(options?.previewOnly || !options?.autoInsert ? nextPreview : "");

      if (options?.autoInsert && extractedCode) {
        applyGeneratedCode(extractedCode);
      }

      if (!promptOverride) {
        setAiInput("");
      }
    } catch {
      setAiResponse("Could not reach the AI backend.");
      setGeneratedPreview("");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAskProject = async () => {
    const question = aiInput.trim();
    if (!question) {
      return;
    }

    setAiLoading(true);
    setAiResponse("Searching the project...");
    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/project`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: Number(roomId),
          question,
          projectFiles: files.map((file) => ({
            filename: file.filename,
            language: file.language,
            content: file.content,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setAiResponse(data.message || "Project search failed.");
        return;
      }
      setAiResponse(data.reply || "No project answer returned.");
      setProjectMatches((data.matches || []).map((match: { filename: string }) => match.filename));
      setAiInput("");
    } catch {
      setAiResponse("Could not reach the project assistant.");
    } finally {
      setAiLoading(false);
    }
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

  const handleSave = async (options?: {
    silent?: boolean;
    contentOverride?: string;
    languageOverride?: string;
  }) => {
    if (!activeFileId) {
      setStatus("Select a file to save.");
      return;
    }

    const currentFile = files.find((file) => file.id === activeFileId);
    if (!currentFile) {
      setStatus("File not found.");
      return;
    }

    const contentToSave = options?.contentOverride ?? text.toString();
    const languageToSave = options?.languageOverride ?? language;

    if (!options?.silent) {
      setStatus("Saving...");
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/files/${activeFileId}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: currentFile.filename,
          language: languageToSave,
          content: contentToSave,
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
            ? { ...file, content: contentToSave, language: languageToSave }
            : file
        )
      );

      if (!options?.silent) {
        setStatus(`Saved ${currentFile.filename}`);
      }
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

  const handleRestoreVersion = async (version: FileVersion) => {
    if (!activeFileId) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/files/${activeFileId}/restore`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ versionNumber: version.versionNumber }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.message || "Failed to restore version");
        return;
      }

      const restoredContent = data.file?.content ?? version.content;
      const restoredLanguage = data.file?.language ?? version.language;
      const restoredFilename = data.file?.filename ?? version.filename;

      setFiles((previousFiles) =>
        previousFiles.map((file) =>
          file.id === activeFileId
            ? {
                ...file,
                content: restoredContent,
                language: restoredLanguage,
                filename: restoredFilename,
              }
            : file
        )
      );

      const nextDocument = documentsRef.current[activeFileId] ?? createYjsDocument();
      nextDocument.text.delete(0, nextDocument.text.length);
      nextDocument.text.insert(0, restoredContent);
      documentsRef.current[activeFileId] = nextDocument;
      setActiveDocument(nextDocument);
      setLanguage(restoredLanguage);
      setStatus(`Restored ${restoredFilename} to Version ${version.versionNumber}`);
      void loadVersionHistory(activeFileId);
    } catch {
      setStatus("Could not restore this version.");
    }
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
        <button onClick={() => setShowHistory((previous) => !previous)}>
          {showHistory ? "Hide History" : "Version History"}
        </button>
        <button onClick={handleCopyShareLink}>Share Room</button>
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
                  onClick={() => {
                    const content = documentsRef.current[file.id]?.text.toString() ?? file.content ?? "";
                    openFile(file.id, content);
                  }}
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

            {typingUsers.length > 0 ? (
              <div style={{ marginTop: "8px", color: "#93c5fd" }}>
                {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
              </div>
            ) : null}

            <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
              <input
                value={chatInput}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setChatInput(nextValue);
                  socket.emit("typing_status", {
                    roomId: Number(roomId),
                    isTyping: nextValue.trim().length > 0,
                  });
                }}
                onBlur={() => {
                  socket.emit("typing_status", {
                    roomId: Number(roomId),
                    isTyping: false,
                  });
                }}
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
            <button onClick={() => void handleSave()}>Save</button>
            <button onClick={() => void handleAskAi("Explain this code", { previewOnly: true })}>Explain</button>
            <button onClick={() => void handleAskAi("Fix this code", { previewOnly: true })}>Fix</button>
            <button onClick={() => void handleAskAi(`Generate ${language} code for a useful helper function`, { previewOnly: true })}>Generate</button>
            <button onClick={() => void handleAskAi(`Review this ${language} code for bugs and quality issues`, { previewOnly: true })}>Review</button>
            <button onClick={() => void handleAskAi(`Write tests for this ${language} code`, { previewOnly: true })}>Tests</button>
            <button onClick={() => void handleAskAi(`Add docstrings and comments for this ${language} code`, { previewOnly: true })}>Doc</button>
            <button onClick={() => void handleAskProject()}>Ask project</button>
          </div>

          {showHistory && activeFileId ? (
            <div
              style={{
                marginBottom: "12px",
                padding: "12px",
                border: "1px solid #374151",
                borderRadius: "10px",
                background: "#111827",
                color: "#f9fafb",
              }}
            >
              <strong>Version History</strong>
              {versionHistory.length === 0 ? (
                <div style={{ marginTop: "8px", color: "#9ca3af" }}>No saved versions for this file yet.</div>
              ) : (
                <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
                  {versionHistory.map((version) => (
                    <div
                      key={version.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "10px",
                        alignItems: "center",
                        padding: "8px 10px",
                        borderRadius: "8px",
                        background: "#1f2937",
                      }}
                    >
                      <div>
                        <strong>Version {version.versionNumber}</strong>
                        <div style={{ color: "#cbd5e1", fontSize: "12px" }}>{version.summary}</div>
                      </div>
                      <button onClick={() => void handleRestoreVersion(version)}>Restore</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
            {openFileIds.length === 0 ? (
              <span>No open tabs</span>
            ) : (
              openFileIds.map((fileId) => {
                const file = files.find((entry) => entry.id === fileId);
                if (!file) {
                  return null;
                }

                const isActive = fileId === activeFileId;

                return (
                  <button
                    key={file.id}
                    onClick={() => {
                      const content = documentsRef.current[file.id]?.text.toString() ?? file.content ?? "";
                      openFile(file.id, content);
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: isActive ? "1px solid #60a5fa" : "1px solid #374151",
                      background: isActive ? "#1d4ed8" : "#1f2937",
                      color: "#f9fafb",
                      cursor: "pointer",
                    }}
                  >
                    {file.filename}
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenFileIds((previousFiles) => {
                          const nextFiles = previousFiles.filter((id) => id !== file.id);
                          if (activeFileId === file.id && nextFiles.length > 0) {
                            setActiveFileId(nextFiles[0]);
                            const nextDocument = documentsRef.current[nextFiles[0]] ?? createYjsDocument();
                            if (!documentsRef.current[nextFiles[0]]) {
                              nextDocument.text.insert(0, files.find((entry) => entry.id === nextFiles[0])?.content ?? "");
                              documentsRef.current[nextFiles[0]] = nextDocument;
                            }
                            setActiveDocument(nextDocument);
                          } else if (activeFileId === file.id) {
                            setActiveFileId(null);
                          }
                          return nextFiles;
                        });
                      }}
                      style={{ marginLeft: "8px", opacity: 0.8 }}
                    >
                      ×
                    </span>
                  </button>
                );
              })
            )}
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
                    {participant.activeFileName ? (
                      <span style={{ fontSize: "11px", opacity: 0.8 }}>• {participant.activeFileName}</span>
                    ) : null}
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
              background: "#111827",
              color: "white",
              border: "1px solid #374151",
              borderRadius: "10px",
            }}
          >
            <strong>AI Assistant</strong>
            <div style={{ marginTop: "10px", padding: "10px", background: "#1f2937", borderRadius: "8px", whiteSpace: "pre-wrap" }}>
              {aiResponse || "Ask for an explanation, fix, optimization, or code generation."}
            </div>

            {projectMatches.length > 0 ? (
              <div style={{ marginTop: "8px", color: "#93c5fd" }}>
                Relevant files: {projectMatches.join(", ")}
              </div>
            ) : null}

            {generatedPreview ? (
              <div style={{ marginTop: "10px", padding: "10px", borderRadius: "8px", background: "#0f172a", border: "1px solid #374151" }}>
                <div style={{ marginBottom: "8px", color: "#cbd5e1", fontWeight: 600 }}>Generated preview</div>
                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{generatedPreview}</pre>
                <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
                  <button onClick={() => applyGeneratedCode(generatedPreview)}>Insert into editor</button>
                  <button onClick={() => setGeneratedPreview("")}>Clear preview</button>
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              <input
                value={aiInput}
                onChange={(event) => setAiInput(event.target.value)}
                placeholder="Ask AI..."
                style={{
                  flex: 1,
                  padding: "8px",
                  borderRadius: "6px",
                  border: "1px solid #374151",
                  background: "#0f172a",
                  color: "#f9fafb",
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleAskAi();
                  }
                }}
              />
              <button onClick={() => void handleAskAi()} disabled={aiLoading}>
                {aiLoading ? "Working..." : "Send"}
              </button>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
              <button onClick={() => void handleAskAi("Explain this code", { previewOnly: true })}>Explain</button>
              <button onClick={() => void handleAskAi("Fix this code", { previewOnly: true })}>Fix</button>
              <button onClick={() => void handleAskAi(`Generate ${language} code for a useful helper function`, { previewOnly: true })}>Generate</button>
              <button onClick={() => void handleAskAi(`Review this ${language} code for bugs and quality issues`, { previewOnly: true })}>Review</button>
              <button onClick={() => void handleAskAi(`Write tests for this ${language} code`, { previewOnly: true })}>Tests</button>
              <button onClick={() => void handleAskAi(`Add docstrings and comments for this ${language} code`, { previewOnly: true })}>Doc</button>
            </div>
          </div>

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
