import { DailySettlement } from "../models/DailySettlement.js";
import { PrintOrder } from "../models/PrintOrder.js";
import { Shop } from "../models/Shop.js";
import { Types } from "mongoose";

const timezone = "Asia/Kolkata";

function indiaDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function indiaStartOfToday(now: Date): Date {
  const dateKey = indiaDateKey(now);
  return new Date(`${dateKey}T00:00:00+05:30`);
}

/** Refreshes all closed-day settlement requests from captured Razorpay orders. */
export async function refreshDailySettlementRequests(): Promise<void> {
  const beforeToday = indiaStartOfToday(new Date());
  const groups = await PrintOrder.aggregate<{
    _id: { shopId: string; dateKey: string };
    amountPaise: number;
    orderIds: Types.ObjectId[];
  }>([
    {
      $set: {
        settlementAt: {
          $ifNull: [
            "$paymentCapturedAt",
            {
              $let: {
                vars: {
                  captureEvents: {
                    $filter: {
                      input: { $ifNull: ["$events", []] },
                      as: "event",
                      cond: { $in: ["$$event.type", ["razorpay_payment_captured", "razorpay_payment_captured_after_order_ended"]] },
                    },
                  },
                },
                in: { $arrayElemAt: ["$$captureEvents.timestamp", -1] },
              },
            },
          ],
        },
      },
    },
    {
      $match: {
        paymentMethod: "razorpay",
        paymentStatus: "paid",
        settlementAt: { $type: "date", $lt: beforeToday },
        razorpayPaymentId: { $type: "string" },
      },
    },
    {
      $group: {
        _id: {
          shopId: "$shopId",
          dateKey: { $dateToString: { format: "%Y-%m-%d", date: "$settlementAt", timezone } },
        },
        amountPaise: { $sum: "$amountPaise" },
        orderIds: { $push: "$_id" },
      },
    },
  ]);

  for (const group of groups) {
    const existing = await DailySettlement.findOne({ shopId: group._id.shopId, dateKey: group._id.dateKey });
    if (existing?.status === "sent" || existing?.status === "received") continue;

    const shop = await Shop.findById(group._id.shopId).select("displayName upiId");
    if (!shop || group.amountPaise < 1) continue;
    const values = {
      amountPaise: group.amountPaise,
      orderCount: group.orderIds.length,
      orderIds: group.orderIds,
      shopName: shop.displayName,
      upiId: shop.upiId ?? "",
      paymentMode: process.env.RAZORPAY_KEY_ID?.trim().startsWith("rzp_test_") ? "test" : "live",
    };

    if (existing) {
      await DailySettlement.updateOne({ _id: existing._id, status: "pending" }, { $set: values });
    } else {
      try {
        await DailySettlement.create({ shopId: group._id.shopId, dateKey: group._id.dateKey, ...values });
      } catch (error) {
        // A unique shop/day index makes concurrent scheduler runs safe.
        if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
      }
    }
  }
}

export function previousIndiaDateKey(now = new Date()): string {
  const today = indiaStartOfToday(now);
  return indiaDateKey(new Date(today.getTime() - 1));
}
