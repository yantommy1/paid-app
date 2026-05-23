import { getQuickBooksCompanyApiBase } from "@/lib/quickbooks/api-base";
import type { QuickBooksToken } from "@/lib/types";

export type QbSalesItemLineDetail = {
  Qty?: number;
  UnitPrice?: number;
};

/** One row in Invoice.Line — often SalesItemLineDetail with Description + Qty/UnitPrice */
export type QbInvoiceLine = {
  Id?: string;
  LineNum?: number;
  Amount?: number;
  DetailType?: string;
  Description?: string;
  SalesItemLineDetail?: QbSalesItemLineDetail;
};

export type QbInvoice = {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  Balance?: number;
  CustomerRef?: { value: string; name?: string };
  BillEmail?: { Address?: string };
  /** Invoice-level note to customer */
  CustomerMemo?: { value?: string; Value?: string };
  Line?: QbInvoiceLine[];
};

function qbHeaders(token: QuickBooksToken) {
  return {
    Authorization: `Bearer ${token.access_token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

/** Fetch unpaid invoices via QuickBooks query API */
export async function fetchUnpaidInvoices(
  token: QuickBooksToken
): Promise<QbInvoice[]> {
  const realm = token.realm_id;
  const base = getQuickBooksCompanyApiBase();
  const query = encodeURIComponent(
    "SELECT * FROM Invoice WHERE Balance > '0' MAXRESULTS 1000"
  );
  const url = `${base}/${realm}/query?query=${query}&minorversion=65`;
  const res = await fetch(url, { headers: qbHeaders(token) });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`QuickBooks query failed: ${res.status} ${t}`);
  }
  const json = (await res.json()) as {
    QueryResponse?: { Invoice?: QbInvoice[] };
  };
  const list = json.QueryResponse?.Invoice ?? [];
  return Array.isArray(list) ? list : [list];
}

/** Optional: fetch customer email by id (single, used as fallback) */
export async function fetchCustomerEmail(
  token: QuickBooksToken,
  customerId: string
): Promise<string | null> {
  const realm = token.realm_id;
  const base = getQuickBooksCompanyApiBase();
  const url = `${base}/${realm}/customer/${customerId}?minorversion=65`;
  const res = await fetch(url, { headers: qbHeaders(token) });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    Customer?: { PrimaryEmailAddr?: { Address?: string } };
  };
  return json.Customer?.PrimaryEmailAddr?.Address ?? null;
}

/**
 * Batch-fetch Customer.PrimaryEmailAddr.Address for many ids in one query.
 * Replaces N+1 per-invoice fetchCustomerEmail loop in sync — at 50+ unpaid
 * invoices without BillEmail this turns a 10s+ sync into a sub-second one.
 *
 * QuickBooks query API accepts IN ('a','b',...). We chunk to 100 ids per
 * request to keep the URL within QBO's URL length limit.
 */
export async function fetchCustomerEmailsByIds(
  token: QuickBooksToken,
  customerIds: string[]
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (customerIds.length === 0) return out;

  const realm = token.realm_id;
  const base = getQuickBooksCompanyApiBase();
  const CHUNK = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < customerIds.length; i += CHUNK) {
    chunks.push(customerIds.slice(i, i + CHUNK));
  }

  // Run chunks in parallel — each is a distinct QBO query call.
  const results = await Promise.allSettled(
    chunks.map(async (ids) => {
      const quoted = ids.map((id) => `'${id.replace(/'/g, "")}'`).join(",");
      const query = encodeURIComponent(
        `SELECT Id, PrimaryEmailAddr FROM Customer WHERE Id IN (${quoted})`
      );
      const url = `${base}/${realm}/query?query=${query}&minorversion=65`;
      const res = await fetch(url, { headers: qbHeaders(token) });
      if (!res.ok) return [] as Array<{ Id: string; PrimaryEmailAddr?: { Address?: string } }>;
      const json = (await res.json()) as {
        QueryResponse?: {
          Customer?: Array<{ Id: string; PrimaryEmailAddr?: { Address?: string } }>;
        };
      };
      const arr = json.QueryResponse?.Customer ?? [];
      return Array.isArray(arr) ? arr : [arr];
    })
  );

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const c of r.value) {
      const addr = c.PrimaryEmailAddr?.Address?.trim();
      if (c.Id && addr) out[c.Id] = addr;
    }
  }
  return out;
}
