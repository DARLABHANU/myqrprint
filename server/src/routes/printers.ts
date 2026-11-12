import { Router, type NextFunction, type Request, type Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import { PrinterRoute } from "../models/PrinterRoute.js";
import { Shop } from "../models/Shop.js";
import { ShopPrinter } from "../models/ShopPrinter.js";

export const printersRouter = Router();

const sizes = ["A3", "A4", "A5", "Legal"] as const;
const printerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  protocol: z.enum(["simulated", "ipp"]),
  address: z.string().trim().max(200).optional(),
  supportsColour: z.boolean().default(false),
  supportsDuplex: z.boolean().default(false),
  paperSizes: z.array(z.enum(sizes)).min(1).max(4).default(["A4"]),
}).strict().superRefine((value, context) => {
  if (value.protocol === "ipp") {
    try {
      const url = new URL(value.address ?? "");
      if (!(["ipp:", "ipps:", "http:", "https:"].includes(url.protocol))) throw new Error("protocol");
    } catch {
      context.addIssue({ code: "custom", path: ["address"], message: "Enter a valid IPP address, such as ipp://192.168.1.40:631/ipp/print." });
    }
  }
});
const routesSchema = z.object({ routes: z.array(z.object({
  paperSize: z.enum(sizes), colour: z.boolean(), duplex: z.boolean(), printerId: z.string().refine(isValidObjectId),
}).strict()).max(64) }).strict();

function requireOwner(request: Request, response: Response, next: NextFunction) {
  if (!request.session.userId || !isValidObjectId(request.session.userId)) {
    response.status(401).json({ error: "Sign in to manage printers." });
    return;
  }
  next();
}
printersRouter.use(requireOwner);

async function ownerShop(request: Request) {
  return Shop.findOne({ ownerId: request.session.userId }).select("_id enabledPaperSizes colourEnabled duplexEnabled");
}

printersRouter.get("/printers", async (request, response, next) => {
  try {
    const shop = await ownerShop(request);
    if (!shop) { response.status(404).json({ error: "Shop settings were not found." }); return; }
    const [printers, routes] = await Promise.all([
      ShopPrinter.find({ shopId: shop._id }).sort({ createdAt: 1 }),
      PrinterRoute.find({ shopId: shop._id }).sort({ paperSize: 1, colour: 1, duplex: 1 }),
    ]);
    response.json({ printers, routes });
  } catch (error) { next(error); }
});

printersRouter.post("/printers", async (request, response, next) => {
  const parsed = printerSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Check the printer name and IPP address." }); return; }
  try {
    const shop = await ownerShop(request);
    if (!shop) { response.status(404).json({ error: "Shop settings were not found." }); return; }
    const printer = await ShopPrinter.create({ shopId: shop._id, ...parsed.data, status: "offline" });
    response.status(201).json({ printer });
  } catch (error) { next(error); }
});

printersRouter.patch("/printers/:printerId/status", async (request, response, next) => {
  const id = z.string().refine(isValidObjectId).safeParse(request.params.printerId);
  const status = z.enum(["ready", "offline"]).safeParse(request.body?.status);
  if (!id.success || !status.success) { response.status(400).json({ error: "Choose a valid printer status." }); return; }
  try {
    const shop = await ownerShop(request);
    const printer = shop ? await ShopPrinter.findOne({ _id: id.data, shopId: shop._id }) : null;
    if (!printer) { response.status(404).json({ error: "Printer not found." }); return; }
    if (printer.protocol !== "simulated") { response.status(409).json({ error: "IPP printer readiness will be reported by the print agent when it is added." }); return; }
    printer.status = status.data;
    await printer.save();
    response.json({ printer });
  } catch (error) { next(error); }
});

printersRouter.delete("/printers/:printerId", async (request, response, next) => {
  const id = z.string().refine(isValidObjectId).safeParse(request.params.printerId);
  if (!id.success) { response.status(400).json({ error: "Choose a valid printer." }); return; }
  try {
    const shop = await ownerShop(request);
    if (!shop) { response.status(404).json({ error: "Shop settings were not found." }); return; }
    await Promise.all([
      ShopPrinter.deleteOne({ _id: id.data, shopId: shop._id }),
      PrinterRoute.deleteMany({ shopId: shop._id, printerId: id.data }),
    ]);
    response.status(204).end();
  } catch (error) { next(error); }
});

printersRouter.put("/printer-routes", async (request, response, next) => {
  const parsed = routesSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Check the printer routing rules." }); return; }
  try {
    const shop = await ownerShop(request);
    if (!shop) { response.status(404).json({ error: "Shop settings were not found." }); return; }
    const printerIds = [...new Set(parsed.data.routes.map((route) => route.printerId))];
    const ownedPrinters = await ShopPrinter.find({ _id: { $in: printerIds }, shopId: shop._id }).select("_id");
    if (ownedPrinters.length !== printerIds.length) { response.status(400).json({ error: "Every route must use a printer registered to this shop." }); return; }
    const keys = new Set<string>();
    for (const route of parsed.data.routes) {
      if (!shop.enabledPaperSizes.includes(route.paperSize) || (route.colour && !shop.colourEnabled) || (route.duplex && !shop.duplexEnabled)) {
        response.status(400).json({ error: "A route uses a print option that is disabled for this shop." }); return;
      }
      const key = `${route.paperSize}:${route.colour}:${route.duplex}`;
      if (keys.has(key)) { response.status(400).json({ error: "Each print combination can have only one route." }); return; }
      keys.add(key);
    }
    const operations = parsed.data.routes.map((route) => ({
      updateOne: {
        filter: { shopId: shop._id, paperSize: route.paperSize, colour: route.colour, duplex: route.duplex },
        update: { $set: { printerId: new Types.ObjectId(route.printerId) } },
        upsert: true,
      },
    }));
    if (operations.length) await PrinterRoute.bulkWrite(operations);
    const retained = parsed.data.routes.map((route) => ({ shopId: shop._id, paperSize: route.paperSize, colour: route.colour, duplex: route.duplex }));
    await PrinterRoute.deleteMany({ shopId: shop._id, ...(retained.length ? { $nor: retained.map((item) => ({ paperSize: item.paperSize, colour: item.colour, duplex: item.duplex })) } : {}) });
    const routes = await PrinterRoute.find({ shopId: shop._id }).sort({ paperSize: 1, colour: 1, duplex: 1 });
    response.json({ routes });
  } catch (error) { next(error); }
});
