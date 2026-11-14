import assert from "node:assert/strict";
import test from "node:test";
import { calculateCustomerQuote } from "./customerOrder.js";
import { CustomerUpload } from "./models/CustomerUpload.js";
import { Shop } from "./models/Shop.js";
import { transitionMerchantOrder } from "./orderWorkflow.js";
import { calculateQuote } from "./pricing.js";

function makeShop() {
  return new Shop({
    enabledPaperSizes: ["A4"],
    colourEnabled: true,
    duplexEnabled: true,
    maxCopies: 10,
    rates: new Map([["A4", {
      blackWhiteSimplexPaise: 500,
      colourSimplexPaise: 1000,
      blackWhiteDuplexSheetPaise: 800,
      colourDuplexSheetPaise: 1500,
    }]]),
  });
}

test("simplex pricing charges each page for every copy", () => {
  assert.deepEqual(calculateQuote(4, 3, 500, false), {
    amountPaise: 6000,
    billableUnits: 4,
    unit: "pages",
  });
});

test("duplex pricing charges physical sheets", () => {
  assert.deepEqual(calculateQuote(4, 2, 800, true), {
    amountPaise: 3200,
    billableUnits: 2,
    unit: "sheets",
  });
});

test("an odd duplex page count charges one full sheet for its final page", () => {
  assert.deepEqual(calculateQuote(5, 1, 800, true), {
    amountPaise: 2400,
    billableUnits: 3,
    unit: "sheets",
  });
});

test("customer duplex quote charges a full sheet for an odd final page", () => {
  const uploads = [new CustomerUpload({ kind: "document", pageCount: 5 })];
  const quote = calculateCustomerQuote(makeShop(), uploads, {
    paperSize: "A4",
    colour: false,
    duplex: true,
    copies: 2,
  });

  assert.equal(quote.amountPaise, 4800);
  assert.equal(quote.billableUnits, 3);
  assert.equal(quote.unit, "sheets");
  assert.equal(quote.sourcePages, 5);
});

test("photo quote converts source photos into layout pages", () => {
  const uploads = [new CustomerUpload({ kind: "photo", pageCount: 7 })];
  const quote = calculateCustomerQuote(makeShop(), uploads, {
    paperSize: "A4",
    colour: true,
    duplex: false,
    copies: 1,
    photoLayout: "four",
  });

  assert.equal(quote.amountPaise, 2000);
  assert.equal(quote.billableUnits, 2);
  assert.equal(quote.unit, "pages");
  assert.equal(quote.sourcePages, 7);
});

test("customer quote rejects mixed document and photo uploads", () => {
  const uploads = [
    new CustomerUpload({ kind: "document", pageCount: 1 }),
    new CustomerUpload({ kind: "photo", pageCount: 1 }),
  ];

  assert.throws(
    () => calculateCustomerQuote(makeShop(), uploads, {
      paperSize: "A4",
      colour: false,
      duplex: false,
      copies: 1,
    }),
    /either PDF documents or photos/,
  );
});

test("merchant confirmation marks UPI as paid and holds the order for approval", () => {
  assert.deepEqual(
    transitionMerchantOrder({
      status: "awaiting_payment",
      paymentMethod: "upi",
      paymentStatus: "unverified",
    }, "confirm_payment"),
    { status: "needs_approval", paymentMethod: "upi", paymentStatus: "paid" },
  );
});

test("merchant confirmation auto-queues UPI when auto print is enabled", () => {
  const result = transitionMerchantOrder({ status: "awaiting_payment", paymentMethod: "upi", paymentStatus: "unverified" }, "confirm_payment", { autoPrint: true });
  assert.deepEqual(result, { status: "queued", paymentMethod: "upi", paymentStatus: "paid" });
});

test("cash orders enter the print queue only after the shop confirms cash", () => {
  const result = transitionMerchantOrder({ status: "awaiting_cash", paymentMethod: "cash", paymentStatus: "awaiting_cash" }, "confirm_payment");
  assert.deepEqual(result, { status: "queued", paymentMethod: "cash", paymentStatus: "paid" });
});

test("merchant approves a paid order for manual fulfillment", () => {
  const approved = transitionMerchantOrder({
    status: "needs_approval",
    paymentMethod: "upi",
    paymentStatus: "paid",
  }, "approve_order");
  assert.equal(approved.status, "queued");
});

test("merchant cannot mark an unpaid order ready for pickup", () => {
  assert.throws(
    () => transitionMerchantOrder({
      status: "awaiting_cash",
      paymentMethod: "cash",
      paymentStatus: "awaiting_cash",
    }, "mark_ready"),
    /Only a paid order in the print workflow/,
  );
});

test("shopkeeper can retry a paid failed print without discarding its order", () => {
  const retry = transitionMerchantOrder({ status: "failed", paymentMethod: "cash", paymentStatus: "paid" }, "requeue");
  assert.equal(retry.status, "queued");
});

test("shopkeeper can retry a submitted print that did not produce paper", () => {
  const retry = transitionMerchantOrder({ status: "submitted", paymentMethod: "upi", paymentStatus: "paid" }, "requeue");
  assert.equal(retry.status, "queued");
});

test("merchant moves a paid order from manual fulfillment to ready for pickup", () => {
  const ready = transitionMerchantOrder({
    status: "queued",
    paymentMethod: "cash",
    paymentStatus: "paid",
  }, "mark_ready");
  assert.equal(ready.status, "printed");
});
