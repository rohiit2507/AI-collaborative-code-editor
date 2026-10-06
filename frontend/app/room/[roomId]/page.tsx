"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CodeEditor from "@/components/CodeEditor";
import { API_BASE_URL } from "@/lib/config";

interface User {
  id: number;
  username: string;
  email: string;
}

interface Room {
  id: number;
  name: string;
  join_code?: string;
  owner_id: number;
  owner_username?: string;
}

export default function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const verifyAccess = async () => {
      try {
        const meResponse = await fetch(`${API_BASE_URL}/api/me`, {
          credentials: "include",
        });

        if (!meResponse.ok) {
          if (!cancelled) {
            setError("Authentication required.");
            setChecking(false);
          }
          return;
        }

        const meData = await meResponse.json();
        if (!cancelled) {
          setUser(meData.user);
        }

        const roomResponse = await fetch(`${API_BASE_URL}/api/rooms/${roomId}`, {
          credentials: "include",
        });

        if (!roomResponse.ok) {
          if (!cancelled) {
            setError("This room is not available to your account yet.");
          }
          return;
        }

        const roomData = await roomResponse.json();
        if (!cancelled) {
          setRoom(roomData.room);
        }
      } catch {
        if (!cancelled) {
          setError("Could not verify access for this room.");
        }
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    };

    void verifyAccess();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  if (checking) {
    return (
      <main className="cc-shell">
        <div className="cc-surface cc-glow" style={{ margin: "0 auto", maxWidth: "680px", padding: "2rem" }}>
          <div className="cc-eyebrow">Checking access</div>
          <h1>Loading room details…</h1>
          <p>Verifying your account and room membership.</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="cc-shell">
        <div className="cc-surface cc-glow" style={{ margin: "0 auto", maxWidth: "680px", padding: "2rem" }}>
          <div className="cc-eyebrow">Authentication required</div>
          <h1>Sign in to continue</h1>
          <p>You need an active account before opening a collaborative room.</p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <button className="cc-button-primary" onClick={() => router.push("/?mode=login")}>Sign in</button>
            <button className="cc-button-ghost" onClick={() => router.push("/")}>Back to home</button>
          </div>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="cc-shell">
        <div className="cc-surface cc-glow" style={{ margin: "0 auto", maxWidth: "680px", padding: "2rem" }}>
          <div className="cc-eyebrow">Access denied</div>
          <h1>{error || "This room is not available"}</h1>
          <p>You are signed in, but this account does not have access to this room.</p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <button className="cc-button-primary" onClick={() => router.push("/")}>Use a room code</button>
            <button className="cc-button-ghost" onClick={() => router.push("/")}>Back to workspace</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="cc-shell">
      <header style={{ margin: "0 auto", maxWidth: "1400px", padding: "0 0 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div>
          <div className="cc-eyebrow">Collaborative session</div>
          <h1>{room.name}</h1>
        </div>

        <div className="cc-user-chip" style={{ marginLeft: "auto" }}>
          <span className="cc-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
          <span>
            <strong>{user.username}</strong>
            <small>{user.email}</small>
          </span>
        </div>
      </header>

      <CodeEditor roomId={roomId} />
    </main>
  );
}