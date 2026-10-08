"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import CrystalCBackground from "@/components/CrystalCBackground";
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
  member_count?: number;
}

interface RoomMember {
  id: number;
  user_id: number;
  username: string;
  email: string;
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
  const roomView = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("popstate", onStoreChange);
      return () => window.removeEventListener("popstate", onStoreChange);
    },
    () => {
      const requestedView = new URLSearchParams(window.location.search).get("rooms");
      return requestedView === "shared" || requestedView === "mine" ? requestedView : "home";
    },
    () => "home"
  );
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
  const [sharedRooms, setSharedRooms] = useState<Room[]>([]);
  const [status, setStatus] = useState("");
  const [copiedRoomId, setCopiedRoomId] = useState<number | null>(null);
  const [membersRoom, setMembersRoom] = useState<Room | null>(null);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberUserId, setMemberUserId] = useState("");
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<Room | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const activeMode = mode === "landing" && urlRequestsLogin ? "login" : mode;
  const dashboardRooms = roomView === "shared" ? sharedRooms : rooms;

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
        const currentUser = data.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          const cachedRooms = sessionStorage.getItem(`cc_shared_rooms_${currentUser.id}`);
          if (cachedRooms) {
            try {
              const parsedRooms = JSON.parse(cachedRooms);
              setSharedRooms(Array.isArray(parsedRooms) ? parsedRooms : []);
            } catch {
              sessionStorage.removeItem(`cc_shared_rooms_${currentUser.id}`);
            }
          }
        }
        await loadRooms();
      } catch {
        setStatus("Backend is unavailable.");
      }
    };

    void loadCurrentUser();
  }, []);

  const joinRoomAndRedirect = async (nextJoinCode: string, joiningUserId = user?.id) => {
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
      if (joiningUserId && Number(data.room.owner_id) !== Number(joiningUserId)) {
        const storageKey = `cc_shared_rooms_${joiningUserId}`;
        let cachedRooms: Room[] = [];
        try {
          const storedRooms = sessionStorage.getItem(storageKey);
          cachedRooms = storedRooms ? JSON.parse(storedRooms) as Room[] : [];
        } catch {
          cachedRooms = [];
        }
        const nextSharedRooms = [
          ...cachedRooms.filter((room) => Number(room.id) !== Number(data.room.id)),
          { id: data.room.id, name: data.room.name, owner_id: data.room.owner_id },
        ];
        sessionStorage.setItem(storageKey, JSON.stringify(nextSharedRooms));
        setSharedRooms(nextSharedRooms);
      }
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
        await joinRoomAndRedirect(pendingCode, Number(data.user.id));
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
        const meData = await meResponse.json();
        await joinRoomAndRedirect(trimmed, Number(meData.user.id));
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
    setSharedRooms([]);
    persistPendingJoin("");
    setStatus("Signed out.");
    router.push("/");
  };

  const copyJoinCode = async (room: Room) => {
    if (!room.join_code) {
      setStatus("Room code is unavailable.");
      return;
    }

    try {
      await navigator.clipboard.writeText(room.join_code);
      setCopiedRoomId(room.id);
      window.setTimeout(() => {
        setCopiedRoomId((currentRoomId) => currentRoomId === room.id ? null : currentRoomId);
      }, 1600);
    } catch {
      setStatus("Could not copy the room code. Select and copy it manually.");
    }
  };

  const copyRoomLink = async (room: Room) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${room.id}`);
      setStatus("Room link copied.");
    } catch {
      setStatus("Could not copy the room link.");
    }
  };

  const openMembers = async (room: Room) => {
    setMembersRoom(room);
    setMembersLoading(true);
    setRoomMembers([]);
    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${room.id}/members`, {
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.message || "Could not load room members.");
        return;
      }
      setRoomMembers(Array.isArray(data.members) ? data.members : []);
    } catch {
      setStatus("Could not connect to the backend.");
    } finally {
      setMembersLoading(false);
    }
  };

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!membersRoom || !/^\d+$/.test(memberUserId.trim())) {
      setStatus("Enter a valid user ID.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${membersRoom.id}/members`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(memberUserId) }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.message || "Could not add room member.");
        return;
      }
      setMemberUserId("");
      setStatus("Member added.");
      await openMembers(membersRoom);
      await loadRooms();
    } catch {
      setStatus("Could not connect to the backend.");
    }
  };

  const removeMember = async (member: RoomMember) => {
    if (!membersRoom) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${membersRoom.id}/members/${member.user_id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.message || "Could not remove room member.");
        return;
      }
      setStatus("Member removed.");
      await openMembers(membersRoom);
      await loadRooms();
    } catch {
      setStatus("Could not connect to the backend.");
    }
  };

  const renameRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingRoom || !roomName.trim()) {
      setStatus("Room name is required.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${editingRoom.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.message || "Could not rename room.");
        return;
      }
      setEditingRoom(null);
      setRoomName("");
      setStatus("Room renamed.");
      await loadRooms();
    } catch {
      setStatus("Could not connect to the backend.");
    }
  };

  const deleteRoom = async () => {
    if (!deletingRoom) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/rooms/${deletingRoom.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data.message || "Could not delete room.";
        setDeleteError(message);
        setStatus(message);
        return;
      }
      setRooms((currentRooms) => currentRooms.filter((room) => room.id !== deletingRoom.id));
      setStatus(`Deleted ${deletingRoom.name}.`);
      setDeletingRoom(null);
    } catch {
      setDeleteError("Could not connect to the backend.");
      setStatus("Could not connect to the backend.");
    }
  };

  const renderLanding = () => (
    <main className="cc-landing cc-entry-page">
      <nav className="cc-nav cc-content-width cc-entry-nav">
        <button className="cc-brand" type="button">
          <span className="cc-brand-mark">C</span> CodeCollab
        </button>
        <div className="cc-nav-actions">
          <button className="cc-button-ghost" type="button" onClick={() => setMode("login")}>Sign in</button>
          <button className="cc-button-primary" type="button" onClick={() => setMode("register")}>Start building</button>
        </div>
      </nav>

      <section className="cc-entry-layout cc-content-width">
        <div className="cc-entry-copy">
          <div className="cc-eyebrow">CodeCollab / shared workspace</div>
          <h1>Have a room code?<br /><em>Enter it below.</em></h1>
          <p className="cc-hero-copy">
            Bring your collaborators together in a focused room for shared code, ideas, and momentum.
          </p>

          <form onSubmit={handleJoinRoom} className="cc-entry-code-form">
            <label className="cc-entry-code-field">
              <span aria-hidden="true">⌘</span>
              <input
                id="dashboard-join-code"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Room code"
                aria-label="Room code"
                maxLength={12}
              />
            </label>
            <button className="cc-button-primary" type="submit">Join room <span aria-hidden="true">↗</span></button>
          </form>

          <p className="cc-status" role="status" aria-live="polite">{status}</p>
          <div className="cc-entry-caption"><span />Private rooms. Shared momentum.</div>
        </div>

        <div className="cc-entry-artwork" aria-hidden="true">
          <span className="cc-entry-orbit cc-entry-orbit-one" />
          <span className="cc-entry-orbit cc-entry-orbit-two" />
          <CrystalCBackground />
          <span className="cc-entry-crystal-fragment cc-entry-fragment-one" />
          <span className="cc-entry-crystal-fragment cc-entry-fragment-two" />
        </div>
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
    <main className="cc-auth-page cc-entry-page">
      <nav className="cc-nav cc-content-width cc-entry-nav">
        <button
          className="cc-brand"
          type="button"
          onClick={() => {
            setMode("landing");
            router.replace("/");
          }}
        >
          <span className="cc-brand-mark">C</span> CodeCollab
        </button>
        <span className="cc-entry-nav-note">A thoughtful place to build together</span>
      </nav>

      <section className="cc-auth-layout cc-content-width">
        <section className="cc-auth-card">
          <div className="cc-eyebrow">{activeMode === "login" ? "Welcome back" : "Your workspace begins here"}</div>
          <h1>{activeMode === "login" ? "Return to the room." : "Make something together."}</h1>
          <p>
            {activeMode === "login"
              ? joinCode
                ? "Room found. Sign in or create an account to join."
                : "Pick up where your team left off."
              : "Create an account for shared rooms and thoughtful, AI-assisted development."}
          </p>

          <form onSubmit={handleAuth} className="cc-form">
            {activeMode === "register" && (
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" autoComplete="username" required />
            )}
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" type="email" autoComplete="email" required />
            <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" autoComplete={activeMode === "login" ? "current-password" : "new-password"} required />
            <button className="cc-button-primary" type="submit">
              {activeMode === "login" ? "Sign in" : "Create account"} <span aria-hidden="true">↗</span>
            </button>
          </form>

          {joinCode ? <p className="cc-entry-pending-code">Room code saved <code>{joinCode}</code></p> : null}

          <form onSubmit={handleJoinRoom} className="cc-entry-inline-join">
            <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Room join code" aria-label="Room join code" maxLength={12} />
            <button className="cc-button-ghost" type="submit">Join room</button>
          </form>

          <p className="cc-status" role="status" aria-live="polite">{status}</p>
          <button className="cc-text-button" type="button" onClick={() => setMode(activeMode === "login" ? "register" : "login")}>
            {activeMode === "login" ? "New to CodeCollab? Create an account" : "Already have an account? Sign in"}
          </button>
        </section>

        <aside className="cc-auth-story">
          <div className="cc-eyebrow">A shared creative space</div>
          <h2>Good code<br /><em>moves together.</em></h2>
          <p>Live collaboration, focused tools, and room for the whole team to think.</p>
          <div className="cc-entry-artwork cc-auth-artwork" aria-hidden="true">
            <span className="cc-entry-orbit cc-entry-orbit-one" />
            <span className="cc-entry-orbit cc-entry-orbit-two" />
            <CrystalCBackground />
            <span className="cc-entry-crystal-fragment cc-entry-fragment-one" />
            <span className="cc-entry-crystal-fragment cc-entry-fragment-two" />
          </div>
        </aside>
      </section>
    </main>
  );

  const renderDashboard = () => (
    <main className="cc-dashboard cc-warm-dashboard">
      <aside className="cc-sidebar">
        <button className="cc-brand" type="button">
          <span className="cc-brand-mark" aria-hidden="true">C<i /></span>
          <span className="cc-brand-wordmark">CodeCollab</span>
        </button>

        <div className="cc-sidebar-section">
          <span className="cc-sidebar-label">Workspace</span>
          <Link className={`cc-sidebar-link ${roomView === "home" ? "cc-sidebar-link-active" : ""}`} href="/">⌂ <span>Home</span></Link>
          <Link className={`cc-sidebar-link ${roomView === "mine" ? "cc-sidebar-link-active" : ""}`} href="/?rooms=mine">▦ <span>My Rooms</span><b>{rooms.length}</b></Link>
          <Link className={`cc-sidebar-link ${roomView === "shared" ? "cc-sidebar-link-active" : ""}`} href="/?rooms=shared">◌ <span>Shared Rooms</span><b>{sharedRooms.length}</b></Link>
        </div>

        <div className="cc-sidebar-bottom">
          <Link className="cc-sidebar-link" href="/settings">⚙ <span>Settings</span></Link>
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
        <section className="cc-dashboard-hero">
          <div>
            <div className="cc-eyebrow">Workspace / home</div>
            <h1>Good to see you,<br /><em>{user?.username}.</em></h1>
            <p>Your rooms, ready when you are.</p>
          </div>
          <CrystalCBackground />
        </section>

        <header className="cc-dashboard-header">
          <div className="cc-dashboard-actions">
            <form className="cc-room-action-form cc-join-action" onSubmit={handleJoinRoom}>
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Join room code"
                maxLength={12}
              />
              <button className="cc-button-primary" type="submit">Join Room</button>
            </form>
            <form className="cc-room-action-form cc-create-action" onSubmit={handleCreateRoom}>
              <input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Room name" />
              <button className="cc-button-primary" type="submit"><span aria-hidden="true">＋</span> Create room</button>
            </form>
          </div>
        </header>

        <p className="cc-status" role="status" aria-live="polite">{status}</p>
        <div className="cc-dashboard-rule" />

        <section className="cc-room-section">
          <div className="cc-section-heading">
            <div>
              <span className="cc-sidebar-label">Your rooms</span>
              <h2>{roomView === "shared" ? "Shared workspaces" : roomView === "mine" ? "My workspaces" : "Active workspaces"}</h2>
            </div>
            <span className="cc-room-count">{dashboardRooms.length} {dashboardRooms.length === 1 ? "room" : "rooms"}</span>
          </div>

          {dashboardRooms.length === 0 ? (
            <div className="cc-empty-state">
              <div className="cc-empty-icon">＋</div>
              <h3>{roomView === "shared" ? "No shared rooms on this device yet." : "Your workspace is quiet."}</h3>
              <p>{roomView === "shared" ? "Join a room with its code to see it here during this session." : "Create your first room and bring the code in."}</p>
              {roomView === "shared" ? (
                <button className="cc-button-primary" type="button" onClick={() => document.getElementById("dashboard-join-code")?.focus()}>Enter a room code</button>
              ) : (
                <form onSubmit={handleCreateRoom}>
                  <input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="Room name" />
                  <button className="cc-button-primary" type="submit">Create your first room</button>
                </form>
              )}
            </div>
          ) : (
            <div className="cc-room-grid">
              {dashboardRooms.map((room, index) => (
                <div className="cc-room-card" key={room.id}>
                  <div className="cc-room-card-top">
                    <span className="cc-room-index">{String(index + 1).padStart(2, "0")}</span>
                    <Link aria-label={`Open ${room.name}`} className="cc-room-open-icon" href={`/room/${room.id}`}>↗</Link>
                  </div>
                  <h3>{room.name}</h3>
                  <div className="cc-room-meta">
                    <span className="cc-member-chip"><span aria-hidden="true">♧</span>{room.member_count ?? 0} {room.member_count === 1 ? "member" : "members"}</span>
                    {Number(room.owner_id) === user?.id && room.join_code ? (
                      <div className="cc-room-code">
                        <span className="cc-room-code-label">Room Code</span>
                        <code>{room.join_code}</code>
                        <button type="button" aria-label={`Copy ${room.name} room code`} onClick={() => void copyJoinCode(room)}>
                          {copiedRoomId === room.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="cc-room-actions">
                    <Link className="cc-room-action-open" href={`/room/${room.id}`}>↗ <span>Open</span></Link>
                    <button type="button" onClick={() => void copyRoomLink(room)}>⌯ <span>Share</span></button>
                    <button type="button" onClick={() => void openMembers(room)}>♧ <span>Members</span></button>
                    {Number(room.owner_id) === user?.id ? (
                      <details className="cc-room-more">
                        <summary aria-label={`More actions for ${room.name}`}>⋮</summary>
                        <div className="cc-room-more-menu">
                          <button type="button" onClick={() => { setRoomName(room.name); setEditingRoom(room); }}>Rename</button>
                          <button className="cc-danger-button" type="button" onClick={() => { setDeleteError(""); setDeletingRoom(room); }}>Delete</button>
                        </div>
                      </details>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>

      {editingRoom ? (
        <div className="cc-modal-backdrop" role="presentation" onClick={() => setEditingRoom(null)}>
          <section className="cc-modal" role="dialog" aria-modal="true" aria-labelledby="rename-room-title" onClick={(event) => event.stopPropagation()}>
            <button className="cc-modal-close" type="button" aria-label="Close rename dialog" onClick={() => setEditingRoom(null)}>×</button>
            <div className="cc-eyebrow">Room settings</div>
            <h2 id="rename-room-title">Rename Room</h2>
            <form className="cc-form" onSubmit={renameRoom}>
              <input value={roomName} onChange={(event) => setRoomName(event.target.value)} aria-label="Room name" required />
              <div className="cc-modal-actions">
                <button className="cc-button-ghost" type="button" onClick={() => setEditingRoom(null)}>Cancel</button>
                <button className="cc-button-primary" type="submit">Save name</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {membersRoom ? (
        <div className="cc-modal-backdrop" role="presentation" onClick={() => setMembersRoom(null)}>
          <section className="cc-modal" role="dialog" aria-modal="true" aria-labelledby="room-members-title" onClick={(event) => event.stopPropagation()}>
            <button className="cc-modal-close" type="button" aria-label="Close members dialog" onClick={() => setMembersRoom(null)}>×</button>
            <div className="cc-eyebrow">Room access</div>
            <h2 id="room-members-title">{membersRoom.name}</h2>
            <p>People in this room</p>
            {membersLoading ? <p>Loading members...</p> : (
              <div className="cc-member-list">
                {roomMembers.length === 0 ? <p>No members have joined yet.</p> : roomMembers.map((member) => (
                  <div className="cc-member-row" key={member.id}>
                    <span><strong>{member.username}</strong><small>{member.email}</small></span>
                    <button className="cc-danger-button" type="button" onClick={() => void removeMember(member)}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            <form className="cc-form" onSubmit={addMember}>
              <input value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)} placeholder="Collaborator user ID" inputMode="numeric" required />
              <button className="cc-button-primary" type="submit">Add member</button>
            </form>
          </section>
        </div>
      ) : null}

      {deletingRoom ? (
        <div className="cc-modal-backdrop" role="presentation" onClick={() => { setDeletingRoom(null); setDeleteError(""); }}>
          <section className="cc-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-room-title" onClick={(event) => event.stopPropagation()}>
            <button className="cc-modal-close" type="button" aria-label="Close delete confirmation" onClick={() => { setDeletingRoom(null); setDeleteError(""); }}>×</button>
            <div className="cc-eyebrow">Permanent action</div>
            <h2 id="delete-room-title">Delete Room?</h2>
            <p>Are you sure you want to delete “{deletingRoom.name}”?</p>
            <p>This permanently deletes the room and its associated files and history.</p>
            {deleteError ? <p className="cc-history-error" role="alert">{deleteError}</p> : null}
            <div className="cc-modal-actions">
              <button className="cc-button-ghost" type="button" onClick={() => { setDeletingRoom(null); setDeleteError(""); }}>Cancel</button>
              <button className="cc-danger-button" type="button" onClick={() => void deleteRoom()}>Delete Room</button>
            </div>
          </section>
        </div>
      ) : null}
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
