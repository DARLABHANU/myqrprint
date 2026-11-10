import { ArrowLeft, QrCode } from "lucide-react";

const policyText = {
  terms: {
    title: "Terms of use",
    intro: "Draft terms for the Printly local development preview.",
    sections: [
      ["Preview status", "Printly is a development preview. It supports shop accounts, customer file uploads, print-order creation, and manual order status updates. It does not send jobs to a physical printer."],
      ["Your account and shop", "You are responsible for keeping your sign-in details private and for entering accurate shop details and print rates. One owner account currently manages one shop."],
      ["Payments", "Customers pay the shop directly using its UPI details or cash at the counter. Printly does not collect payment or verify UPI transactions. A shopkeeper must confirm receipt before approving an order."],
      ["Customer orders", "Customers may upload PDF or image files to a shop page. Orders and pickup codes are stored so the shop can review, download, and manage the print job."],
      ["Availability and changes", "This preview is provided for development and evaluation, may change, and is not a service-level or data-retention commitment."],
      ["Before public launch", "These draft terms need review and approval for the intended business, jurisdiction, payment flow, and production service before public use."],
    ],
  },
  privacy: {
    title: "Privacy notice",
    intro: "Draft privacy information for the Printly local development preview.",
    sections: [
      ["Information currently stored", "The current build stores the shop owner's name, email, mobile number, shop profile, selected print options, rates, UPI ID if supplied, and account/session records in the MongoDB database configured by the operator."],
      ["Password and session", "Passwords are stored as bcrypt hashes. Sign-in uses an HTTP-only session cookie. Do not use a production password in this local preview."],
      ["Customer files and payments", "Customers can upload PDF and image files for a print order. Files are stored privately on the server and are made available to the owning shop for fulfillment. Printly does not process payments; UPI is paid directly to the shop and cash is collected at the counter."],
      ["Local data and deletion", "Pending uploads and unpaid orders expire after the retention period configured by the shop owner. Files for active jobs are retained until the job reaches a terminal state, then removed by cleanup. The database is configured by the operator, and there is no account-deletion interface."],
      ["Before public launch", "This draft is not a legal compliance assessment. Review the final data flows, retention, security, service providers, and applicable privacy obligations before production."],
    ],
  },
};

export function LegalPage({ kind }: { kind: keyof typeof policyText }) {
  const policy = policyText[kind];
  return (
    <div className="legal-page">
      <a className="brand account-brand" href="/">
        <span className="brand-mark"><QrCode size={20} /></span>
        <span>printly<span className="brand-period">.</span></span>
      </a>
      <main className="legal-card">
        <a className="back-link" href="/"><ArrowLeft size={15} /> Back to home</a>
        <div className="draft-badge">DEVELOPMENT DRAFT · NOT FOR PRODUCTION</div>
        <h1>{policy.title}</h1>
        <p className="legal-intro">{policy.intro}</p>
        {policy.sections.map(([title, text]) => <section key={title}><h2>{title}</h2><p>{text}</p></section>)}
      </main>
    </div>
  );
}
