"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CodeEditor from "@/components/CodeEditor";
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
      <main className="cc-entry-page cc-access-page">
        <nav className="cc-nav cc-content-width cc-entry-nav">
          <button className="cc-brand" type="button" onClick={() => router.push("/")}>
            <span className="cc-brand-mark">C</span> CodeCollab
          </button>
          <span className="cc-entry-nav-note">A thoughtful place to build together</span>
        </nav>
        <section className="cc-auth-layout cc-content-width">
          <div className="cc-auth-card cc-access-card">
            <div className="cc-eyebrow">Authentication required</div>
            <h1>Sign in to continue.</h1>
            <p>You need an active account before opening this collaborative room.</p>
            <div className="cc-access-actions">
              <button className="cc-button-primary" onClick={() => router.push("/?mode=login")}>Sign in <span aria-hidden="true">↗</span></button>
              <button className="cc-button-ghost" onClick={() => router.push("/")}>Back to room codes</button>
            </div>
          </div>
          <aside className="cc-auth-story">
            <div className="cc-eyebrow">Your team is waiting</div>
            <h2>Good code<br /><em>moves together.</em></h2>
            <p>Sign in to join the room and pick up the work together.</p>
            <div className="cc-entry-artwork cc-access-artwork" aria-hidden="true">
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
  }

  if (!room) {
    return (
      <main className="cc-entry-page cc-access-page">
        <nav className="cc-nav cc-content-width cc-entry-nav">
          <button className="cc-brand" type="button" onClick={() => router.push("/")}>
            <span className="cc-brand-mark">C</span> CodeCollab
          </button>
          <span className="cc-entry-nav-note">A thoughtful place to build together</span>
        </nav>
        <section className="cc-auth-layout cc-content-width">
          <div className="cc-auth-card cc-access-card">
            <div className="cc-eyebrow">Room access</div>
            <h1>{error || "This room is not available."}</h1>
            <p>You are signed in, but this account does not have access to this room.</p>
            <div className="cc-access-actions">
              <button className="cc-button-primary" onClick={() => router.push("/")}>Use a room code <span aria-hidden="true">↗</span></button>
              <button className="cc-button-ghost" onClick={() => router.push("/")}>Back to workspace</button>
            </div>
          </div>
          <aside className="cc-auth-story">
            <div className="cc-eyebrow">CodeCollab rooms</div>
            <h2>Shared focus.<br /><em>Clear access.</em></h2>
            <p>Join with a room code or ask an owner to add your account.</p>
            <div className="cc-entry-artwork cc-access-artwork" aria-hidden="true">
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

      <CodeEditor roomId={roomId} roomName={room.name} joinCode={room.join_code ?? ""} />
    </main>
  );
}