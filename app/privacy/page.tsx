import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy — Paid",
  description:
    "How Paid collects, uses, and protects data when you connect QuickBooks and Gmail.",
};

const section = "mt-12 border-t border-white/[0.08] pt-12 first:mt-0 first:border-0 first:pt-0";
const h2 = "font-display text-2xl tracking-tight text-paid-mist";
const h3 = "mt-8 font-semibold text-paid-mist";
const p = "mt-4 text-sm leading-relaxed text-paid-mist/75";
const ul = "mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-paid-mist/75";

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated="April 18, 2026">
      <div className={section}>
        <h2 className={h2}>Introduction</h2>
        <p className={p}>
          Paid (“we,” “us,” or “our”) provides a business-to-business (“B2B”)
          software service that helps professional services firms follow up on
          overdue invoices. This Privacy Policy describes how we collect, use,
          store, and share information when you use our website at paid-app.com
          and related services (collectively, the “Service”). If you use the
          Service on behalf of a company or other organization, that entity is
          the customer and you represent that you have authority to bind it to
          this policy.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Information we collect</h2>
        <h3 className={h3}>Account and contact data</h3>
        <p className={p}>
          We collect information you provide when you register or communicate
          with us, such as your name, work email address, and authentication
          details (for example, when you sign in with a sign-in link, password, or
          single sign-on, depending on what we support).
        </p>
        <h3 className={h3}>Integration and financial data</h3>
        <p className={p}>
          When you connect third-party services, we receive and store data
          needed to operate the Service:
        </p>
        <ul className={ul}>
          <li>
            <strong className="text-paid-mist/90">QuickBooks:</strong> We sync
            information about your open receivables, such as invoice amounts,
            due dates, customer or client names, contact details on file, line
            descriptions, and related identifiers needed to display balances
            and draft reminders.
          </li>
          <li>
            <strong className="text-paid-mist/90">Gmail:</strong> We access your
            Google account only as described in the section below.
          </li>
        </ul>
        <h3 className={h3}>Usage and technical data</h3>
        <p className={p}>
          We collect standard log and device information (such as browser type,
          IP address, and timestamps) to secure the Service, troubleshoot
          issues, and understand aggregate usage.
        </p>
        <h3 className={h3}>Support and communications</h3>
        <p className={p}>
          If you contact us, we retain the content of those messages and our
          responses.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>How we use Gmail access</h2>
        <p className={p}>
          Paid requests Google OAuth permissions only for the scopes we need to
          provide the Service. Depending on configuration, this may include the
          ability to send email on your behalf and to read your email address for
          identification. We use Gmail access to send payment reminders only. We
          do not read the content of your inbox or messages for marketing,
          profiling, or unrelated purposes.
        </p>
        <ul className={ul}>
          <li>
            Send payment reminder messages that you initiate or approve (for
            example, drafts you send from the product or Gmail add-on), from your
            connected Gmail address so communications appear as coming from you
            or your firm—not from an unrelated domain.
          </li>
          <li>
            Associate activity with the correct Paid account (for example,
            confirming the address you authorized).
          </li>
        </ul>
        <p className={p}>
          We do not use your Gmail messages to train third-party artificial
          intelligence models for unrelated purposes, and we do not sell the
          content of your email. Access is limited to what is reasonably necessary
          to provide invoice follow-up features you choose to use.
        </p>
        <p className={p}>
          You may revoke Paid’s access to your Google account at any time
          through your Google Account security settings; doing so may limit or
          disable features that depend on Gmail.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>How we use QuickBooks data</h2>
        <p className={p}>
          We connect to Intuit QuickBooks to read unpaid invoice and related
          customer records you authorize. We use this data only to operate
          invoice follow-up features in Paid—not for unrelated advertising or
          resale. We use this data to:
        </p>
        <ul className={ul}>
          <li>Show balances, aging, and invoice details in the Service.</li>
          <li>
            Draft reminder language that reflects amounts owed, due dates, and
            related context you have synced.
          </li>
          <li>Operate automation and reporting features you enable.</li>
        </ul>
        <p className={p}>
          We do not use QuickBooks data to advertise unrelated products to your
          clients. Processing is for providing the Service to you as our
          customer and, where applicable, supporting security and legal
          compliance.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Legal bases and sharing</h2>
        <p className={p}>
          We process personal data as necessary to perform our contract with
          you, to comply with law, and for our legitimate interests in operating
          a secure B2B product (such as fraud prevention and service
          improvement), where not overridden by your rights.
        </p>
        <p className={p}>
          We use service providers (for example, hosting, authentication, email
          delivery, and analytics) who process data on our instructions. We may
          disclose information if required by law or to protect our rights and
          the safety of users.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Data retention</h2>
        <p className={p}>
          We retain account and integration data for as long as your account is
          active or as needed to provide the Service. When you cancel your
          account, we delete your data on request where feasible, subject to
          short backup cycles and legal holds. If you disconnect an integration, we
          may delete or de-identify associated tokens and cached data within a
          reasonable period.
        </p>
        <p className={p}>
          After you close your account, we retain information only as long as
          necessary for legitimate business purposes (such as resolving
          disputes, enforcing agreements, or meeting tax and accounting
          obligations), then delete or anonymize it unless a longer period is
          required by law.
        </p>
        <p className={p}>
          Aggregated or de-identified information may be retained without time
          limit where it no longer identifies an individual.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Security</h2>
        <p className={p}>
          We implement administrative, technical, and organizational measures
          designed to protect information against unauthorized access, loss, or
          misuse. No method of transmission over the Internet is completely
          secure; we encourage strong passwords and prompt revocation of access
          when devices are lost or staff leave.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Your rights and choices</h2>
        <p className={p}>
          Depending on where you live, you may have rights to access, correct,
          delete, or export personal data we hold about you; to object to or
          restrict certain processing; and to withdraw consent where processing
          is consent-based. You may also have the right to lodge a complaint with
          a supervisory authority.
        </p>
        <p className={p}>
          To exercise these rights, contact us using the details below. We will
          respond within the time required by applicable law. You can also
          update some information directly in the Service. You may delete your
          account at any time; see Data retention for how we handle deletion.
        </p>
        <p className={p}>
          If you are a California resident, you may have additional rights under
          the CCPA/CPRA regarding categories of data collected, sale or sharing,
          and non-discrimination for exercising rights. Paid does not “sell”
          personal information in the conventional sense of exchanging data for
          money; we use data to provide the Service.
        </p>
        <p className={p}>
          If you are in the European Economic Area, UK, or Switzerland, we
          process data in line with GDPR requirements and appropriate safeguards
          for international transfers where applicable.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>International transfers</h2>
        <p className={p}>
          We may process and store information in the United States and other
          countries where we or our providers operate. By using the Service, you
          understand that data may be transferred to jurisdictions with different
          data protection rules, subject to safeguards we put in place where
          required.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Children</h2>
        <p className={p}>
          The Service is not directed to individuals under 16, and we do not
          knowingly collect their personal information.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Changes to this policy</h2>
        <p className={p}>
          We may update this Privacy Policy from time to time. We will post the
          revised version on this page and update the “Last updated” date. If
          changes are material, we will provide additional notice as appropriate
          (for example, by email or in-product notice).
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Contact</h2>
        <p className={p}>
          For privacy questions or requests regarding this policy or your data,
          contact us at{" "}
          <a
            href="mailto:privacy@paid-app.com"
            className="text-[#00E5A0] underline decoration-[#00E5A0]/40 underline-offset-2 hover:decoration-[#00E5A0]"
          >
            privacy@paid-app.com
          </a>
          .
        </p>
      </div>
    </LegalPageShell>
  );
}
