"use client";

import { useState } from "react";
import Editor from "@monaco-editor/react";

export default function CodeEditor() {
  const [code, setCode] = useState('print("Hello World")');
  const [language, setLanguage] = useState("python");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");

  const handleRun = async () => {
    setOutput("Sending code to backend...");

    try {
      const response = await fetch("http://localhost:5000/api/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          language,
        }),
      });

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

  const handleSave = async () => {
    setStatus("Saving...");

    try {
      const response = await fetch("http://localhost:5000/api/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId: 1,
          filename: "main.py",
          language,
          content: code,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.message || "Failed to save");
        return;
      }

      setStatus(`Saved successfully! File ID: ${data.file.id}`);
    } catch {
      setStatus("Could not connect to backend.");
    }
  };

  const handleLoad = async () => {
    setStatus("Loading...");

    try {
      const response = await fetch("http://localhost:5000/api/files/1");

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.message || "Failed to load");
        return;
      }

      setCode(data.file.content);
      setLanguage(data.file.language);
      setStatus("File loaded successfully!");
    } catch {
      setStatus("Could not connect to backend.");
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      {/* Toolbar */}
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

        <button onClick={handleRun}>Run</button>

        <button onClick={handleSave}>Save</button>

        <button onClick={handleLoad}>Load</button>
      </div>

      {/* Status */}
      <p>{status}</p>

      {/* Editor */}
      <Editor
        height="500px"
        language={language}
        value={code}
        onChange={(value) => setCode(value || "")}
        theme="vs-dark"
      />

      {/* Output */}
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

        <pre>{output || "Output will appear here..."}</pre>
      </div>
    </div>
  );
}