import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy — Paid",
  description:
    "How Paid collects, uses, and protects data when you connect QuickBooks and Gmail.",
};

const section = "mt-12 border-t border-[#E5E5E5] pt-12 first:mt-0 first:border-0 first:pt-0";
const h2 = "font-display text-2xl tracking-tight text-[#0D0D0D]";
const h3 = "mt-8 font-semibold text-[#0D0D0D]";
const p = "mt-4 text-sm leading-relaxed text-[#6B6B6B]";
const ul = "mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#6B6B6B]";

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated="May 3, 2026">
      {/* Updated for Workspace Marketplace OAuth verification (Limited Use). */}
      <div className={section}>
        <h2 className={h2}>Introduction</h2>
        <p className={p}>
          Paid provides a B2B software service that helps professional services
          firms follow up on overdue invoices. This Privacy Policy describes how
          we collect, use, store, and share information when you use our
          website at paid-app.com and related services (the &ldquo;Service&rdquo;).
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Information we collect</h2>
        <h3 className={h3}>Account and contact data</h3>
        <p className={p}>
          Information you provide when you register or contact us, such as your
          name, work email address, and authentication details.
        </p>
        <h3 className={h3}>Integration data</h3>
        <ul className={ul}>
          <li>
            <strong className="text-[#0D0D0D]">QuickBooks:</strong> open
            receivables, invoice amounts, due dates, customer names, contact
            details, line descriptions, and identifiers needed to display
            balances and draft reminders.
          </li>
          <li>
            <strong className="text-[#0D0D0D]">Gmail:</strong> we access your
            Google account only as described below.
          </li>
        </ul>
        <h3 className={h3}>Usage data</h3>
        <p className={p}>
          Standard log and device information (browser type, IP, timestamps)
          for security, troubleshooting, and aggregate usage analysis.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>How we use Gmail access</h2>
        <p className={p}>
          Paid requests Google OAuth permissions only for the scopes we need.
          Paid does not use any restricted Google scope. The web app uses
          userinfo.email solely to bind the OAuth grant to the correct Paid
          account. The Paid Gmail Add-On uses gmail.addons.execute,
          gmail.addons.current.message.metadata,
          gmail.addons.current.message.readonly, and
          gmail.addons.current.action.compose so it can render contextual cards
          and prepare drafts inside Gmail. Paid never sends email
          programmatically; when you approve a reminder, Paid opens Gmail&rsquo;s
          compose window prefilled with the draft and you click Send yourself
          in Gmail. The add-on reads the body of a single open message only
          when you click &ldquo;Classify reply.&rdquo; We do not read other messages,
          scan your inbox in the background, or use Gmail data for
          advertising, profiling, or unrelated purposes.
        </p>
        <ul className={ul}>
          <li>
            Prepare payment reminder drafts you initiate or approve. The
            reminder is opened prefilled in your Gmail compose window; you
            click Send in Gmail so the message goes from your real address,
            not from an unrelated domain.
          </li>
          <li>
            On your explicit click, read the plain-text body of one open Gmail
            message to classify a client&rsquo;s reply (e.g., &ldquo;will pay next
            week&rdquo;) and suggest a next step. Raw bodies are processed in
            transit and not retained.
          </li>
          <li>Confirm the email address you authorized.</li>
        </ul>
        <p className={p}>
          You may revoke Paid&rsquo;s access at any time in your Google Account
          security settings.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Limited Use of Google user data</h2>
        <p className={p}>
          Paid&rsquo;s use and transfer to any other app of information received
          from Google APIs will adhere to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy#limited-use"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Specifically:
        </p>
        <ul className={ul}>
          <li>
            We use Google user data only to provide or improve user-facing
            features that are prominent in the Paid UI (sending reminders you
            approve, classifying a reply you opened, confirming your email).
          </li>
          <li>
            We do not transfer Google user data to third parties except as
            necessary to provide those features, to comply with applicable law,
            or as part of a merger or acquisition with notice to users.
          </li>
          <li>
            We do not use Google user data for serving advertisements,
            including retargeting, personalized, or interest-based ads.
          </li>
          <li>
            We do not allow humans to read Google user data unless we have your
            affirmative agreement, it is necessary for security (such as
            investigating abuse), to comply with law, or for aggregated and
            anonymized operations.
          </li>
          <li>
            We do not use Google user data to develop, improve, or train
            generalized AI/ML models. Where AI is used inside Paid (e.g., to
            draft a reminder), prompts are sent to our model provider only to
            return that response to you and are not used to train models that
            serve other customers.
          </li>
        </ul>
      </div>

      <div className={section}>
        <h2 className={h2}>How we use QuickBooks data</h2>
        <p className={p}>
          We read unpaid invoices and related customer records you authorize,
          and use them only to operate Paid&rsquo;s invoice follow-up features.
          We do not advertise unrelated products to your clients.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Sharing</h2>
        <p className={p}>
          We use service providers (hosting, authentication, email delivery,
          analytics, AI inference) who process data on our instructions. We may
          disclose information if required by law or to protect users.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Data retention and deletion</h2>
        <p className={p}>
          We retain account and integration data while your account is active.
          Disconnecting an integration deletes or de-identifies its tokens and
          cached data within a reasonable period. To delete your account or
          request data export, email{" "}
          <a
            href="mailto:privacy@paid-app.com"
            className="text-[#1B4332] underline"
          >
            privacy@paid-app.com
          </a>
          ; we process within 30 days. We may retain anonymized aggregates and
          records required by law (tax, accounting) without time limit.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Security</h2>
        <p className={p}>
          We implement administrative, technical, and organizational measures
          designed to protect information against unauthorized access, loss, or
          misuse. No method of transmission over the Internet is completely
          secure.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Your rights</h2>
        <p className={p}>
          Depending on your jurisdiction, you may have rights to access,
          correct, delete, or export personal data; to object to or restrict
          processing; and to withdraw consent. To exercise these rights,
          contact privacy@paid-app.com. California residents have rights under
          CCPA/CPRA; Paid does not &ldquo;sell&rdquo; personal information for money. EEA,
          UK, and Swiss users are processed under GDPR with appropriate
          safeguards for international transfers.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Children</h2>
        <p className={p}>
          The Service is not directed to individuals under 16, and we do not
          knowingly collect their information.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Changes</h2>
        <p className={p}>
          We may update this policy. We will update the &ldquo;Last updated&rdquo; date
          and, for material changes, provide additional notice.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Contact</h2>
        <p className={p}>
          Privacy questions or requests:{" "}
          <a
            href="mailto:privacy@paid-app.com"
            className="text-[#1B4332] underline decoration-[#1B4332]/40 underline-offset-2 hover:decoration-[#1B4332]"
          >
            privacy@paid-app.com
          </a>
          .
        </p>
      </div>
    </LegalPageShell>
  );
}
