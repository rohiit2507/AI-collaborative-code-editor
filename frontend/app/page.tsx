"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";

interface User {
  id: number;
  username: string;
  email: string;
}

interface Room {
  id: number;
  name: string;
}

export default function Home() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roomName, setRoomName] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [status, setStatus] = useState("");

  const loadRooms = async () => {
    const response = await fetch(`${API_BASE_URL}/api/rooms`, {
      credentials: "include",
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    setRooms(Array.isArray(data.rooms) ? data.rooms : []);
  };

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        setUser(data.user);
        await loadRooms();
      })
      .catch(() => {
        setStatus("Backend is unavailable.");
      });
  }, []);

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Working...");

    const endpoint = mode === "login" ? "/api/login" : "/api/users";
    const body = mode === "login" ? { email, password } : { username, email, password };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (!response.ok) {
        setStatus(data.message || "Authentication failed.");
        return;
      }

      setUser(data.user);
      setStatus(`Signed in as ${data.user.username}`);
      await loadRooms();
    } catch {
      setStatus("Backend is unavailable. Start the backend and try again.");
    }
  };

  const handleCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!roomName.trim()) {
      return;
    }

    const response = await fetch(`${API_BASE_URL}/api/rooms`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: roomName.trim() }),
    });
    const data = await response.json();

    if (!response.ok) {
      setStatus(data.message || "Could not create room.");
      return;
    }

    setRoomName("");
    setStatus(`Created ${data.room.name}`);
    await loadRooms();
  };

  if (!user) {
    return (
      <main style={{ maxWidth: "520px", margin: "0 auto", padding: "48px 20px" }}>
        <h1>AI Collaborative Code Editor</h1>
        <p>Sign in to create rooms, files, and collaborative workspaces.</p>

        <form onSubmit={handleAuth} style={{ display: "grid", gap: "10px", marginTop: "24px" }}>
          {mode === "register" ? (
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" required />
          ) : null}
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" required />
          <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" required />
          <button type="submit">{mode === "login" ? "Sign in" : "Create account"}</button>
        </form>

        <button onClick={() => setMode(mode === "login" ? "register" : "login")} style={{ marginTop: "12px" }}>
          {mode === "login" ? "Need an account? Register" : "Already registered? Sign in"}
        </button>
        <p>{status}</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 20px" }}>
      <h1>AI Collaborative Code Editor</h1>
      <p>Welcome, {user.username}. Create or open a collaborative room.</p>

      <form onSubmit={handleCreateRoom} style={{ display: "flex", gap: "10px", margin: "24px 0" }}>
        <input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Room name" required />
        <button type="submit">Create room</button>
      </form>

      <p>{status}</p>
      <h2>Your rooms</h2>
      {rooms.length === 0 ? <p>No rooms yet.</p> : null}
      <ul>
        {rooms.map((room) => (
          <li key={room.id}>
            <Link href={`/room/${room.id}`}>{room.name}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
