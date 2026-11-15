import { subscriptionPricing } from "@printly/contracts";

export type SubscriptionPlanId = "demo" | "starter";
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
      "Razorpay checkout & counter cash payments",
      "Printable shop QR poster maker",
      "7 days validity",
    ],
  },
  starter: {
    id: "starter",
    name: "UrQrPrint Subscription",
    ...subscriptionPricing.starter,
    orderLimit: 0,
    description: "Full shop access, billed monthly or yearly",
    features: [
      "Unlimited customer print orders",
      "Automatic print job routing",
      "Shop dashboard and reports",
      "All enabled print options",
      "Email support",
    ],
  },
};

export const PLATFORM_UPI_ID = process.env.PLATFORM_UPI_ID || "daarlabhanumurthy@okaxis";
export const PLATFORM_ACCOUNT_NAME = process.env.PLATFORM_ACCOUNT_NAME || "UrQrPrint Platform";

export function getPlanConfig(planId: string): PlanConfig {
  return SUBSCRIPTION_PLANS[planId as SubscriptionPlanId] ?? SUBSCRIPTION_PLANS.demo;
}

