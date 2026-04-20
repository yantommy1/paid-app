import Link from "next/link";

type Props = {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
};

export function LegalPageShell({ title, lastUpdated, children }: Props) {
  return (
    <div className="min-h-screen bg-paid-ink text-paid-mist">
      <nav className="border-b border-white/[0.08]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link
            href="/"
            className="font-display text-2xl tracking-tight text-paid-mist transition hover:text-[#00E5A0]"
          >
            Paid
          </Link>
          <div className="flex flex-wrap items-center gap-4 text-sm sm:gap-6">
            <Link
              href="/privacy"
              className="font-medium text-paid-mist/80 transition hover:text-[#00E5A0]"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="font-medium text-paid-mist/80 transition hover:text-[#00E5A0]"
            >
              Terms
            </Link>
            <Link
              href="/"
              className="font-medium text-paid-mist/80 transition hover:text-[#00E5A0]"
            >
              Home
            </Link>
          </div>
        </div>
      </nav>

      <article className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
          paid-app.com
        </p>
        <h1 className="mt-3 font-display text-4xl tracking-tight text-paid-mist md:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-sm text-paid-mist/50">Last updated: {lastUpdated}</p>
        <div className="mt-14 border-t border-white/[0.08] pt-14">{children}</div>
      </article>

      <footer className="border-t border-white/[0.08]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-paid-mist/45">
            {"\u00A9 "}
            {new Date().getFullYear()} Paid. Professional services invoice follow-up.
          </p>
          <div className="flex gap-6 text-sm">
            <Link
              href="/privacy"
              className="text-paid-mist/60 transition hover:text-[#00E5A0]"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-paid-mist/60 transition hover:text-[#00E5A0]"
            >
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
