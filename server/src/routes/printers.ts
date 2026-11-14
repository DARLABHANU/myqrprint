import { createConnection } from "node:net";
import { Router, type NextFunction, type Request, type Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import { z } from "zod";
import { PrinterRoute } from "../models/PrinterRoute.js";
import { requireDesktopAgent } from "../agentAccess.js";
import { Shop } from "../models/Shop.js";
import { ShopPrinter } from "../models/ShopPrinter.js";

export const printersRouter = Router();

function probeTcpAlive(host: string, port: number, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: timeoutMs }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function parseNetworkTarget(str: string): { host: string; port: number } | null {
  if (!str) return null;
  const urlMatch = str.match(/(?:https?|ipp|ipps):\/\/([^\s\/\:]+)(?::(\d+))?/i);
  if (urlMatch) {
    const isHttps = urlMatch[0].toLowerCase().startsWith("https") || urlMatch[0].toLowerCase().startsWith("ipps");
    return {
      host: urlMatch[1],
      port: Number(urlMatch[2] || (isHttps ? 443 : 631)),
    };
  }
  const ipMatch = str.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d+))?\b/);
  if (ipMatch) {
    return {
      host: ipMatch[1],
      port: Number(ipMatch[2] || 631),
    };
  }
  return null;
}

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
      ShopPrinter.find({ shopId: shop._id, $or: [{ systemName: { $ne: "virtual on http://192.168.1.5:10631" } }, { agentDeviceId: { $exists: true } }] }).sort({ createdAt: 1 }),
      PrinterRoute.find({ shopId: shop._id }).sort({ paperSize: 1, colour: 1, duplex: 1 }),
    ]);

    // If a printer is installed in Windows on this PC (e.g. virtual on http://...),
    // Windows manages its spooling and connection. Only direct IPP printers added by custom IPP address URL probe TCP.
    await Promise.all(
      printers.map(async (printer) => {
        if (printer.protocol === "ipp" && printer.address) {
          const target = parseNetworkTarget(printer.address);
          if (target) {
            const isAlive = await probeTcpAlive(target.host, target.port, 2500);
            const newStatus = isAlive ? "ready" : "offline";
            if (printer.status !== newStatus) {
              printer.status = newStatus;
              await ShopPrinter.updateOne({ _id: printer._id }, { $set: { status: newStatus } });
            }
          }
        }
      })
    );

    response.json({ printers, routes });
  } catch (error) { next(error); }
});

printersRouter.post("/printers", requireDesktopAgent, async (request, response, next) => {
  const parsed = printerSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Check the printer name and IPP address." }); return; }
  try {
    const shop = await ownerShop(request);
    if (!shop) { response.status(404).json({ error: "Shop settings were not found." }); return; }
    const printer = await ShopPrinter.create({ shopId: shop._id, ...parsed.data, status: "ready" });
    response.status(201).json({ printer });
  } catch (error) { next(error); }
});

printersRouter.patch("/printers/:printerId/status", requireDesktopAgent, async (request, response, next) => {
  const id = z.string().refine(isValidObjectId).safeParse(request.params.printerId);
  const status = z.enum(["ready", "offline"]).safeParse(request.body?.status);
  if (!id.success || !status.success) { response.status(400).json({ error: "Choose a valid printer status." }); return; }
  try {
    const shop = await ownerShop(request);
    const printer = shop ? await ShopPrinter.findOne({ _id: id.data, shopId: shop._id }) : null;
    if (!printer) { response.status(404).json({ error: "Printer not found." }); return; }
    printer.status = status.data;
    await printer.save();
    response.json({ printer });
  } catch (error) { next(error); }
});

printersRouter.delete("/printers/:printerId", requireDesktopAgent, async (request, response, next) => {
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

printersRouter.put("/printer-routes", requireDesktopAgent, async (request, response, next) => {
  const parsed = routesSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ error: "Check the printer routing rules." }); return; }
  try {
    const shop = await ownerShop(request);
    if (!shop) { response.status(404).json({ error: "Shop settings were not found." }); return; }
    const printerIds = [...new Set(parsed.data.routes.map((route) => route.printerId))];
    const ownedPrinters = await ShopPrinter.find({ _id: { $in: printerIds }, shopId: shop._id }).select("_id");
    const ownedPrinterIdSet = new Set(ownedPrinters.map((p) => String(p._id)));

    const validRoutes: typeof parsed.data.routes = [];
    const keys = new Set<string>();
    for (const route of parsed.data.routes) {
      if (!ownedPrinterIdSet.has(route.printerId)) continue;
      const key = `${route.paperSize}:${route.colour}:${route.duplex}`;
      if (keys.has(key)) continue;
      keys.add(key);
      validRoutes.push(route);
    }

    const operations = validRoutes.map((route) => ({
      updateOne: {
        filter: { shopId: shop._id, paperSize: route.paperSize, colour: route.colour, duplex: route.duplex },
        update: { $set: { printerId: new Types.ObjectId(route.printerId) } },
        upsert: true,
      },
    }));
    if (operations.length) await PrinterRoute.bulkWrite(operations);

    if (validRoutes.length > 0) {
      await PrinterRoute.deleteMany({
        shopId: shop._id,
        $nor: validRoutes.map((item) => ({ paperSize: item.paperSize, colour: item.colour, duplex: item.duplex })),
      });
    } else {
      await PrinterRoute.deleteMany({ shopId: shop._id });
    }

    const routes = await PrinterRoute.find({ shopId: shop._id }).sort({ paperSize: 1, colour: 1, duplex: 1 });
    response.json({ routes });
  } catch (error) { next(error); }
});
