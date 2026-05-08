import Link from "next/link";

type Props = {
  message: string;
  occurredAt: string | null;
};

/**
 * QuickBooks sync failed during the last cron run. The cron writes the error
 * onto users.quickbooks_sync_error and clears it on the next success, so this
 * banner self-heals — once the user reconnects (or QB recovers), the next
 * cron pass wipes the field and the banner disappears.
 *
 * Most common cause: QB refresh token revoked (user disconnected the company
 * in QB). The remedy is always "reconnect from Settings" — link straight there.
 */
export function DashboardQuickBooksSyncBanner({ message, occurredAt }: Props) {
  let occurredCopy = "";
  if (occurredAt) {
    try {
      const ms = Date.now() - new Date(occurredAt).getTime();
      const hours = Math.round(ms / 3600000);
      occurredCopy =
        hours < 1
          ? " (less than an hour ago)"
          : hours < 24
            ? ` (${hours} hour${hours === 1 ? "" : "s"} ago)`
            : ` (${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? "" : "s"} ago)`;
    } catch {
      // ignore — banner still useful without timing context
    }
  }

  return (
    <div className="mb-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">QuickBooks sync failed{occurredCopy}.</p>
          <p className="mt-1 text-amber-800">
            New invoices may not appear and existing balances may be stale.
          </p>
          <p className="mt-1 font-mono text-xs text-amber-700">{message}</p>
        </div>
        <Link
          href="/settings"
          className="border border-amber-700 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          Reconnect QuickBooks
        </Link>
      </div>
    </div>
  );
}
