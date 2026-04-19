import { getQuickBooksCompanyApiBase } from "@/lib/quickbooks/api-base";
import type { QuickBooksToken } from "@/lib/types";

export type QbInvoiceLine = {
  Id?: string;
  Amount?: number;
  DetailType?: string;
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

/** Optional: fetch customer email by id */
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
