import { useEffect } from "react";
import { ArrowLeft, ArrowRight, QrCode } from "lucide-react";

const pages: Record<string, { title: string; intro: string; sections: Array<[string, string]> }> = {
  "/features": { title: "Tools for a smoother print counter", intro: "Customers send files from their phones. Your shop sets the rates, checks payment, and manages every print job.", sections: [["Customer ordering", "Customers scan a shop QR code, upload PDFs or photos, choose print options, and see a server-calculated price before placing an order."], ["Shop control", "Configure paper sizes, print rates, payment methods, and whether the shop is currently accepting orders."], ["Order privacy", "Uploads are private to the customer session and the shop that owns the order. Expired files are removed by the cleanup service."]] },
  "/how-it-works": { title: "From QR scan to pickup", intro: "A simple browser-based flow for customers and print shops.", sections: [["1. Share your shop QR", "Print or download the QR code from shop settings and place it at your counter."], ["2. Customer uploads and configures", "The customer chooses files, paper size, colour, sides, copies, and photo layout, then reviews the quote."], ["3. Confirm payment and manage the job", "UPI is paid directly to your shop or the customer pays at the counter. Confirm payment before approving the job for printing."]] },
  "/pricing": { title: "Print prices set by your shop", intro: "Printly has no configured plan billing in this development preview. Each shop sets its own per-page and per-sheet prices.", sections: [["Direct payments", "Customers pay your shop by UPI or cash at the counter. Printly does not collect customer payments or take a per-order commission."], ["Shop rates", "Configure prices for enabled paper sizes, colour mode, and simplex or duplex printing in Shop settings."]] },
  "/faq": { title: "Frequently asked questions", intro: "Answers about ordering, payments, files, and printing.", sections: [["Do customers need an app?", "No. They open the shop page in a mobile browser using the shop QR code."], ["Does Printly verify UPI payments?", "No. The shopkeeper checks their own UPI account and confirms payment in the order queue."], ["Does the app print automatically?", "No. This preview uses manual status controls and does not connect to a physical printer."], ["How long are files kept?", "Each shop chooses its pending-file retention period. Files for active jobs remain until the job is completed or cancelled."]] },
  "/about": { title: "About Printly", intro: "Printly is a development project exploring a simpler way for local print shops to receive and manage customer print orders.", sections: [["For local shops", "Each shop gets a public order page, configurable pricing, direct payment instructions, and an order queue."], ["Development preview", "The current version is not a production printing service and does not include a printer agent or subscription billing."]] },
  "/contact": { title: "Contact your print shop", intro: "Printly routes an order to the shop shown on its customer page.", sections: [["Order or pickup questions", "Use the address and contact details shown on the shop page to ask about payment, pickup, or order changes."], ["Platform support", "Platform support details have not been configured in this development preview."]] },
  "/partner": { title: "Partner with Printly", intro: "We are exploring tools that help neighborhood print shops accept orders online.", sections: [["Shop owners", "Create an account to configure a shop and generate its customer QR code."], ["Partnership enquiries", "Partner onboarding and reseller programs are not configured in this development preview."]] },
  "/solutions": { title: "For print shops and service counters", intro: "A QR-based ordering flow can help customers send print-ready files without email or messaging apps.", sections: [["Cyber cafes", "Receive document jobs from customers using a shared shop QR."], ["Xerox shops", "Let customers select paper, colour, sides, and copies before they reach the counter."], ["CSC and digital service centers", "Keep customer print requests in a shop-managed order queue."], ["Colleges and libraries", "Give visitors a self-service way to submit print files."]] },
  "/solutions/cyber-cafe": { title: "Print ordering for cyber cafes", intro: "Give customers a simple way to submit forms and documents from their phones.", sections: [["One queue for jobs", "Review files, confirm payment, and track each job from one shop dashboard."]] },
  "/solutions/xerox-shop": { title: "QR ordering for Xerox shops", intro: "Customers choose paper, sides, copies, and colour before handing over a pickup code.", sections: [["Set your own prices", "Configure rates by paper size and print mode in shop settings."]] },
  "/solutions/csc-center": { title: "Print orders for CSC centers", intro: "Collect customer print jobs through a browser-based shop page.", sections: [["Customer privacy", "Files are stored privately and made available only to the shop handling the order."]] },
  "/solutions/college-library": { title: "Self-service printing for colleges and libraries", intro: "Let visitors upload documents from a phone and collect prints at the counter.", sections: [["Simple order flow", "A QR code opens the shop page without requiring a customer account or app."]] },
  "/refund-policy": { title: "Refund policy", intro: "Printly does not collect customer order payments in this preview.", sections: [["Print orders", "Customers pay the shop directly by UPI or cash. Any refund for a direct payment must be arranged between the shop and customer."], ["Platform charges", "No subscription or platform billing is enabled in this development preview."]] },
};

const cityNames = ["Rajkot", "Ahmedabad", "Surat", "Vadodara", "Mumbai", "Pune", "Delhi", "Jaipur", "Lucknow", "Patna", "Ranchi", "Dhanbad", "Kolkata", "Bengaluru", "Mysuru", "Chennai", "Coimbatore", "Hyderabad", "Bhopal", "Indore", "Nagpur", "Nashik", "Raipur", "Jabalpur", "Kochi", "Visakhapatnam"];
const articles = [
  ["qr-printing-for-cyber-cafes", "How QR ordering can help cyber cafes manage print requests"],
  ["organize-print-jobs", "A practical way to organize walk-in print jobs"],
  ["protect-customer-documents", "Protecting customer documents at a print counter"],
];

function resolvePage(path: string) {
  if (pages[path]) return pages[path];
  if (path === "/printing-software") return { title: "QR printing software by city", intro: "Find print-shop ordering information for cities across India.", sections: [["City pages", "Choose a city to learn how QR-based customer ordering can work for local print shops."], ["Available locations", cityNames.map((name) => `[${name}](/printing-software/${name.toLowerCase().replaceAll(" ", "-")})`).join(" · ")]] as Array<[string, string]> };
  if (path.startsWith("/printing-software/")) {
    const city = path.split("/").at(-1)?.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") ?? "your city";
    return { title: `QR printing software for print shops in ${city}`, intro: `Help customers in ${city} submit print jobs from a phone using a shop QR page.`, sections: [["Customer self-service", "Customers upload a document, select print options, see a quote, and receive a pickup code without installing an app."], ["Shop-managed orders", "Local shopkeepers control their rates, verify direct payments, and manage incoming jobs in an order queue."], ["Set up your shop", "Configure your shop page and share its QR code with customers in your area."]] as Array<[string, string]> };
  }
  if (path === "/blog") return { title: "Print shop guides", intro: "Ideas and practical guides for running a smoother print counter.", sections: articles.map(([slug, title]) => [`[${title}](/blog/${slug})`, "Read this guide for practical ways to handle customer files, print options, and pickup workflows."]) };
  if (path.startsWith("/blog/category/")) {
    const category = path.split("/").at(-1)?.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") ?? "Guides";
    return { title: `${category} guides`, intro: "Articles and tips for print shops.", sections: articles.map(([slug, title]) => [`[${title}](/blog/${slug})`, "Practical guidance for shop owners."]) };
  }
  if (path.startsWith("/blog/")) {
    const slug = path.split("/").at(-1) ?? "print-shop-guide";
    const article = articles.find(([candidate]) => candidate === slug);
    const title = article?.[1] ?? slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
    return { title, intro: "A practical guide for print shops using customer self-service order flows.", sections: [["Start with a clear order flow", "Show accepted file types, print choices, and price before the customer submits an order."], ["Keep jobs organized", "Use a consistent order queue and pickup code so each file can be matched to the right customer."], ["Protect customer files", "Make file access private and set a clear retention policy for pending and completed jobs."]] as Array<[string, string]> };
  }
  return undefined;
}

export function PublicContentPage({ path }: { path: string }) {
  const page = resolvePage(path);
  useEffect(() => {
    document.title = page ? `${page.title} | Printly` : "Page not found | Printly";
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description && page) description.content = page.intro;
  }, [page]);
  if (!page) return <main className="legal-page"><section className="legal-card"><a className="brand" href="/"><QrCode size={20} /> printly.</a><h1>Page not found</h1><p>This Printly page is not available.</p><a className="button button-dark" href="/">Back to home <ArrowRight size={15} /></a></section></main>;
  return <div className="legal-page"><a className="brand account-brand" href="/"><span className="brand-mark"><QrCode size={20} /></span><span>printly<span className="brand-period">.</span></span></a><main className="legal-card"><a className="back-link" href="/"><ArrowLeft size={15} /> Back to home</a><div className="eyebrow"><span className="eyebrow-dot" /> PRINTLY</div><h1>{page.title}</h1><p className="legal-intro">{page.intro}</p>{page.sections.map(([title, text]) => <section key={title}><h2>{title.startsWith("[") ? "Guide" : title}</h2><p>{text.startsWith("[") ? <a href={text.match(/\((.*?)\)/)?.[1]}>{text.match(/^\[(.*?)\]/)?.[1]}</a> : text}</p></section>)}<p><a className="button button-dark" href="/register">Set up your shop <ArrowRight size={15} /></a></p></main></div>;
}
