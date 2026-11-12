import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  MapPin,
  Menu,
  QrCode,
  ShieldCheck,
  X,
} from "lucide-react";

type Section = { title: string; body: string };
type MarketingPage = {
  title: string;
  intro: string;
  sections: Section[];
  category?: "features" | "solutions" | "faq" | "contact" | "partner" | "about" | "legal";
};

const solutionLinks = [
  ["/solutions/cyber-cafe", "Cyber cafes", "Receive print jobs without WhatsApp or pen drives."],
  ["/solutions/xerox-shop", "Xerox shops", "Give customers a clear, self-service order flow."],
  ["/solutions/csc-center", "CSC centers", "Manage document requests in one shop queue."],
  ["/solutions/college-library", "Colleges & libraries", "Help students send print jobs from their phones."],
] as const;

const citiesByState: Record<string, string[]> = {
  "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Tirupati", "Rajamahendravaram", "Kakinada", "Anantapur"],
  "Arunachal Pradesh": ["Itanagar"],
  Assam: ["Guwahati", "Dibrugarh", "Silchar"],
  Bihar: ["Patna", "Muzaffarpur", "Bhagalpur", "Gaya", "Darbhanga", "Purnia", "Arrah", "Begusarai"],
  Chandigarh: ["Chandigarh"],
  Chhattisgarh: ["Raipur", "Bhilai", "Bilaspur"],
  "Delhi NCR": ["Delhi"],
  Goa: ["Panaji", "Margao"],
  Gujarat: ["Rajkot", "Ahmedabad", "Surat", "Vadodara", "Gandhinagar", "Bhavnagar", "Jamnagar", "Morbi", "Junagadh", "Gandhidham", "Anand", "Nadiad", "Mehsana", "Bharuch", "Navsari", "Vapi", "Valsad", "Porbandar", "Bhuj", "Palanpur", "Surendranagar", "Amreli", "Godhra", "Veraval", "Botad", "Patan", "Dahod", "Himmatnagar", "Gondal", "Jetpur"],
  Haryana: ["Gurugram", "Faridabad", "Panipat", "Ambala", "Hisar", "Karnal", "Rohtak", "Sonipat"],
  "Himachal Pradesh": ["Shimla", "Dharamshala"],
  "Jammu & Kashmir": ["Jammu", "Srinagar"],
  Jharkhand: ["Ranchi", "Dhanbad", "Jamshedpur", "Bokaro", "Deoghar", "Hazaribagh", "Giridih"],
  Karnataka: ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi-Dharwad", "Belagavi", "Kalaburagi", "Davanagere", "Ballari", "Shivamogga", "Tumakuru", "Udupi"],
  Kerala: ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Kannur", "Kottayam"],
  "Madhya Pradesh": ["Bhopal", "Indore", "Gwalior", "Jabalpur", "Ujjain", "Sagar", "Rewa", "Satna"],
  Maharashtra: ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Navi Mumbai", "Kalyan-Dombivli", "Vasai-Virar", "Solapur", "Kolhapur", "Chhatrapati Sambhajinagar", "Amravati", "Sangli", "Akola", "Jalgaon", "Latur", "Nanded", "Ahilyanagar"],
  Manipur: ["Imphal"],
  Meghalaya: ["Shillong"],
  Mizoram: ["Aizawl"],
  Nagaland: ["Kohima"],
  Odisha: ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur"],
  Puducherry: ["Puducherry"],
  Punjab: ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali"],
  Rajasthan: ["Jaipur", "Jodhpur", "Kota", "Udaipur", "Ajmer", "Bikaner", "Alwar", "Bhilwara", "Sikar", "Sri Ganganagar"],
  Sikkim: ["Gangtok"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Tiruppur", "Vellore", "Erode", "Thoothukudi", "Thanjavur"],
  Telangana: ["Hyderabad", "Warangal", "Karimnagar", "Nizamabad", "Khammam"],
  Tripura: ["Agartala"],
  "Uttar Pradesh": ["Lucknow", "Prayagraj", "Noida", "Ghaziabad", "Kanpur", "Varanasi", "Agra", "Meerut", "Gorakhpur", "Aligarh", "Bareilly", "Moradabad", "Saharanpur", "Jhansi", "Mathura", "Firozabad", "Ayodhya", "Shahjahanpur"],
  Uttarakhand: ["Dehradun", "Haridwar", "Haldwani", "Roorkee"],
  "West Bengal": ["Kolkata", "Siliguri", "Durgapur", "Howrah", "Asansol", "Bardhaman", "Kharagpur"],
};

const faqGroups = [
  {
    name: "General",
    questions: [
      ["What is Printly?", "Printly gives a local print shop a QR-based order page and a dashboard to review and manage customer print jobs."],
      ["Do customers need to install an app?", "No. Customers open the shop page in their phone browser and upload from there."],
      ["What files can a customer upload?", "The current order flow supports PDF documents and common photo formats, with up to 10 files per order."],
    ],
  },
  {
    name: "Setup & printers",
    questions: [
      ["Can I use my existing printer?", "Yes. Pair the Windows agent with your shop and route jobs to an installed printer that supports the required options."],
      ["Can I connect more than one printer?", "The shop can pair Windows devices and configure printer routes from its dashboard."],
      ["What happens if the computer or printer is offline?", "The shop can see and manage queued orders in the dashboard. Printing resumes when a paired computer and printer are available."],
    ],
  },
  {
    name: "Payments",
    questions: [
      ["Who receives print-order payments?", "Customers pay the shop directly by UPI or cash. A shopkeeper confirms payment in the order queue."],
      ["Does Printly take a per-order commission?", "The customer print-payment flow is direct to the shop; it does not route customer funds through Printly."],
    ],
  },
  {
    name: "Privacy & security",
    questions: [
      ["Are uploaded files public?", "No. Order uploads are private to the customer order and the shop that is fulfilling it."],
      ["When are files removed?", "Files are cleaned up after an order reaches a terminal state or after the shop-configured retention period."],
    ],
  },
  {
    name: "Pricing & plans",
    questions: [
      ["What shop subscriptions are available?", "Printly offers a 7-day Free Trial (up to 50 orders), Starter (₹199/mo, 300 orders), Professional (₹499/mo, 1,500 orders), and Enterprise (₹999/mo, unlimited orders)."],
      ["How do I pay for my shop subscription?", "You can pay via any UPI app (GPay, PhonePe, Paytm, BHIM) by scanning our platform UPI QR code, then submit the 12-digit UTR in your shop dashboard for quick verification."],
      ["Does Printly take a cut of customer print orders?", "No. Customers pay your shop directly by UPI or cash at your counter. Printly takes 0% commission on your print jobs."],
    ],
  },
] as const;

const blogCategories = [
  { slug: "business-tips", name: "Business tips" },
  { slug: "guides", name: "Guides" },
  { slug: "comparisons", name: "Comparisons" },
  { slug: "privacy-and-security", name: "Privacy & security" },
  { slug: "product", name: "Product" },
] as const;

const articles = [
  {
    slug: "qr-code-printing-software-for-cyber-cafe",
    title: "A field guide to adding QR-based print ordering at a cyber café",
    category: "product",
    intro: "Map a familiar walk-in print service into a clear, phone-friendly order journey.",
    sections: [
      ["Start with the customer journey", "List the decisions a visitor needs to make: file type, paper, colour, copies, payment, and pickup. Keep the sequence short and explain unfamiliar print terms where they appear."],
      ["Make the counter workflow explicit", "Decide who reviews new jobs, confirms payment, and marks a completed print ready for collection. A visible queue helps staff share those steps."],
      ["Pilot before expanding", "Try the flow with a few common documents, check the resulting prints, and update instructions based on questions customers actually ask."],
    ],
  },
  {
    slug: "how-to-start-xerox-shop-business-india",
    title: "Planning a neighborhood copy-and-print shop",
    category: "guides",
    intro: "A practical starting checklist for evaluating a location, services, equipment, and day-to-day operations.",
    sections: [
      ["Validate local demand", "Talk with nearby students, offices, and residents about their regular document needs and busy seasons before committing to a service mix."],
      ["Budget for the whole operation", "Include equipment, paper, toner, maintenance, connectivity, rent, and time for service work—not just the purchase price of a machine."],
      ["Set up repeatable routines", "Document how jobs are priced, checked, queued, and handed back so service remains consistent when the counter gets busy."],
    ],
  },
  {
    slug: "exam-form-result-day-rush-cyber-cafe",
    title: "Organizing exam-form and result-day print demand",
    category: "business-tips",
    intro: "A practical checklist for keeping document-print requests organized during busy days.",
    sections: [
      ["Prepare the counter before the rush", "Keep order instructions visible, verify the printer routes are available, and tell customers how they will identify their pickup."],
      ["Keep jobs moving through one queue", "Review each job's settings and payment state together, avoid mixing files, and update its status when it is ready."],
      ["Protect documents during busy periods", "Limit access to uploaded files and use the shop's retention settings to remove files that are no longer needed."],
    ],
  },
  {
    slug: "how-to-print-from-phone-at-xerox-shop",
    title: "A smoother phone-to-counter document handoff",
    category: "guides",
    intro: "Help customers submit a document from a phone without relying on informal file-sharing steps.",
    sections: [
      ["Offer a clear upload route", "A QR code can open the shop's order page directly in a mobile browser. Keep a printed backup link available if a camera cannot scan it."],
      ["Ask for print choices up front", "Collect paper size, colour mode, sides, copies, and any page range before staff start the job."],
      ["Close the loop at pickup", "Give customers an order reference and update the status when the print is ready so collection is straightforward."],
    ],
  },
  {
    slug: "how-to-start-qr-code-print-shop-india",
    title: "Introducing QR ordering at a local print counter",
    category: "guides",
    intro: "Plan the customer instructions, shop settings, and printer workflow for a QR-based ordering option.",
    sections: [
      ["Prepare the shop profile", "Confirm the public shop name, address, supported paper sizes, rates, and payment instructions before sharing the QR."],
      ["Test common jobs", "Check a short PDF, a multi-page file, and a photo order to make sure the displayed options and quote match the shop's process."],
      ["Make the service easy to discover", "Place the QR where customers naturally wait and keep a short explanation nearby for first-time users."],
    ],
  },
  {
    slug: "print-aadhaar-pan-voter-id-front-back",
    title: "Preparing two-sided identity-card copies for printing",
    category: "guides",
    intro: "A careful workflow for arranging the front and back of a customer-provided identity document.",
    sections: [
      ["Confirm the requested layout", "Ask whether the customer needs both sides on one sheet, and check the paper size and orientation before printing."],
      ["Review scale and legibility", "Use a readable size, preserve the full card edges, and check a preview or test print before producing extra copies."],
      ["Handle the source file with care", "Avoid retaining identity documents longer than needed and clear temporary copies from shared workstations."],
    ],
  },
  {
    slug: "upi-payments-for-print-shops",
    title: "Building a reliable UPI payment confirmation routine",
    category: "business-tips",
    intro: "Keep payment checks clear for staff and customers while avoiding confusion between separate orders.",
    sections: [
      ["Show the amount and shop identity", "Make sure the customer can verify the shop and exact order amount before completing a transfer."],
      ["Match each confirmation to a job", "Check the received payment against the order reference and amount before marking the job as paid."],
      ["Offer a fallback", "Explain what to do if a payment is pending or the customer prefers to pay at the counter."],
    ],
  },
  {
    slug: "usb-vs-wifi-vs-network-printer-xerox-shop",
    title: "Choosing a practical printer connection for a copy shop",
    category: "comparisons",
    intro: "Compare connection approaches against your workspace, device count, and support needs.",
    sections: [
      ["USB for a single workstation", "A direct cable can suit one nearby computer, but it ties the printer to that workstation and cable reach."],
      ["Wi-Fi for flexible placement", "Wireless printing can reduce cable clutter, while reliability depends on coverage and a well-managed local network."],
      ["Wired networking for shared devices", "Ethernet can be useful for printers shared by several computers; consider setup effort and ongoing network support."],
    ],
  },
  {
    slug: "xerox-printing-rate-per-page-india",
    title: "A method for setting sustainable per-page print rates",
    category: "business-tips",
    intro: "Build a price list from actual operating costs and the service level customers expect.",
    sections: [
      ["Estimate variable costs", "Track paper, toner or ink, electricity, and maintenance using realistic coverage and the shop's own purchase prices."],
      ["Account for service and overhead", "Include equipment wear, rent, connectivity, staff time, and the time spent checking or finishing a job."],
      ["Review prices with real usage", "Compare estimates with actual monthly consumption and update rates when supplies or operating costs change."],
    ],
  },
  {
    slug: "whatsapp-printing-vs-qr-printing",
    title: "Comparing chat-based requests with structured print orders",
    category: "comparisons",
    intro: "Consider where messaging helps and where a dedicated order form can reduce repeated questions.",
    sections: [
      ["Chat is familiar", "Messaging can be convenient for a quick conversation, but files and print instructions may be spread across a long thread."],
      ["Forms collect consistent details", "A structured order can gather copies, paper, sides, and payment choices together with the uploaded file."],
      ["Choose the right fit", "Keep a human support route for unusual jobs, and use a consistent queue for routine orders whichever entry point customers prefer."],
    ],
  },
  {
    slug: "customer-document-privacy-print-shop",
    title: "A privacy checklist for customer documents",
    category: "privacy-and-security",
    intro: "Simple operational practices can reduce unnecessary exposure of personal documents at a print counter.",
    sections: [
      ["Limit who can access files", "Use individual shop accounts where available and avoid leaving customer documents open on unattended screens."],
      ["Set a clear retention period", "Remove local downloads and temporary copies after fulfillment, following the shop's retention policy."],
      ["Explain handling to customers", "State why a file is collected, who uses it to complete the job, and when it is removed."],
    ],
  },
  {
    slug: "increase-print-shop-income-ideas",
    title: "Ways to develop a print shop's everyday services",
    category: "business-tips",
    intro: "Explore service improvements that build on customer needs and the equipment a shop already operates.",
    sections: [
      ["Make regular services easier to find", "Use a clear price list and signpost common services such as document copies, photo prints, and finishing."],
      ["Reduce avoidable counter delays", "Standardize intake questions and job status updates so staff spend less time clarifying routine requests."],
      ["Review performance before investing", "Track service demand and costs for a few weeks before adding equipment or a new paid offering."],
    ],
  },
  {
    slug: "passport-size-photo-print-4x6-sheet",
    title: "Planning a passport-photo layout on a 4 × 6 sheet",
    category: "guides",
    intro: "Use a repeatable layout and a careful test print to prepare small portrait photos on photo paper.",
    sections: [
      ["Check the required dimensions", "Confirm the destination's current photo-size and background requirements rather than assuming one layout suits every application."],
      ["Arrange copies with margins", "Leave enough space for trimming and check that each image remains at the requested size after printing."],
      ["Verify before producing multiples", "Review colour, crop, and print scaling on a sample to avoid wasting photo paper."],
    ],
  },
  {
    slug: "best-printer-for-xerox-shop-india",
    title: "Evaluating printer types for a small print business",
    category: "comparisons",
    intro: "Compare device capacity, running costs, media support, and service availability for your expected workload.",
    sections: [
      ["Match the device to job volume", "Estimate daily pages and peak periods, then check the recommended duty cycle and speed for each candidate."],
      ["Look beyond purchase price", "Compare consumable yield, replacement-part costs, warranty terms, and access to local repair support."],
      ["Test the actual workflow", "Confirm supported paper sizes, duplex behavior, driver compatibility, and the finish quality customers expect."],
    ],
  },
  {
    slug: "csc-center-printing-automation",
    title: "Keeping document requests organized at a public-service center",
    category: "product",
    intro: "A structured intake and queue can help a service center handle recurring document-print work.",
    sections: [
      ["Separate request intake from fulfillment", "Capture the file and requested options first, then let staff review the job before sending it to a printer."],
      ["Use clear checkpoints", "Make payment review, print approval, and pickup status visible so customers know what happens next."],
      ["Protect sensitive records", "Restrict access to customer documents and remove temporary files according to a defined retention schedule."],
    ],
  },
  {
    slug: "organize-print-jobs",
    title: "A practical way to organize walk-in print jobs",
    category: "guides",
    intro: "Use a visible order queue and clear status updates to reduce counter confusion.",
    sections: [
      ["Use a single queue", "Keep new requests together so the shop can review payment, print options, and pickup status in one place."],
      ["Confirm before printing", "Check the selected options and payment state before approving a job for the printer."],
    ],
  },
  {
    slug: "protect-customer-documents",
    title: "Protecting customer documents at a print counter",
    category: "privacy-and-security",
    intro: "Good file-handling habits help protect the private documents customers send to a local shop.",
    sections: [
      ["Keep access limited", "Only the shop account fulfilling an order should access its uploaded files."],
      ["Remove files promptly", "Use automatic cleanup and avoid keeping customer documents on shared computers after the job is done."],
    ],
  },
] as const;

const pageContent: Record<string, MarketingPage> = {
  "/features": {
    title: "Everything your print counter needs",
    intro: "Help customers send files from their phones while your shop controls pricing, direct payment, order review, and pickup.",
    category: "features",
    sections: [
      { title: "Customer QR ordering", body: "A shop-specific QR opens the order page in a browser, with no customer app or account required." },
      { title: "PDF and photo uploads", body: "Accept multiple files in one order and guide customers through the available print settings." },
      { title: "Live price calculation", body: "Calculate the quote from shop-configured prices, copies, paper size, colour, duplex, and eligible discounts." },
      { title: "Manual order fulfillment", body: "Review customer orders, confirm direct UPI or cash payments, approve paid orders for manual fulfillment, and mark completed orders ready for pickup." },
      { title: "Payments and reports", body: "Review recorded payments and shop activity with dashboard reports and export options." },
      { title: "QR poster maker", body: "Create a printable customer QR poster in several sizes, styles, and languages." },
      { title: "Privacy controls", body: "Keep uploads private and configure automatic file retention and cleanup." },
      { title: "Shop settings", body: "Manage paper sizes, rates, payment methods, discounts, notifications, customer details, and location controls." },
    ],
  },
  "/how-it-works": {
    title: "From QR scan to order pickup",
    intro: "Customer ordering and shop-side order management are available. Printer setup and automated printing are temporarily paused.",
    category: "features",
    sections: [
      { title: "1. Share your shop QR", body: "Download or print the shop QR code and place it at your counter." },
      { title: "2. Upload and choose options", body: "Customers upload PDFs or photos, choose page ranges, copies, paper size, colour, and sides, then review their quote." },
      { title: "3. Pay the shop", body: "Customers pay the shop directly by UPI or choose cash at the counter when enabled." },
      { title: "4. Review and fulfill manually", body: "The shop confirms payment, approves the paid order, and handles fulfillment outside Printly while printer automation is paused." },
      { title: "5. Collect and clean up", body: "The order status and pickup code help the customer collect the job; file cleanup follows the shop's retention settings." },
    ],
  },
  "/pricing": {
    title: "Simple, transparent plans for local print shops",
    intro: "Start with a 7-day free trial. Pick a plan that fits your shop's walk-in order volume.",
    category: "features",
    sections: [
      { title: "Free 7-day evaluation", body: "Every new shop begins with a 7-day free trial with up to 50 customer orders. No credit card required." },
      { title: "Direct UPI & cash payments", body: "Customers pay your shop directly via your own UPI ID or counter cash. Printly takes 0% commission on your customer orders." },
      { title: "Upgrade anytime", body: "Move to Starter, Professional, or Enterprise as your order volume grows, with simple UPI-based subscription activation." },
    ],
  },
  "/faq": {
    title: "Frequently asked questions",
    intro: "Get answers about shop setup, manual order handling, direct payments, privacy, and the paused printer service.",
    category: "faq",
    sections: [],
  },
  "/about": {
    title: "About Printly",
    intro: "Printly helps local print shops move customer file handoffs into a clear, QR-based ordering and shop-management workflow.",
    category: "about",
    sections: [
      { title: "Built for local counters", body: "The workflow is designed for cyber cafes, photocopy and print shops, service centers, colleges, and libraries." },
      { title: "A connected product", body: "Customers use a mobile browser, shop owners manage orders in a dashboard, and a paired Windows app can dispatch approved jobs to installed printers." },
      { title: "Shop control first", body: "Each shop sets its own print rates, payment instructions, printer routes, and file-retention preferences." },
    ],
  },
  "/contact": {
    title: "Contact and support",
    intro: "For an order question, contact the shop that received the order. Platform support details can be configured before public launch.",
    category: "contact",
    sections: [
      { title: "Customer order support", body: "Use the contact details on the shop's public order page for payment, pickup, or order-status questions." },
      { title: "Shop-owner support", body: "Shop owners can review setup guidance and the support section in their dashboard." },
    ],
  },
  "/partner": {
    title: "Partner with Printly",
    intro: "Help local print businesses adopt a more organized customer-order workflow.",
    category: "partner",
    sections: [
      { title: "For shop owners", body: "Set up a shop profile, configure rates and payment details, then share a QR code with customers." },
      { title: "Local agents and resellers", body: "Help neighborhood print shops onboard and connect their existing Windows computers and printers." },
      { title: "White-label enquiries", body: "Discuss a branded setup for a print network or service organization through the contact page." },
    ],
  },
  "/solutions": {
    title: "One workflow for different print counters",
    intro: "Let walk-in customers submit files from their phones while the shop manages each job in one queue.",
    category: "solutions",
    sections: [],
  },
  "/solutions/cyber-cafe": {
    title: "QR printing for cyber cafes",
    intro: "Give students and walk-in customers a direct way to send documents without passing around phones or USB drives.",
    category: "solutions",
    sections: [
      { title: "Reduce file handoffs", body: "Customers upload their documents from a phone using the shop QR." },
      { title: "Keep the counter organized", body: "Review order settings, payment status, and manual fulfillment progress from the order list." },
      { title: "Use existing printers", body: "Pair a Windows computer and configure routes for printers already installed at the shop." },
    ],
  },
  "/solutions/xerox-shop": {
    title: "Print-from-phone software for Xerox shops",
    intro: "Let customers choose print options and submit jobs before reaching the counter.",
    category: "solutions",
    sections: [
      { title: "Customer-selected print options", body: "Offer the paper sizes, colour modes, sides, and copy counts configured by the shop." },
      { title: "Shop-controlled prices", body: "Set rates and supported options in the dashboard and show the calculated quote before order submission." },
      { title: "Printer routing", body: "Route approved jobs to a paired Windows printer based on the configured print settings." },
    ],
  },
  "/solutions/csc-center": {
    title: "Document printing for CSC centers",
    intro: "Collect customer document-print requests through a private, browser-based order page.",
    category: "solutions",
    sections: [
      { title: "A simple customer entry point", body: "Share one QR code for customers to submit documents without installing an app." },
      { title: "Review before printing", body: "Confirm the order settings and payment in the dashboard before accepting the print job." },
      { title: "Private files", body: "Uploads are private to the order and removed by the configured cleanup process." },
    ],
  },
  "/solutions/college-library": {
    title: "Self-service printing for colleges and libraries",
    intro: "Give students and visitors a convenient way to submit assignments, notes, and forms from a phone.",
    category: "solutions",
    sections: [
      { title: "No customer app required", body: "A scan opens the order page in a browser and guides the customer through file selection." },
      { title: "A clearer order queue", body: "Keep incoming orders visible to staff and track payment and manual fulfillment status." },
      { title: "Shop-managed service", body: "The counter controls rates, supported paper options, printer routes, and pickup." },
    ],
  },
  "/refund-policy": {
    title: "Refund policy",
    intro: "Customer print payments are made directly to the shop; Printly does not process those customer order payments.",
    category: "legal",
    sections: [
      { title: "Print-order payments", body: "The shop and customer should resolve any refund or reprint request for a direct UPI or cash payment with the shop that fulfilled the order." },
      { title: "Subscription requests", body: "Paid plan requests are reviewed manually. Contact the platform operator for questions about a submitted plan payment." },
      { title: "Development status", body: "The policy and payment workflow should be reviewed before the product is used as a public commercial service." },
    ],
  },
};

function cityTitle(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolvePage(path: string): MarketingPage | null {
  const normalized = path.replace(/\/+$/, "") || "/";
  const directPage = pageContent[normalized];
  if (directPage) return directPage;

  if (normalized === "/printing-software") {
    return {
      title: "QR printing software across India",
      intro: "Explore city pages for print shops across 194 cities in 32 states and regions.",
      category: "features",
      sections: [
        { title: "A local shop page", body: "Each participating shop shares its own order page and controls its rates, payment options, and print workflow." },
      ],
    };
  }
  if (normalized.startsWith("/printing-software/")) {
    const slug = normalized.split("/").at(-1);
    if (!slug) return null;
    const city = Object.values(citiesByState).flat().find((name) => slugify(name) === slug);
    if (!city) return null;
    return {
      title: `QR printing software for print shops in ${city}`,
      intro: `Help customers in ${city} send print jobs from a phone and collect them at the local shop counter.`,
      category: "features",
      sections: [
        { title: "Order from a phone", body: "Customers scan the shop QR, upload a document, choose supported print settings, and review the quote." },
        { title: "Shop-managed fulfillment", body: "The local shop confirms payment, reviews the job, and tracks printing and pickup." },
        { title: "Other areas", body: "Explore other supported cities in the directory below." },
      ],
    };
  }
  if (normalized === "/blog") {
    return {
      title: "Print shop guides",
      intro: "Practical ideas for running a smoother print counter, organizing orders, and protecting customer documents.",
      category: "features",
      sections: [],
    };
  }
  if (normalized.startsWith("/blog/category/")) {
    const categorySlug = normalized.split("/").at(-1);
    const category = blogCategories.find((item) => item.slug === categorySlug);
    if (!category) return null;
    return {
      title: `${category.name} articles`,
      intro: category.slug === "product"
        ? "Explore product updates and notes on tools for running a smoother print counter."
        : `Practical ${category.name.toLowerCase()} for running a smoother print counter and serving customers.`,
      category: "features",
      sections: [],
    };
  }
  if (normalized.startsWith("/blog/")) {
    const article = articles.find((item) => item.slug === normalized.split("/").at(-1));
    if (!article) return null;
    return {
      title: article.title,
      intro: article.intro,
      category: "features",
      sections: article.sections.map(([title, body]) => ({ title, body })),
    };
  }
  return null;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "-");
}

export function PublicMarketingPages({ path }: { path: string }) {
  const normalized = path.replace(/\/+$/, "") || "/";
  const page = resolvePage(normalized);
  const [menuOpen, setMenuOpen] = useState(false);
  const isFaq = normalized === "/faq";
  const isPricing = normalized === "/pricing";
  const isFeatures = normalized === "/features";
  const isCityIndex = normalized === "/printing-software";
  const isCityPage = normalized.startsWith("/printing-software/");
  const isSolutions = normalized === "/solutions" || normalized.startsWith("/solutions/");
  const isBlog = normalized === "/blog" || normalized.startsWith("/blog/");
  const isArticle = isBlog && normalized !== "/blog" && !normalized.startsWith("/blog/category/");
  const article = isArticle ? articles.find((item) => item.slug === normalized.split("/").at(-1)) : undefined;
  const articleCategory = blogCategories.find((category) => category.slug === article?.category);

  useEffect(() => {
    document.title = page ? `${page.title} | Printly` : "Page not found | Printly";
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description && page) description.content = page.intro;
  }, [normalized]);

  const breadcrumbs = normalized.split("/").filter(Boolean);

  return (
    <div className={`public-marketing-page public-page-${isPricing ? "pricing" : isFaq ? "faq" : isSolutions ? "solutions" : isCityIndex || isCityPage ? "seo" : "content"}`}>
      <a className="public-skip-link" href="#main">Skip to content</a>
      <header className="site-header public-site-header">
        <a className="brand" href="/" aria-label="Printly home" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark"><QrCode size={21} /></span>
          <span>printly<span className="brand-period">.</span></span>
        </a>
        <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav className={`main-nav${menuOpen ? " is-open" : ""}`} aria-label="Main navigation">
          <a href="/how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="/features" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="/pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
          <a href="/solutions" onClick={() => setMenuOpen(false)}>Solutions</a>
          <a href="/faq" onClick={() => setMenuOpen(false)}>FAQ</a>
          <a className="nav-login" href="/login" onClick={() => setMenuOpen(false)}>Log in</a>
          <a className="button button-dark nav-cta" href="/register" onClick={() => setMenuOpen(false)}>Register shop <ArrowRight size={15} /></a>
        </nav>
      </header>

      <main id="main">
        {!page ? (
          <section className="public-not-found">
            <div className="public-eyebrow"><span /> PAGE NOT FOUND</div>
            <h1>We can’t find that page.</h1>
            <p>Return to the homepage or explore the product pages.</p>
            <a className="button button-dark button-large" href="/">Back to home <ArrowRight size={16} /></a>
          </section>
        ) : (
          <>
            <nav className="public-breadcrumbs" aria-label="Breadcrumb">
              <a href="/">Home</a>
              {breadcrumbs.map((part, index) => {
                const href = `/${breadcrumbs.slice(0, index + 1).join("/")}`;
                const label = part === "printing-software" ? "Print software" : part.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
                return (
                  <span className="public-breadcrumb-item" key={href}>
                    <span aria-hidden="true">/</span>
                    <a href={href} aria-current={index === breadcrumbs.length - 1 ? "page" : undefined}>{label}</a>
                  </span>
                );
              })}
            </nav>

            <section className="public-page-hero">
              <div className="public-page-hero-copy">
                <div className="public-eyebrow"><span />{isCityIndex || isCityPage ? "LOCAL PRINT ORDERING" : isSolutions ? "BUILT FOR YOUR COUNTER" : isPricing ? "TRANSPARENT PLANS" : isFaq ? "HELP & ANSWERS" : "THE PRINTLY PLATFORM"}</div>
                <h1>{page.title}</h1>
                <p>{page.intro}</p>
                <div className="public-hero-actions">
                  <a className="button button-dark button-large" href="/register">Register your shop <ArrowRight size={16} /></a>
                  <a className="public-text-link" href="/how-it-works">See how it works <ArrowRight size={15} /></a>
                </div>
              </div>
              <aside className="public-hero-note">
                <span className="public-note-icon"><QrCode size={20} /></span>
                <small>ONE SIMPLE FLOW</small>
                <strong>Scan. Send.<br />Track the order.</strong>
                <p>Printer automation is paused. Shops can still review orders and manage manual fulfillment.</p>
              </aside>
            </section>

            {isPricing ? (
              <section className="public-pricing-content" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 36, padding: "50px max(8%, calc((100% - 1070px) / 2))" }}>
                <div className="public-section-intro" style={{ maxWidth: 650, margin: "0 auto", textAlign: "center" }}>
                  <div className="public-eyebrow" style={{ justifyContent: "center" }}><span /> PLANS FOR EVERY PRINT SHOP</div>
                  <h2>Zero commission.<br /><span>Simple monthly pricing.</span></h2>
                  <p>Customer payments go straight to your shop. Pick a plan based on your monthly order volume.</p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 20 }}>
                  <article className="public-pricing-card" style={{ display: "flex", flexDirection: "column" }}>
                    <div className="public-plan-top">
                      <span>FOR LOCAL XEROX SHOPS</span>
                      <span className="public-plan-badge">STARTER</span>
                    </div>
                    <h3>Starter</h3>
                    <p>Essential digital tools for neighborhood photocopy shops.</p>
                    <div style={{ margin: "14px 0", fontSize: 28, fontWeight: 800, color: "#078c68", fontFamily: "Manrope, sans-serif" }}>
                      ₹199 <small style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>/ month</small>
                    </div>
                    <ul style={{ flex: 1 }}>
                      <li><Check size={15} /> <b>Up to 300 orders</b> / month</li>
                      <li><Check size={15} /> All paper sizes (A4, A3, A5, Legal)</li>
                      <li><Check size={15} /> Direct UPI & cash payments</li>
                      <li><Check size={15} /> Daily email business summary</li>
                      <li><Check size={15} /> Standard email support</li>
                    </ul>
                    <a className="button button-dark" href="/register" style={{ marginTop: 20 }}>Get started free</a>
                  </article>

                  <article className="public-pricing-card" style={{ display: "flex", flexDirection: "column", border: "2px solid #0aa579", position: "relative" }}>
                    <div className="public-plan-top">
                      <span style={{ color: "#0aa579" }}>POPULAR CHOICE</span>
                      <span className="public-plan-badge" style={{ background: "#dcfce7", color: "#15803d" }}>MOST POPULAR</span>
                    </div>
                    <h3>Professional</h3>
                    <p>Built for busy cyber cafes and commercial document centers.</p>
                    <div style={{ margin: "14px 0", fontSize: 28, fontWeight: 800, color: "#078c68", fontFamily: "Manrope, sans-serif" }}>
                      ₹499 <small style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>/ month</small>
                    </div>
                    <ul style={{ flex: 1 }}>
                      <li><Check size={15} /> <b>Up to 1,500 orders</b> / month</li>
                      <li><Check size={15} /> Custom shop logo on QR poster</li>
                      <li><Check size={15} /> Location-lock proximity protection</li>
                      <li><Check size={15} /> Advanced analytics & CSV export</li>
                      <li><Check size={15} /> WhatsApp & priority email support</li>
                    </ul>
                    <a className="button button-dark" href="/register" style={{ marginTop: 20, background: "#0aa579" }}>Start 7-day trial</a>
                  </article>

                  <article className="public-pricing-card" style={{ display: "flex", flexDirection: "column" }}>
                    <div className="public-plan-top">
                      <span>CAMPUS & LARGE HUBS</span>
                      <span className="public-plan-badge">ENTERPRISE</span>
                    </div>
                    <h3>Enterprise</h3>
                    <p>For high-volume college libraries and multi-counter copy hubs.</p>
                    <div style={{ margin: "14px 0", fontSize: 28, fontWeight: 800, color: "#078c68", fontFamily: "Manrope, sans-serif" }}>
                      ₹999 <small style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>/ month</small>
                    </div>
                    <ul style={{ flex: 1 }}>
                      <li><Check size={15} /> <b>Unlimited customer orders</b></li>
                      <li><Check size={15} /> Everything in Professional</li>
                      <li><Check size={15} /> Zero order quota interruption</li>
                      <li><Check size={15} /> Photo layouts & passport photo sheets</li>
                      <li><Check size={15} /> Dedicated account manager</li>
                    </ul>
                    <a className="button button-dark" href="/register" style={{ marginTop: 20 }}>Get started free</a>
                  </article>
                </div>
              </section>
            ) : null}

            {isFaq ? (
              <section className="public-faq-content">
                <div className="public-section-intro">
                  <div className="public-eyebrow"><span /> QUICK ANSWERS</div>
                  <h2>Good to know<br /><span>before you get started.</span></h2>
                  <p>Browse by topic or open a question to read more.</p>
                  <nav className="public-faq-categories" aria-label="FAQ topics">
                    {faqGroups.map((group) => <a key={group.name} href={`#faq-${slugify(group.name)}`}>{group.name}</a>)}
                  </nav>
                </div>
                <div className="public-faq-list">
                  {faqGroups.map((group) => (
                    <section key={group.name} id={`faq-${slugify(group.name)}`}>
                      <h2>{group.name}</h2>
                      {group.questions.map(([question, answer]) => (
                        <details key={question}>
                          <summary>{question}</summary>
                          <p>{answer}</p>
                        </details>
                      ))}
                    </section>
                  ))}
                </div>
              </section>
            ) : null}

            {!isPricing && !isFaq ? (
              <section className="public-detail-content">
                {isBlog ? (
                  <div className="public-article-list">
                    <div className="public-blog-categories">
                      <a href="/blog">All guides</a>
                      {blogCategories.map((category) => (
                        <a href={`/blog/category/${category.slug}`} key={category.slug}>{category.name}</a>
                      ))}
                    </div>
                    {isArticle ? (
                      <article className="public-article-body">
                        <div className="public-eyebrow"><span />{articleCategory?.name ?? "SHOP GUIDE"}</div>
                        <h2>{page.title}</h2>
                        <p className="public-article-intro">{page.intro}</p>
                        {page.sections.map((section) => <section key={section.title}><h3>{section.title}</h3><p>{section.body}</p></section>)}
                        <a href="/blog" className="public-text-link">Back to all guides <ArrowRight size={15} /></a>
                      </article>
                    ) : (
                      <div className="public-blog-grid">
                        {articles
                          .filter((article) => !normalized.startsWith("/blog/category/") || article.category === normalized.split("/").at(-1))
                          .map((article) => (
                            <a className="public-blog-card" href={`/blog/${article.slug}`} key={article.slug}>
                              <span>{blogCategories.find((category) => category.slug === article.category)?.name}</span>
                              <h2>{article.title}</h2>
                              <p>{article.intro}</p>
                              <strong>Read guide <ArrowRight size={14} /></strong>
                            </a>
                          ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="public-section-heading">
                      <div>
                        <div className="public-eyebrow"><span />{isCityIndex || isCityPage ? "A SIMPLE LOCAL WORKFLOW" : isSolutions ? "SOLUTIONS FOR EVERY COUNTER" : "MADE FOR THE WAY SHOPS WORK"}</div>
                        <h2>{isSolutions ? <>A better fit for your<br /><span>kind of business.</span></> : isCityPage ? <>Print ordering in your area<br /><span>made more convenient.</span></> : <>A smoother print counter<br /><span>starts right here.</span></>}</h2>
                      </div>
                      <p>{isSolutions ? "Give customers an easy way to send jobs, while your team keeps pricing, payment, and job status in its hands." : isCityPage ? `A shop QR can help people in ${cityTitle(normalized.split("/").at(-1) ?? "")} send documents before they reach the counter.` : "Thoughtful tools make it easier for customers to submit a job and for shops to keep the details organized."}</p>
                    </div>
                    {isSolutions && normalized === "/solutions" ? (
                      <div className="public-solution-grid">
                        {solutionLinks.map(([href, label, description]) => <a className="public-solution-card" href={href} key={href}><span>{label}</span><p>{description}</p><ArrowRight size={16} /></a>)}
                      </div>
                    ) : (
                      <div className="public-feature-grid">
                        {page.sections.map((section, index) => (
                          <article className="public-feature-card" key={section.title}>
                            <span className="public-feature-number">{String(index + 1).padStart(2, "0")}</span>
                            <span className="public-feature-icon">{isCityIndex || isCityPage ? <MapPin size={19} /> : isFeatures ? <ShieldCheck size={19} /> : <Check size={19} />}</span>
                            <h3>{section.title}</h3>
                            <p>{section.body}</p>
                          </article>
                        ))}
                      </div>
                    )}
                    {isCityIndex ? (
                      <section className="public-city-directory">
                        <div className="public-eyebrow"><span /> EXPLORE BY CITY</div>
                        <h2>Browse all 194 cities</h2>
                        {Object.entries(citiesByState).map(([state, cities]) => (
                          <div className="public-city-state" key={state}>
                            <h3>{state}</h3>
                            <div className="public-city-links">
                              {cities.map((city) => <a key={city} href={`/printing-software/${slugify(city)}`}><MapPin size={13} />{city}</a>)}
                            </div>
                          </div>
                        ))}
                      </section>
                    ) : null}
                    {(isCityPage || isSolutions) ? (
                      <div className="public-related-solutions">
                        <div className="public-eyebrow"><span />{isCityPage ? "EXPLORE OTHER AREAS" : "SOLUTIONS FOR EVERY COUNTER"}</div>
                        <div className="public-city-links">
                          {isCityPage
                            ? Object.values(citiesByState).flat().filter((city) => slugify(city) !== normalized.split("/").at(-1)).slice(0, 12).map((city) => <a key={city} href={`/printing-software/${slugify(city)}`}>{city}</a>)
                            : solutionLinks.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
                        </div>
                      </div>
                    ) : null}
                    {page.category === "contact" ? (
                      <div className="public-contact-actions">
                        <a className="button button-dark" href="/dashboard/support">Shop support <ArrowRight size={15} /></a>
                        <a className="button button-secondary" href="/register">Set up a shop</a>
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            ) : null}

            <section className="public-bottom-cta">
              <div>
                <div className="public-eyebrow public-eyebrow-light"><span /> START WITH YOUR SHOP</div>
                <h2>Make the next print order <span>simpler.</span></h2>
                <p>Set up a shop page, share its QR code, and manage incoming print jobs in one place.</p>
              </div>
              <a className="button button-light button-large" href="/register">Create a shop account <ArrowRight size={16} /></a>
            </section>
          </>
        )}
      </main>

      <footer className="public-site-footer">
        <a className="brand" href="/" aria-label="Printly home"><span className="brand-mark"><QrCode size={19} /></span><span>printly<span className="brand-period">.</span></span></a>
        <p>Simple online ordering for local print shops.</p>
        <nav aria-label="Footer navigation">
          <a href="/features">Features</a><a href="/pricing">Pricing</a><a href="/solutions">Solutions</a><a href="/faq">FAQ</a><a href="/printing-software">Print by city</a><a href="/blog">Guides</a><a href="/contact">Contact</a><a href="/privacy-policy">Privacy</a><a href="/terms">Terms</a><a href="/refund-policy">Refund policy</a>
        </nav>
        <small>© {new Date().getFullYear()} Printly. Built for local print shops.</small>
      </footer>
    </div>
  );
}
