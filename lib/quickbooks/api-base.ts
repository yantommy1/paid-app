/**
 * QuickBooks Online API base path for a company (`/v3/company`).
 * Sandbox OAuth tokens only work against the sandbox API host — using production
 * URLs causes 403 / error 3100 ApplicationAuthorizationFailed.
 *
 * Set `QUICKBOOKS_USE_SANDBOX=true` when using Intuit *Development* keys and a sandbox company.
 * Omit or set `false` for production app keys + live QuickBooks companies.
 */
export function getQuickBooksCompanyApiBase(): string {
  if (process.env.QUICKBOOKS_USE_SANDBOX === "true") {
    return "https://sandbox-quickbooks.api.intuit.com/v3/company";
  }
  return "https://quickbooks.api.intuit.com/v3/company";
}
