import { Shop } from "../models/Shop.js";
import { PrintOrder } from "../models/PrintOrder.js";
import { isMailConfigured, sendAccountEmail } from "./mail.js";
let running = false;

function kolkataParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${read("year")}-${read("month")}-${read("day")}`, hour: Number(read("hour")) };
}

export async function sendDailyShopSummaries(now = new Date()): Promise<void> {
  if (!isMailConfigured() || running) return;
  const { date, hour } = kolkataParts(now);
  if (hour < 21) return;
  running = true;
  try {
  const start = new Date(`${date}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const shops = await Shop.find({ "notificationPreferences.dailyEmail": true, email: { $ne: "" }, lastDailySummaryDate: { $ne: date } }).select("_id email displayName lastDailySummaryDate");
  for (const shop of shops) {
    const [total, paid] = await Promise.all([
      PrintOrder.aggregate([{ $match: { shopId: shop._id, createdAt: { $gte: start, $lt: end } } }, { $group: { _id: null, orders: { $sum: 1 }, pages: { $sum: { $sum: "$files.pageCount" } } } }]),
      PrintOrder.aggregate([{ $match: { shopId: shop._id, createdAt: { $gte: start, $lt: end }, paymentStatus: "paid" } }, { $group: { _id: null, paise: { $sum: "$amountPaise" } } }]),
    ]);
    const orderCount = total[0]?.orders ?? 0;
    const pages = total[0]?.pages ?? 0;
    const earnings = paid[0]?.paise ?? 0;
    await sendAccountEmail(shop.email, `${shop.displayName}: daily shop summary`, `Daily summary for ${date}\n\nOrders: ${orderCount}\nSource pages: ${pages}\nPayments manually confirmed: ₹${(earnings / 100).toFixed(2)}\n\nThis summary includes only orders created today in India Standard Time. Payments are recorded after you confirm them in UrQrPrint.`);
    shop.lastDailySummaryDate = date;
    await shop.save();
  }
  } finally { running = false; }
}
