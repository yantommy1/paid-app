import Link from "next/link";

type Props = {
  title: string;
  body: string;
  cta?: { label: string; href: string };
};

export function PayStatus({ title, body, cta }: Props) {
  return (
    <main className="min-h-screen bg-white px-6 py-24 text-[#0D0D0D]">
      <div className="mx-auto max-w-xl border border-[#E5E5E5] bg-white p-10 text-center">
        <p className="text-sm uppercase tracking-[0.22em] text-[#1B4332]">Paid</p>
        <h1 className="mt-3 font-display text-4xl text-[#0D0D0D]">{title}</h1>
        <p className="mt-4 text-sm leading-relaxed text-[#6B6B6B]">{body}</p>
        {cta && (
          <Link
            href={cta.href}
            className="mt-8 inline-flex items-center justify-center bg-[#1B4332] px-6 py-3 text-sm font-medium text-white"
          >
            {cta.label}
          </Link>
        )}
      </div>
    </main>
  );
}
