import type { InvoiceStatus } from "@/lib/types";

type Row = {
  amount: unknown;
  days_overdue: number;
  client_email: string | null;
  status: InvoiceStatus | string;
};

export type CohortBuckets = {
  current: { count: number; total: number };
  d30: { count: number; total: number };
  d60: { count: number; total: number };
  d90: { count: number; total: number };
};

export type SidebarHeader = {
  totalOutstanding: number;
  overdueClientCount: number;
  avgDaysOverdue: number;
};

/** Match Gmail sidebar / summary cohort bucketing. */
export function computeCohorts(rows: Row[]): CohortBuckets {
  const cohorts: CohortBuckets = {
    current: { count: 0, total: 0 },
    d30: { count: 0, total: 0 },
    d60: { count: 0, total: 0 },
    d90: { count: 0, total: 0 },
  };

  for (const r of rows) {
    const amt = Number(r.amount);
    if (r.days_overdue >= 90 || r.status === "overdue_90") {
      cohorts.d90.count++;
      cohorts.d90.total += amt;
    } else if (r.days_overdue >= 60 || r.status === "overdue_60") {
      cohorts.d60.count++;
      cohorts.d60.total += amt;
    } else if (r.days_overdue >= 30 || r.status === "overdue_30") {
      cohorts.d30.count++;
      cohorts.d30.total += amt;
    } else {
      cohorts.current.count++;
      cohorts.current.total += amt;
    }
  }

  return cohorts;
}

/** Header stats: all open balances, unique clients with 30d+ overdue, avg days among 30d+ invoices. */
export function computeSidebarHeader(rows: Row[]): SidebarHeader {
  let totalOutstanding = 0;
  const overdueClientEmails = new Set<string>();
  let overdueDaysSum = 0;
  let overdueInvoiceCount = 0;

  for (const r of rows) {
    const amt = Number(r.amount);
    totalOutstanding += amt;
    if (r.days_overdue >= 30) {
      const em = (r.client_email || "").trim().toLowerCase();
      if (em) overdueClientEmails.add(em);
      overdueDaysSum += r.days_overdue;
      overdueInvoiceCount++;
    }
  }

  return {
    totalOutstanding,
    overdueClientCount: overdueClientEmails.size,
    avgDaysOverdue:
      overdueInvoiceCount > 0
        ? Math.round(overdueDaysSum / overdueInvoiceCount)
        : 0,
  };
}
