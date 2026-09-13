import Link from "next/link";

export default function Home() {
  return (
    <main>
      <h1>AI Collaborative Code Editor</h1>
      <p>Open a room to start collaborating on code.</p>
      <p>
        Use a room URL such as <Link href="/room/1">/room/1</Link> after
        creating a room through the API.
      </p>
    </main>
  );
}
