"use client";

import { useEffect, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { createYjsDocument } from "@/lib/yjs";
import { createYjsProvider } from "@/lib/yjsProvider";

interface CodeEditorProps {
  roomId: string;
}

export default function CodeEditor({ roomId }: CodeEditorProps) {
  const [language, setLanguage] = useState("python");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("Connecting...");
  const [fileId, setFileId] = useState<number | null>(null);

  const [yjs] = useState(() => createYjsDocument());

  const { doc, text } = yjs;

  // --------------------------------------------------
  // Yjs provider + PostgreSQL loading unified logic
  // --------------------------------------------------

  useEffect(() => {
    const provider = createYjsProvider(roomId, doc);

    const handleStatus = (event: { status: string }) => {
      console.log("Yjs connection:", event.status);

      if (event.status === "connected") {
        setStatus(`Connected to room ${roomId}`);
      } else {
        setStatus(`Yjs: ${event.status}`);
      }
    };

    const handleSynced = async () => {
      console.log("Yjs document synchronized");

      try {
        setStatus("Loading saved file...");

        const response = await fetch(
          `http://localhost:5000/api/files/room/${roomId}`
        );

        const data = await response.json();

        if (!response.ok) {
          setStatus(data.message || "Failed to load room file");
          return;
        }

        const file = data.files[0];

        if (!file) {
          setFileId(null);
          setStatus(`New room ${roomId}`);
          return;
        }

        setFileId(file.id);
        setLanguage(file.language);

        // Only initialize Yjs from PostgreSQL
        // if Yjs does not already contain code.
        if (text.length === 0 && file.content) {
          text.insert(0, file.content);
        }

        setStatus(`Loaded ${file.filename}`);
      } catch (error) {
        console.error(error);
        setStatus("Could not connect to backend.");
      }
    };

    provider.on("status", handleStatus);
    provider.on("synced", handleSynced);

    return () => {
      provider.off("status", handleStatus);
      provider.off("synced", handleSynced);

      provider.destroy();
      doc.destroy();
    };
  }, [roomId, doc, text]);

  // --------------------------------------------------
  // Monaco ↔ Yjs (Dynamic Import)
  // --------------------------------------------------

  const handleEditorMount: OnMount = async (editor) => {
    const { MonacoBinding } = await import("y-monaco");

    const model = editor.getModel();

    if (!model) return;

    new MonacoBinding(
      text,
      model,
      new Set([editor])
    );

    console.log("Monaco connected to Yjs");
  };

  // --------------------------------------------------
  // Run
  // --------------------------------------------------

  const handleRun = async () => {
    setOutput("Sending code to backend...");

    try {
      const response = await fetch(
        "http://localhost:5000/api/execute",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            code: text.toString(),
            language,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setOutput(data.message || "Something went wrong");
        return;
      }

      setOutput(
        `Backend received:\n\nLanguage: ${data.language}\nCode:\n${data.code}`
      );
    } catch {
      setOutput("Could not connect to backend.");
    }
  };

  // --------------------------------------------------
  // Save
  // --------------------------------------------------

  const handleSave = async () => {
    setStatus("Saving...");

    try {
      const method = fileId ? "PUT" : "POST";

      const url = fileId
        ? `http://localhost:5000/api/files/${fileId}`
        : "http://localhost:5000/api/files";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId: Number(roomId),
          filename: "main.py",
          language,
          content: text.toString(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.message || "Failed to save");
        return;
      }

      setFileId(data.file.id);

      setStatus(
        `Saved successfully! File ID: ${data.file.id}`
      );
    } catch {
      setStatus("Could not connect to backend.");
    }
  };

  // --------------------------------------------------
  // Manual Load button
  // --------------------------------------------------

  const handleLoad = async () => {
    setStatus("Loading...");

    try {
      const response = await fetch(
        `http://localhost:5000/api/files/room/${roomId}`
      );

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.message || "Failed to load");
        return;
      }

      const file = data.files[0];

      if (!file) {
        setStatus("No saved file found for this room.");
        return;
      }

      setFileId(file.id);
      setLanguage(file.language);

      text.delete(0, text.length);
      text.insert(0, file.content || "");

      setStatus(`Loaded ${file.filename}`);
    } catch {
      setStatus("Could not connect to backend.");
    }
  };

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <div style={{ padding: "20px" }}>
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "10px",
          alignItems: "center",
        }}
      >
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="python">Python</option>
          <option value="javascript">JavaScript</option>
          <option value="cpp">C++</option>
        </select>

        <button onClick={handleRun}>
          Run
        </button>

        <button onClick={handleSave}>
          Save
        </button>

        <button onClick={handleLoad}>
          Load
        </button>
      </div>

      <p>
        Room: {roomId} | File ID: {fileId ?? "New"}
      </p>

      <p>{status}</p>

      <Editor
        height="500px"
        language={language}
        theme="vs-dark"
        onMount={handleEditorMount}
      />

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

        <pre>
          {output || "Output will appear here..."}
        </pre>
      </div>
    </div>
  );
}
