const rows = [
  { client: "Northbridge LLP", amount: "$24,800.00", days: 94 },
  { client: "Harbor Design Co.", amount: "$12,400.00", days: 62 },
  { client: "Cedar & Stone", amount: "$8,950.00", days: 38 },
];

export function GmailSidebarMockup() {
  return (
    <aside className="mx-auto w-full max-w-[360px] rounded-lg border border-[#E5E5E5] bg-white shadow-sm">
      <header className="flex items-center border-b border-[#E5E5E5] px-4 py-3">
        <p className="font-display text-lg text-[#0D0D0D]">Paid</p>
        <span className="ml-auto text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
          Gmail Add-on
        </span>
      </header>

      <div className="border-b border-[#E5E5E5] px-4 py-3">
        <p className="text-xs text-[#6B6B6B]">Open AR</p>
        <p className="font-mono text-sm text-[#0D0D0D]">$46,150.00</p>
      </div>

      <div className="space-y-3 p-4">
        {rows.map((row) => (
          <article
            key={row.client}
            className="rounded-md border border-[#E5E5E5] bg-white p-3"
          >
            <div className="flex items-start justify-between gap-2 border-l-2 border-l-[#1B4332] pl-2">
              <div>
                <p className="text-sm font-medium text-[#0D0D0D]">{row.client}</p>
                <p className="mt-0.5 text-xs text-[#6B6B6B]">{row.amount}</p>
              </div>
              <span className="rounded border border-[#1B4332]/30 bg-[#1B4332]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#1B4332]">
                {row.days}d
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[#E5E5E5] pt-2.5">
              <span className="text-[10px] text-[#6B6B6B]">Reminder</span>
              <span className="text-[10px] font-medium text-[#1B4332]">
                Draft ready
              </span>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}
