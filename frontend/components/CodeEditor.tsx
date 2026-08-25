"use client";

import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { socket } from "@/lib/socket";

export default function CodeEditor() {
  const [code, setCode] = useState('print("Hello World")');
  const [language, setLanguage] = useState("python");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("");
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  // =========================
  // WEBSOCKET CONNECTION
  // =========================

  useEffect(() => {
    socket.connect();

    socket.on("connect", () => {
      console.log("Connected to WebSocket:", socket.id);

      setStatus("Connected to server");

      // Join room 1
      socket.emit("join_room", 1);
    });

    socket.on("room_joined", (data) => {
      console.log("Joined room:", data.roomId);
    });

    socket.on("user_joined", (data) => {
      console.log("User joined:", data.socketId);

      setOnlineUsers((users) => {
        if (users.includes(data.socketId)) {
          return users;
        }

        return [...users, data.socketId];
      });
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from WebSocket");

      setStatus("Disconnected from server");
    });

    // Receive code changes from another user
    socket.on("code_change", (data) => {
      setCode(data.code);

      if (data.language) {
        setLanguage(data.language);
      }
    });

    return () => {
      socket.off("connect");
      socket.off("room_joined");
      socket.off("user_joined");
      socket.off("disconnect");
      socket.off("code_change");

      socket.disconnect();
    };
  }, []);

  // =========================
  // CODE CHANGE
  // =========================

  const handleCodeChange = (value: string | undefined) => {
    const newCode = value || "";

    // Update local editor
    setCode(newCode);

    // Send change to server
    if (socket.connected) {
      socket.emit("code_change", {
        roomId: 1,
        code: newCode,
        language: language,
      });
    }
  };

  // =========================
  // RUN CODE
  // =========================

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
            code,
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

  // =========================
  // SAVE FILE
  // =========================

  const handleSave = async () => {
    setStatus("Saving...");

    try {
      const response = await fetch(
        "http://localhost:5000/api/files",
        {
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
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.message || "Failed to save");
        return;
      }

      setStatus(
        `Saved successfully! File ID: ${data.file.id}`
      );
    } catch {
      setStatus("Could not connect to backend.");
    }
  };

  // =========================
  // LOAD FILE
  // =========================

  const handleLoad = async () => {
    setStatus("Loading...");

    try {
      const response = await fetch(
        "http://localhost:5000/api/files/1"
      );

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

  // =========================
  // UI
  // =========================

  return (
    <div style={{ padding: "20px" }}>
      {/* Online Users */}

      <div style={{ marginBottom: "10px" }}>
        <strong>Online Users:</strong>

        {onlineUsers.length === 0 ? (
          <span style={{ marginLeft: "10px" }}>
            No other users
          </span>
        ) : (
          onlineUsers.map((user) => (
            <span
              key={user}
              style={{ marginLeft: "10px" }}
            >
              🟢 {user.slice(0, 6)}
            </span>
          ))
        )}
      </div>

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

      {/* Connection Status */}

      <p>{status}</p>

      {/* Monaco Editor */}

      <Editor
        height="500px"
        language={language}
        value={code}
        onChange={handleCodeChange}
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

        <pre>
          {output || "Output will appear here..."}
        </pre>
      </div>
    </div>
  );
}