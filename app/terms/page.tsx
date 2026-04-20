import type { Metadata } from "next";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Terms of Service — Paid",
  description:
    "Terms governing use of Paid’s B2B invoice follow-up service at paid-app.com.",
};

const section = "mt-12 border-t border-white/[0.08] pt-12 first:mt-0 first:border-0 first:pt-0";
const h2 = "font-display text-2xl tracking-tight text-paid-mist";
const p = "mt-4 text-sm leading-relaxed text-paid-mist/75";
const ul = "mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-paid-mist/75";

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service" lastUpdated="April 18, 2026">
      <div className={section}>
        <h2 className={h2}>Agreement to these terms</h2>
        <p className={p}>
          These Terms of Service (“Terms”) govern access to and use of Paid’s
          websites, applications, and related services (the “Service”) offered by
          Paid and operated at paid-app.com. By creating an account, clicking to
          accept, or using the Service, you agree to these Terms on behalf of
          yourself and, if applicable, the business or other legal entity you
          represent (“you” or “Customer”). If you do not agree, do not use the
          Service.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Description of the Service</h2>
        <p className={p}>
          Paid is a B2B software product that connects to accounting and email
          systems—such as Intuit QuickBooks and Google Gmail—to help professional
          services firms identify overdue invoices and prepare or send follow-up
          communications. Features may include syncing open receivables,
          AI-assisted drafting of reminders, a Gmail add-on, and related
          workflow tools. We may modify or discontinue features with reasonable
          notice where practicable.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Accounts and eligibility</h2>
        <p className={p}>
          You must provide accurate registration information and keep credentials
          confidential. You are responsible for all activity under your account.
          You must be at least 18 years old and authorized to bind your
          organization. Notify us promptly of any unauthorized use.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Third-party integrations</h2>
        <p className={p}>
          The Service relies on connections to third-party platforms (including
          QuickBooks and Gmail). Your use of those platforms remains subject to
          their respective terms and privacy policies. You grant Paid permission
          to access and use data from connected accounts solely as needed to
          provide the Service. You are responsible for:
        </p>
        <ul className={ul}>
          <li>
            Maintaining valid subscriptions or licenses with Intuit, Google, and
            any other providers you connect.
          </li>
          <li>
            Ensuring you have the right to share client and invoice data with
            Paid for the purposes described in our Privacy Policy.
          </li>
          <li>
            Complying with laws applicable to your communications with debtors or
            clients (including licensing, debt collection, and marketing rules).
          </li>
        </ul>
        <p className={p}>
          If a provider revokes access or changes APIs, features may be limited
          until you reconnect or we update the Service.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Customer content and license</h2>
        <p className={p}>
          You retain ownership of data you submit or that we sync on your
          behalf (“Customer Content”). You grant Paid a non-exclusive license to
          host, process, transmit, and display Customer Content solely to provide
          and improve the Service, enforce these Terms, and comply with law. You
          represent that you have all rights necessary to grant this license.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Acceptable use</h2>
        <p className={p}>You agree not to:</p>
        <ul className={ul}>
          <li>
            Use the Service unlawfully, fraudulently, or to harass individuals.
          </li>
          <li>
            Send deceptive, defamatory, or misleading communications through the
            Service.
          </li>
          <li>
            Attempt to probe, scan, or test the vulnerability of the Service or
            breach security.
          </li>
          <li>
            Reverse engineer or copy the Service except where permitted by law.
          </li>
          <li>
            Resell or sublicense the Service without our written agreement.
          </li>
        </ul>
      </div>

      <div className={section}>
        <h2 className={h2}>Fees, payment, and cancellation</h2>
        <p className={p}>
          If you subscribe to a paid plan, fees, billing cycles, and taxes are
          as described at checkout or in an order form. Unless otherwise stated,
          fees are non-refundable except as required by law or expressly stated
          in writing. We may change pricing with advance notice before a renewal
          term.
        </p>
        <p className={p}>
          You may cancel your subscription at any time from your account or by
          contacting us. Cancellation stops future charges as of the end of your
          current billing period unless otherwise stated at checkout.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Intellectual property</h2>
        <p className={p}>
          Paid and its licensors own the Service, including software, branding,
          and documentation. Except for the limited rights expressly granted,
          these Terms do not transfer any intellectual property rights to you.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Disclaimer of warranties</h2>
        <p className={p}>
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM
          EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, WHETHER EXPRESS,
          IMPLIED, OR STATUTORY, INCLUDING MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE
          SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT REMINDERS WILL
          RESULT IN PAYMENT. YOU ARE SOLELY RESPONSIBLE FOR THE CONTENT AND
          TIMING OF OUTBOUND COMMUNICATIONS TO YOUR CLIENTS.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Limitation of liability</h2>
        <p className={p}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL PAID’S TOTAL
          LIABILITY ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE
          EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US FOR THE SERVICE IN
          THE TWELVE (12) MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED U.S.
          DOLLARS ($100). WE ARE NOT LIABLE FOR ANY INDIRECT, INCIDENTAL,
          SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR LOST PROFITS, DATA,
          OR GOODWILL, EVEN IF ADVISED OF THE POSSIBILITY. SOME JURISDICTIONS DO
          NOT ALLOW CERTAIN LIMITATIONS; IN THOSE CASES OUR LIABILITY IS LIMITED
          TO THE FULLEST EXTENT PERMITTED BY LAW.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Indemnity</h2>
        <p className={p}>
          You will defend, indemnify, and hold harmless Paid and its affiliates,
          officers, and employees from claims, damages, and costs (including
          reasonable attorneys’ fees) arising from your Customer Content, your
          use of the Service in violation of these Terms or law, or your
          communications with third parties using the Service.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Suspension and termination</h2>
        <p className={p}>
          We may suspend or terminate access if you materially breach these
          Terms, create risk or legal exposure, or for extended non-payment. You
          may stop using the Service at any time. Provisions that by their nature
          should survive (including limitations of liability, indemnity, and
          governing law) will survive termination.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Governing law and disputes</h2>
        <p className={p}>
          These Terms are governed by the laws of the State of Delaware, USA,
          excluding conflict-of-law rules. Courts in Delaware (or the U.S.
          federal courts located there, where jurisdiction permits) shall have
          exclusive venue for disputes, except that either party may seek
          injunctive relief in any court of competent jurisdiction.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>General</h2>
        <p className={p}>
          These Terms constitute the entire agreement between you and Paid
          regarding the Service and supersede prior understandings. If a provision
          is unenforceable, the remainder stays in effect. Failure to enforce a
          provision is not a waiver. You may not assign these Terms without our
          consent; we may assign them in connection with a merger or sale.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Privacy</h2>
        <p className={p}>
          Our Privacy Policy explains how we collect and use personal
          information. It is incorporated into these Terms by reference.
        </p>
      </div>

      <div className={section}>
        <h2 className={h2}>Contact</h2>
        <p className={p}>
          For questions about these Terms, contact us at{" "}
          <a
            href="mailto:legal@paid-app.com"
            className="text-[#00E5A0] underline decoration-[#00E5A0]/40 underline-offset-2 hover:decoration-[#00E5A0]"
          >
            legal@paid-app.com
          </a>
          .
        </p>
      </div>
    </LegalPageShell>
  );
}
