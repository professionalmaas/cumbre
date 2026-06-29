// Branded 404. Rendered for notFound() calls (e.g. unknown job/sample) and unmatched routes.
import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function NotFound() {
  return (
    <main className="frame">
      <header>
        <Brand />
      </header>
      <div style={{ marginTop: 70, textAlign: "center" }}>
        <div className="eyebrow">Off the map</div>
        <h1 className="serif" style={{ fontSize: 30, margin: "10px 0 8px" }}>
          This trail doesn&apos;t lead anywhere
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 14.5, maxWidth: 340, margin: "0 auto" }}>
          The page you&apos;re after has moved or never existed. Let&apos;s get you back on a marked route.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 280, margin: "26px auto 0" }}>
          <Link href="/" className="btn-primary">
            Back to base camp
          </Link>
          <Link href="/upload" className="btn-ghost">
            Climb a track
          </Link>
        </div>
      </div>
    </main>
  );
}
