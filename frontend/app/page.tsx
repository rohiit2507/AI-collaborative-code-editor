"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { API_BASE_URL } from "@/lib/config";

interface User {
  id: number;
  username: string;
  email: string;
}

interface Room {
  id: number;
  name: string;
  owner_id: number;
  join_code?: string;
}

const features = [
  ["01", "Real-time collaboration", "Shared editing and presence that keep the whole team in the same flow."],
  ["02", "AI coding assistant", "Explain, review, generate, and ask questions without leaving the workspace."],
  ["03", "Multi-language execution", "Run code inside bounded Docker sandboxes with clear feedback."],
  ["04", "Version history", "Inspect previous states and restore with confidence."],
  ["05", "Secure by design", "Authenticated rooms, protected APIs, and isolated execution."],
] as const;

export default function Home() {
  const router = useRouter();
  const urlRequestsLogin = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("popstate", onStoreChange);
      return () => window.removeEventListener("popstate", onStoreChange);
    },
    () => new URLSearchParams(window.location.search).get("mode") === "login",
    () => false
  );
  const [mode, setMode] = useState<"landing" | "login" | "register">("landing");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [status, setStatus] = useState("");
  const activeMode = mode === "landing" && urlRequestsLogin ? "login" : mode;

  const pendingJoinKey = "cc_pending_join_code";

  const persistPendingJoin = (value: string) => {
    if (typeof window === "undefined") {
      return;
    }

    if (!value) {
      sessionStorage.removeItem(pendingJoinKey);
      return;
    }

    sessionStorage.setItem(pendingJoinKey, value.trim().toUpperCase());
  };

  const loadRooms = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms`, { credentials: "include" });
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } catch {
      setStatus("Backend is unavailable.");
    }
  };

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/me`, { credentials: "include" });
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        setUser(data.user ?? null);
        await loadRooms();
      } catch {
        setStatus("Backend is unavailable.");
      }
    };

    void loadCurrentUser();
  }, []);

  const joinRoomAndRedirect = async (nextJoinCode: string) => {
    const trimmed = nextJoinCode.trim();
    if (!trimmed) {
      setStatus("Enter a room code to join.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/join`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: trimmed }),
      });

      const data = await response.json();
      if (!response.ok) {
        setStatus(data.message || "Could not join room.");
        persistPendingJoin("");
        return;
      }

      persistPendingJoin("");
      setJoinCode("");
      setStatus(`Joined ${data.room.name}`);
      router.push(`/room/${data.room.id}`);
    } catch {
      setStatus("Could not connect to the backend.");
    }
  };

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Working...");

    const endpoint = activeMode === "login" ? "/api/login" : "/api/users";
    const body = activeMode === "login" ? { email, password } : { username, email, password };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let data = await response.json();
      if (!response.ok) {
        setStatus(data.message || "Authentication failed.");
        return;
      }

      if (activeMode === "register") {
        const loginResponse = await fetch(`${API_BASE_URL}/api/login`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        data = await loginResponse.json();
        if (!loginResponse.ok) {
          setStatus(data.message || "Account created, but sign-in failed. Please sign in.");
          setMode("login");
          return;
        }
      }

      setUser(data.user);

      const pendingCode = typeof window !== "undefined" ? sessionStorage.getItem(pendingJoinKey) : null;
      if (pendingCode) {
        await joinRoomAndRedirect(pendingCode);
        return;
      }

      await loadRooms();
      setStatus("Signed in.");
    } catch {
      setStatus("Backend is unavailable. Start the backend and try again.");
    }
  };

  const handleJoinRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = joinCode.trim();

    if (!trimmed) {
      setStatus("Enter a room code to join.");
      return;
    }

    try {
      const validateResponse = await fetch(`${API_BASE_URL}/api/rooms/validate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: trimmed }),
      });

      const validateData = await validateResponse.json();
      if (!validateResponse.ok || !validateData.room) {
        setStatus(validateData.message || "Invalid room code");
        return;
      }

      persistPendingJoin(trimmed);

      const meResponse = await fetch(`${API_BASE_URL}/api/me`, { credentials: "include" });
      if (meResponse.ok) {
        await joinRoomAndRedirect(trimmed);
        return;
      }

      setStatus("Room found. Sign in or create an account to join.");
      setMode("login");
      setJoinCode(trimmed);
      router.push("/?mode=login");
    } catch {
      setStatus("Could not connect to the backend.");
    }
  };

  const handleCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!roomName.trim()) {
      setStatus("Room name is required.");
      return;
    }

    try {
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
      router.push(`/room/${data.room.id}`);
    } catch {
      setStatus("Could not create room.");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore logout failure; the UI still clears local auth state.
    }

    setUser(null);
    setRooms([]);
    persistPendingJoin("");
    setStatus("Signed out.");
    router.push("/");
  };

  const renderLanding = () => (
    <main className="cc-landing">
      <nav className="cc-nav cc-content-width">
        <button className="cc-brand" type="button">
          <span className="cc-brand-mark">C</span> CodeCollab
        </button>
        <div className="cc-nav-actions">
          <button className="cc-button-ghost" type="button" onClick={() => setMode("login")}>Sign in</button>
          <button className="cc-button-primary" type="button" onClick={() => setMode("register")}>Start building</button>
        </div>
      </nav>

      <section className="cc-hero cc-content-width">
        <div className="cc-eyebrow">Join a collaborative room</div>
        <h1>
          Have a room code?
          <br />
          <span>Enter it below.</span>
        </h1>
        <p className="cc-hero-copy">
          Use your room code to continue, then sign in or create an account to join securely.
        </p>

        <form onSubmit={handleJoinRoom} className="cc-form" style={{ maxWidth: "520px", marginTop: "1.5rem", gap: "0.75rem" }}>
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value)}
            placeholder="Room code"
            maxLength={12}
          />
          <button className="cc-button-primary" type="submit">Join room</button>
        </form>

        <p className="cc-status">{status}</p>
      </section>

      <section className="cc-feature-band cc-content-width">
        <div className="cc-section-label">Inside the workspace</div>
        <div className="cc-feature-grid">
          {features.map(([number, title, copy]) => (
            <article className="cc-feature" key={number}>
              <span className="cc-feature-number">{number}</span>
              <h2>{title}</h2>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );

  const renderAuth = () => (
    <main className="cc-auth-page">
      <button
        className="cc-brand cc-auth-brand"
        type="button"
        onClick={() => {
          setMode("landing");
          router.replace("/");
        }}
      >
        <span className="cc-brand-mark">C</span> CodeCollab
      </button>

      <section className="cc-auth-card cc-glow">
        <div className="cc-eyebrow">{activeMode === "login" ? "Welcome back" : "Create your workspace"}</div>
        <h1>{activeMode === "login" ? "Return to the room." : "Start building together."}</h1>
        <p>
          {activeMode === "login"
            ? joinCode
              ? "Room found. Sign in or create an account to join."
              : "Sign in and pick up where your team left off."
            : "Create an account for collaborative rooms and AI-assisted development."}
        </p>

        <form onSubmit={handleAuth} className="cc-form">
          {activeMode === "register" && (
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" required />
          )}
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" type="email" required />
          <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" required />
          <button className="cc-button-primary" type="submit">
            {activeMode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <form onSubmit={handleJoinRoom} className="cc-form" style={{ marginTop: "1rem", gap: "0.75rem" }}>
          <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Room join code" maxLength={12} />
          <button className="cc-button-ghost" type="submit">Join room</button>
        </form>

        <p className="cc-status">{status}</p>
        <button className="cc-text-button" type="button" onClick={() => setMode(activeMode === "login" ? "register" : "login")}>
          {activeMode === "login" ? "Need an account? Register" : "Already registered? Sign in"}
        </button>
      </section>
    </main>
  );

  const renderDashboard = () => (
    <main className="cc-dashboard">
      <aside className="cc-sidebar">
        <button className="cc-brand" type="button">
          <span className="cc-brand-mark">C</span> CodeCollab
        </button>

        <div className="cc-sidebar-section">
          <span className="cc-sidebar-label">Workspace</span>
          <button className="cc-sidebar-link cc-sidebar-link-active" type="button">⌂ <span>Home</span></button>
          <button className="cc-sidebar-link" type="button">▦ <span>My Rooms</span><b>{rooms.length}</b></button>
          <button className="cc-sidebar-link" type="button">◌ <span>Shared Rooms</span></button>
        </div>

        <div className="cc-sidebar-bottom">
          <button className="cc-sidebar-link" type="button">⚙ <span>Settings</span></button>
          <div className="cc-user-chip">
            <span className="cc-avatar">{user?.username.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{user?.username}</strong>
              <small>{user?.email}</small>
            </span>
          </div>
          <button className="cc-button-ghost" type="button" onClick={handleLogout} style={{ width: "100%", marginTop: "0.75rem" }}>
            Logout
          </button>
        </div>
      </aside>

      <section className="cc-dashboard-main">
        <header className="cc-dashboard-header">
          <div>
            <div className="cc-eyebrow">Workspace / home</div>
            <h1>Good to see you, {user?.username}.</h1>
            <p>Your rooms, ready when you are.</p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <form onSubmit={handleJoinRoom} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Join room code"
                maxLength={12}
                style={{ maxWidth: "180px" }}
              />
              <button className="cc-button-primary" type="submit">Join Room</button>
            </form>
            <form onSubmit={handleCreateRoom}>
              <input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Room name" style={{ maxWidth: "180px" }} />
              <button className="cc-button-primary" type="submit">＋ Create room</button>
            </form>
          </div>
        </header>

        <p className="cc-status" role="status" aria-live="polite">{status}</p>
        <div className="cc-dashboard-rule" />

        <section className="cc-room-section">
          <div className="cc-section-heading">
            <div>
              <span className="cc-sidebar-label">Your rooms</span>
              <h2>Active workspaces</h2>
            </div>
            <span className="cc-room-count">{rooms.length} {rooms.length === 1 ? "room" : "rooms"}</span>
          </div>

          {rooms.length === 0 ? (
            <div className="cc-empty-state">
              <div className="cc-empty-icon">＋</div>
              <h3>Your workspace is quiet.</h3>
              <p>Create your first room and bring the code in.</p>
              <form onSubmit={handleCreateRoom}>
                <input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Room name" />
                <button className="cc-button-primary" type="submit">Create your first room</button>
              </form>
            </div>
          ) : (
            <div className="cc-room-grid">
              {rooms.map((room, index) => (
                <div className="cc-room-card" key={room.id}>
                  <Link href={`/room/${room.id}`}>
                    <div className="cc-room-card-top">
                      <span className="cc-room-index">0{index + 1}</span>
                      <span className="cc-room-arrow">↗</span>
                    </div>
                    <h3>{room.name}</h3>
                  </Link>
                  <div className="cc-room-actions">
                    <button type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/room/${room.id}`)}>Share</button>
                    <button type="button" onClick={() => {/* no-op */}}>Members</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );

  if (!user && activeMode === "landing") {
    return renderLanding();
  }

  if (!user) {
    return renderAuth();
  }

  return renderDashboard();
}
