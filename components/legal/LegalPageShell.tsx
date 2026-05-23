import Link from "next/link";

type Props = {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
};

export function LegalPageShell({ title, lastUpdated, children }: Props) {
  return (
    <div className="min-h-screen bg-white text-[#0D0D0D]">
      <nav className="border-b border-[#E5E5E5] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link
            href="/"
            className="font-display text-3xl tracking-tight text-[#0D0D0D]"
          >
            Paid
          </Link>
          <div className="flex flex-wrap items-center gap-4 text-sm sm:gap-6">
            <Link
              href="/privacy"
              className="font-medium text-[#6B6B6B] transition hover:text-[#0D0D0D]"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="font-medium text-[#6B6B6B] transition hover:text-[#0D0D0D]"
            >
              Terms
            </Link>
            <Link
              href="/"
              className="font-medium text-[#6B6B6B] transition hover:text-[#0D0D0D]"
            >
              Home
            </Link>
          </div>
        </div>
      </nav>

      <article className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#6B6B6B]">
          paid-app.com
        </p>
        <h1 className="mt-3 font-display text-4xl tracking-tight text-[#0D0D0D] md:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-sm text-[#6B6B6B]">Last updated: {lastUpdated}</p>
        <div className="mt-14 border-t border-[#E5E5E5] pt-14">{children}</div>
      </article>

      <footer className="border-t border-[#E5E5E5]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#6B6B6B]">
            {"\u00A9 "}
            {new Date().getFullYear()} Paid. Professional services invoice follow-up.
          </p>
          <div className="flex gap-6 text-sm">
            <Link
              href="/privacy"
              className="text-[#6B6B6B] transition hover:text-[#0D0D0D]"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-[#6B6B6B] transition hover:text-[#0D0D0D]"
            >
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
