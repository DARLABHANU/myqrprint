import { ArrowLeft, QrCode } from "lucide-react";

type Policy = { title: string; intro: string; sections: Array<[string, string]> };

const policyText: Record<"terms" | "privacy", Policy> = {
  terms: {
    title: "Terms of service",
    intro: "Effective November 15, 2026. These terms describe the UrQrPrint platform and the responsibilities of shop owners and customers.",
    sections: [
      ["Platform operator", "UrQrPrint is operated by Daarla Bhanumurthy. Business address: Block 5, Lankelapalem, Paravada Mandal, Anakapalle District, Andhra Pradesh 531019, India."],
      ["The service", "UrQrPrint provides shop accounts, QR order pages, file upload and print-option selection, order and payment status tools, and a Windows desktop agent for dispatching jobs to printers configured by a shop. Availability of individual features depends on the shop’s settings, connected agent, printer, and payment configuration."],
      ["Shop accounts", "Shop owners must provide accurate account and shop information, keep login credentials secure, and promptly report suspected unauthorized access. A shop owner is responsible for the rates, print options, availability, customer instructions, settlement destination, and staff access configured for their shop."],
      ["Customer orders and fulfillment", "Customers are responsible for uploading files they are authorized to print and checking the selected files, page ranges, paper, colour, sides, copies, and quoted price before submitting an order. The selected shop provides the printing service, sets its prices, and handles fulfillment, pickup, reprints, and order-specific customer support. Printing depends on shop availability and functioning equipment; an order receipt is not proof that paper was successfully printed."],
      ["Payments and shop settlements", "Where enabled, online customer payments are processed by Razorpay to the UrQrPrint payment account. Cash-at-counter orders are paid to the shop at pickup and are not collected by UrQrPrint. Razorpay collections are accounted for separately from shop payouts; shop settlements are processed by the UrQrPrint administrator to the shop’s saved settlement details and recorded in the dashboard. A settlement request or dashboard status is not a bank transfer confirmation; shops should confirm receipt only after checking their account."],
      ["Cancellation and refunds", "An unpaid order may expire or be cancelled. Cancelling a paid order in the dashboard does not itself refund the customer. For an online payment, submit a refund request through the platform support contact after providing the order reference and Razorpay payment reference. The request is reviewed against the order and fulfillment status; any approved refund is initiated through the payment provider and the bank or payment method may take additional time to post it. Cash refunds and reprints are handled by the shop. See the Refund and Cancellation Policy for the request process."],
      ["Uploaded content and acceptable use", "Do not upload unlawful, harmful, infringing, or abusive material, or attempt to access another person’s files or account. You authorize the selected shop and the service providers needed to operate UrQrPrint to handle submitted files only for order processing, support, security, and storage/cleanup. The shop must restrict access to customer documents and print only as requested and permitted by law."],
      ["Plans and fees", "Any shop plan price, order limit, duration, and payment method shown at checkout or on the subscription page applies to that plan. Shop subscriptions are separate from customer print-order payments. Taxes, if applicable, will be shown or handled as required by law."],
      ["Service changes and limits", "We may update or temporarily suspend features for maintenance, safety, legal, or operational reasons. We will use reasonable care to protect the service, but cannot guarantee uninterrupted access or successful printing by a shop’s computer, network, or printer."],
      ["Contact", "For a customer print job, contact the selected shop using the contact details on its order page. For account, payment, privacy, or platform issues, use the platform support contact published on the Contact page. These terms do not limit rights that cannot legally be excluded."],
    ],
  },
  privacy: {
    title: "Privacy policy",
    intro: "Effective November 15, 2026. This policy explains the information UrQrPrint uses to operate shop accounts and customer print orders.",
    sections: [
      ["Who operates UrQrPrint", "UrQrPrint is operated by Daarla Bhanumurthy, at Block 5, Lankelapalem, Paravada Mandal, Anakapalle District, Andhra Pradesh 531019, India. Contact appzonux@gmail.com or +91 75693 59717 for privacy requests."],
      ["Information we handle", "Depending on the features used, this includes shop owner name, email, mobile number, shop profile and address; account and session data; customer name or mobile number when a shop enables those fields; uploaded PDFs and images; selected print settings, order references, payment status and payment-provider references; printer/agent status; settlement details provided by a shop; and basic technical and security logs."],
      ["How information is used", "We use this information to create and secure accounts, display a shop’s order page, calculate prices, transmit and manage print orders, confirm payment status, support shop settlements, provide customer support, prevent abuse, maintain the service, and meet legal obligations. We do not use customer print files for advertising."],
      ["Who receives information", "An order’s files and order details are available to the selected shop and its authorized staff for fulfillment. Razorpay receives the information necessary to create and verify an online payment. Hosting, database, email, identity, and file-storage providers (which may include Render, MongoDB Atlas, Google, and Cloudinary, depending on configuration) process data for those functions. We do not sell personal information. We may disclose information when legally required or to protect users and the service."],
      ["File storage and deletion", "Uploaded files are stored with the configured file-storage service; if cloud storage is unavailable, the server may temporarily use its configured local storage. The shop chooses an expiry period for unprinted uploads (15 minutes to 30 days). Files are scheduled for cleanup after expiry; files linked to active orders are retained for fulfillment. Files for completed or cancelled jobs are scheduled for prompt deletion. Some file previews use an order-specific delivery URL; anyone who obtains a live URL may be able to view that file while it remains available, so do not upload highly sensitive documents. Backups, provider caches, or technical logs may persist for a limited period under the relevant provider’s systems."],
      ["Security and account controls", "We use access controls and security measures intended to protect account and order data. No internet service can guarantee absolute security. Shop owners should protect credentials and limit staff access. Customers should avoid uploading sensitive documents unless needed for printing."],
      ["Retention of account and transaction records", "Account, order, payment, and settlement records may be retained as needed to provide the service, resolve disputes, maintain audit records, and comply with legal or accounting requirements, even after uploaded files have been deleted."],
      ["Your choices and requests", "Shop owners can update shop profile and privacy settings in the dashboard. Customers can contact the selected shop about an order. To request access, correction, or deletion of information held by the platform, contact platform support with enough detail to locate the account or order; legal, security, payment, or record-keeping requirements may limit deletion."],
      ["Policy updates and contact", "We may update this policy as the service or applicable requirements change and will post the current version on this page. For a privacy request, use the platform support contact published on the Contact page."],
    ],
  },
};

export function LegalPage({ kind }: { kind: keyof typeof policyText }) {
  const policy = policyText[kind];
  return (
    <div className="legal-page">
      <a className="brand account-brand" href="/">
        <span className="brand-mark"><QrCode size={20} /></span>
        <span>UrQrPrint<span className="brand-period">.</span></span>
      </a>
      <main className="legal-card">
        <a className="back-link" href="/"><ArrowLeft size={15} /> Back to home</a>
        <h1>{policy.title}</h1>
        <p className="legal-intro">{policy.intro}</p>
        {policy.sections.map(([title, text]) => <section key={title}><h2>{title}</h2><p>{text}</p></section>)}
        <p className="legal-contact-link">Related policy: <a href={kind === "terms" ? "/refund-policy" : "/terms"}>{kind === "terms" ? "Refund and Cancellation Policy" : "Terms of Service"}</a> · <a href="/contact">Contact</a></p>
      </main>
    </div>
  );
}
