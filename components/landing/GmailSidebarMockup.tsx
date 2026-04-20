const rows = [
  {
    client: "Northbridge LLP",
    amount: "24,800.00",
    days: 94,
    tier: "90+" as const,
  },
  {
    client: "Harbor Design Co.",
    amount: "12,400.00",
    days: 62,
    tier: "60" as const,
  },
  {
    client: "Cedar & Stone",
    amount: "8,950.00",
    days: 38,
    tier: "30" as const,
  },
];

function badgeStyles(tier: "90+" | "60" | "30") {
  if (tier === "90+")
    return "border-white/15 bg-white/[0.04] text-[#FF6B6B]";
  if (tier === "60")
    return "border-white/15 bg-white/[0.04] text-[#E8C547]";
  return "border-[#00E5A0]/35 bg-[#00E5A0]/[0.07] text-[#00E5A0]";
}

export function GmailSidebarMockup() {
  return (
    <div className="relative mx-auto w-full max-w-[340px] select-none pb-2">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 border border-white/[0.06]"
      />
      <div className="relative overflow-hidden rounded-lg border border-white/[0.12] bg-[#0C0C10] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-1 top-10 z-0 select-none font-display text-5xl font-semibold leading-none text-white/[0.06]"
          style={{ transform: "rotate(12deg)" }}
        >
          Paid
        </div>
        <div className="relative z-[1] flex items-center gap-2 border-b border-white/[0.08] bg-black/40 px-3 py-2.5">
          <span className="font-display text-[15px] tracking-tight text-paid-mist">
            Paid
          </span>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            Gmail · Add-on
          </span>
        </div>
        <div className="relative z-[1] border-b border-white/[0.06] px-3 py-2">
          <p className="font-mono text-[11px] tabular-nums text-white/45">
            Open AR · <span className="text-paid-mist/90">$46,150.00</span>
          </p>
        </div>
        <div className="relative z-[1] space-y-2.5 p-3 pb-4">
          {rows.map((row, index) => (
            <div
              key={row.client}
              className="rounded-md border border-white/[0.08] bg-white/[0.02] p-2.5 pl-2"
            >
              <div
                className="mb-2 flex items-start gap-2 border-l-2 pl-2"
                style={{
                  borderColor:
                    row.tier === "90+"
                      ? "rgba(255,107,107,0.85)"
                      : row.tier === "60"
                        ? "rgba(232,197,71,0.85)"
                        : "rgba(0,229,160,0.85)",
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-tight text-paid-mist">
                    {row.client}
                  </p>
                  <p className="mt-0.5 font-mono text-[12px] tabular-nums tracking-tight text-white/55">
                    <span className="text-paid-mist/90">${row.amount}</span>
                    <span className="text-white/25"> · </span>
                    INV
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] tabular-nums uppercase tracking-wide ${badgeStyles(row.tier)}`}
                >
                  {row.days}d
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-white/[0.05] pt-2.5">
                <span className="text-[10px] text-white/35">Reminder</span>
                {index === 0 ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="shrink-0 rounded-md border border-[#00E5A0]/40 bg-[#00E5A0]/[0.12] px-2.5 py-1 text-[10px] font-semibold leading-none text-[#00E5A0]"
                  >
                    Draft reminder
                  </button>
                ) : (
                  <span className="shrink-0 rounded border border-[#00E5A0]/25 bg-[#00E5A0]/[0.08] px-2 py-0.5 text-[10px] font-medium text-[#00E5A0]">
                    Draft
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="relative z-[1] border-t border-white/[0.06] px-3 py-2">
          <div className="h-1 w-full rounded-full bg-white/[0.06]">
            <div className="h-full w-[38%] rounded-full bg-[#00E5A0]/70" />
          </div>
          <p className="mt-1.5 font-mono text-[9px] uppercase tracking-wider text-white/30">
            Synced · QuickBooks
          </p>
        </div>
      </div>
    </div>
  );
}
