"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/config";

interface User {
  username: string;
  email: string;
}

const REDUCED_MOTION_KEY = "cc_reduce_motion";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const savedPreference = localStorage.getItem(REDUCED_MOTION_KEY) === "true";
    setReduceMotion(savedPreference);
    document.documentElement.dataset.ccReducedMotion = String(savedPreference);

    const loadProfile = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/me`, { credentials: "include" });
        if (!response.ok) {
          router.replace("/?mode=login");
          return;
        }
        const data = await response.json();
        setUser(data.user ?? null);
      } catch {
        setStatus("Could not load account settings.");
      }
    };

    void loadProfile();
  }, [router]);

  const handleMotionChange = (enabled: boolean) => {
    setReduceMotion(enabled);
    localStorage.setItem(REDUCED_MOTION_KEY, String(enabled));
    document.documentElement.dataset.ccReducedMotion = String(enabled);
    window.dispatchEvent(new Event("cc-motion-preference-change"));
    setStatus(enabled ? "Reduced motion enabled." : "Reduced motion disabled.");
  };

  return (
    <main className="cc-entry-page cc-settings-page">
      <nav className="cc-nav cc-content-width cc-entry-nav">
        <Link className="cc-brand" href="/">
          <span className="cc-brand-mark">C</span> CodeCollab
        </Link>
        <Link className="cc-button-ghost" href="/">Back to workspace</Link>
      </nav>

      <section className="cc-settings-layout cc-content-width">
        <div className="cc-eyebrow">Workspace / preferences</div>
        <h1>Settings</h1>
        <p className="cc-settings-intro">Your account and interface preferences.</p>

        <section className="cc-settings-section" aria-labelledby="account-settings-title">
          <div>
            <span className="cc-section-label">Account</span>
            <h2 id="account-settings-title">Your profile</h2>
          </div>
          <dl className="cc-settings-profile">
            <div><dt>Username</dt><dd>{user?.username ?? "Loading..."}</dd></div>
            <div><dt>Email</dt><dd>{user?.email ?? "Loading..."}</dd></div>
          </dl>
        </section>

        <section className="cc-settings-section" aria-labelledby="interface-settings-title">
          <div>
            <span className="cc-section-label">Interface</span>
            <h2 id="interface-settings-title">Motion</h2>
            <p>Reduce decorative movement across the workspace.</p>
          </div>
          <button
            className={`cc-setting-toggle ${reduceMotion ? "cc-setting-toggle-on" : ""}`}
            type="button"
            role="switch"
            aria-checked={reduceMotion}
            onClick={() => handleMotionChange(!reduceMotion)}
          >
            <span className="cc-setting-toggle-thumb" />
            <span>{reduceMotion ? "On" : "Off"}</span>
          </button>
        </section>

        <p className="cc-status" role="status" aria-live="polite">{status}</p>
      </section>
    </main>
  );
}


