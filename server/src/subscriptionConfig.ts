export type SubscriptionPlanId = "demo" | "starter" | "pro" | "premium";
export type BillingCycle = "monthly" | "annual";

export interface PlanConfig {
  id: SubscriptionPlanId;
  name: string;
  badge?: string;
  monthlyPricePaise: number;
  annualPricePaise: number;
  orderLimit: number;
  description: string;
  popular?: boolean;
  features: string[];
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, PlanConfig> = {
  demo: {
    id: "demo",
    name: "Free Trial",
    badge: "7-Day Trial",
    monthlyPricePaise: 0,
    annualPricePaise: 0,
    orderLimit: 50,
    description: "7-day evaluation for new shops to test QR ordering",
    features: [
      "Up to 50 customer orders",
      "Standard A4 & basic print sizes",
      "Direct UPI & counter cash payments",
      "Printable shop QR poster maker",
      "7 days validity",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPricePaise: 19900, // ₹199/month
    annualPricePaise: 199900, // ₹1,999/year (save ~16%)
    orderLimit: 300,
    description: "Essential tools for neighborhood photocopy & xerox shops",
    features: [
      "Up to 300 orders per month",
      "All paper sizes (A4, A3, A5, Legal)",
      "Daily email activity summaries",
      "Bulk discount tier rules",
      "Standard email support",
    ],
  },
  pro: {
    id: "pro",
    name: "Professional",
    badge: "Most Popular",
    popular: true,
    monthlyPricePaise: 49900, // ₹499/month
    annualPricePaise: 499900, // ₹4,999/year (save ~17%)
    orderLimit: 1500,
    description: "Designed for busy cyber cafes & commercial copy centers",
    features: [
      "Up to 1,500 orders per month",
      "Custom shop logo on QR posters",
      "Advanced revenue & job reports with CSV export",
      "Location-lock security controls",
      "Priority customer upload processing",
      "WhatsApp & priority email support",
    ],
  },
  premium: {
    id: "premium",
    name: "Enterprise",
    badge: "Unlimited",
    monthlyPricePaise: 99900, // ₹999/month
    annualPricePaise: 999900, // ₹9,999/year (save ~17%)
    orderLimit: 100000, // Unlimited
    description: "High-volume college campus hubs & print chains",
    features: [
      "Unlimited customer orders",
      "Everything in Professional",
      "Custom branding & priority queueing",
      "Multi-format photo & passport layouts",
      "Dedicated account manager",
      "Zero quota interruption",
    ],
  },
};

export const PLATFORM_UPI_ID = process.env.PLATFORM_UPI_ID || "daarlabhanumurthy@okaxis";
export const PLATFORM_ACCOUNT_NAME = process.env.PLATFORM_ACCOUNT_NAME || "Printly Platform";

export function getPlanConfig(planId: string): PlanConfig {
  return SUBSCRIPTION_PLANS[planId as SubscriptionPlanId] ?? SUBSCRIPTION_PLANS.demo;
}

