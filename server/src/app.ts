import "./env.js";
import cors from "cors";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
import { agentRouter } from "./routes/agent.js";
import { authRouter } from "./routes/auth.js";
import { merchantOrdersRouter } from "./routes/merchantOrders.js";
import { publicShopsRouter } from "./routes/publicShops.js";
import { shopsRouter } from "./routes/shops.js";
import { printersRouter } from "./routes/printers.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import { adminSubscriptionsRouter } from "./routes/adminSubscriptions.js";
import { razorpayWebhookRouter } from "./routes/razorpayWebhook.js";
import { adminSettlementsRouter } from "./routes/adminSettlements.js";
import { shopSettlementsRouter } from "./routes/shopSettlements.js";
import { isMailConfigured } from "./services/mail.js";

export const app = express();
app.set("trust proxy", 1);
const allowedOrigins = new Set([
  ...(process.env.CLIENT_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  "https://urqrprint.shop",
  "https://www.urqrprint.shop",
]);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || origin === "null" || origin.startsWith("file:") || origin.startsWith("vscode-webview:")) return true;
  if (allowedOrigins.has(origin)) return true;
  if (process.env.NODE_ENV !== "production" || /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) {
    return true;
  }
  return false;
}

const sessionSecret = process.env.SESSION_SECRET;
const mongoUri = process.env.MONGODB_URI;

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Request origin is not allowed."));
  },
  credentials: true,
}));
app.use("/api/payments/razorpay/webhook", express.raw({ type: "application/json", limit: "1mb" }), razorpayWebhookRouter);
app.use(express.json({ limit: "1mb" }));

// Comprehensive Backend Activity & Request Logger
app.use((request, response, next) => {
  const start = Date.now();
  const time = new Date().toLocaleTimeString();

  // Exclude high-frequency agent polling from flooding the console
  const isAgentPolling = request.path === "/api/agent/jobs/next" || request.path === "/api/agent/heartbeat";

  response.on("finish", () => {
    if (isAgentPolling && response.statusCode < 400) return;

    const duration = Date.now() - start;
    const code = response.statusCode;
    const color = code >= 500 ? "\x1b[31m" : code >= 400 ? "\x1b[33m" : code >= 300 ? "\x1b[36m" : "\x1b[32m";
    const reset = "\x1b[0m";

    let sanitizedBody = "";
    if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body) && Object.keys(request.body).length > 0) {
      const copy = { ...request.body };
      if ("password" in copy) copy.password = "******";
      if ("currentPassword" in copy) copy.currentPassword = "******";
      if ("newPassword" in copy) copy.newPassword = "******";
      sanitizedBody = ` | Body: ${JSON.stringify(copy)}`;
    }

    const queryStr = Object.keys(request.query).length > 0 ? ` ?${new URLSearchParams(request.query as Record<string, string>).toString()}` : "";
    console.log(`[${time}] ${color}${request.method} ${request.baseUrl || ""}${request.path}${queryStr}${reset} -> ${color}${code}${reset} (${duration}ms)${code >= 400 ? sanitizedBody : ""}`);
  });

  next();
});
if (!mongoUri) {
  throw new Error("MONGODB_URI is required. Set it in server/.env.");
}
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters.");
}

app.use(
  session({
    name: "printly.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: mongoUri }),
    cookie: {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      secure: process.env.NODE_ENV === "production",
      // Keep shop owners signed in across browser and desktop-agent restarts.
      // Rolling expiry renews this window while the account is actively used.
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
    rolling: true,
  }),
);

app.use((request, response, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    const origin = request.get("origin");
    const isAgentEndpoint = request.path === "/api/agent/connect"
      || request.path === "/api/agent/heartbeat"
      || request.path === "/api/agent/jobs/next"
      || /^\/api\/agent\/jobs\/[^/]+\/(files\/[^/]+|result)$/.test(request.path);
    if (!isAgentEndpoint && !isAllowedOrigin(origin)) {
      response.status(403).json({ error: "Request origin is not allowed." });
      return;
    }
  }
  next();
});

app.use("/api/auth", authRouter);
app.use("/api/shops", shopsRouter);
app.use("/api/shops", subscriptionsRouter);
app.use("/api/shops", printersRouter);
app.use("/api/shops", merchantOrdersRouter);
app.use("/api/admin/subscriptions", adminSubscriptionsRouter);
app.use("/api/admin/settlements", adminSettlementsRouter);
app.use("/api/shops/settlements", shopSettlementsRouter);
app.use("/api/agent", agentRouter);
app.use("/api/public/shops", publicShopsRouter);
app.get("/api/health", (_request, response) => {
  const database = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  const status = database === "connected" ? 200 : 503;

  response.status(status).json({
    status: database === "connected" ? "ok" : "unavailable",
    database,
    emailDelivery: process.env.NODE_ENV === "production"
      ? isMailConfigured() ? "configured" : "not_configured"
      : "development-console",
    googleSignIn: process.env.GOOGLE_CLIENT_ID?.trim() ? "configured" : "not_configured",
  });
});

app.use((_request, response) => {
  response.status(404).json({ error: "Route not found." });
});

app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof Error && error.message === "Request origin is not allowed.") {
    console.warn(`\x1b[33m[ORIGIN BLOCKED]\x1b[0m ${request.method} ${request.originalUrl} from origin: ${request.get("origin")}`);
    response.status(403).json({ error: "Request origin is not allowed." });
    return;
  }
  console.error(`\x1b[31m[API EXCEPTION]\x1b[0m ${request.method} ${request.originalUrl}:`, error instanceof Error ? error.stack || error.message : error);
  const errorMessage = error instanceof Error ? error.message : "The server could not complete the request.";
  response.status(500).json({ error: errorMessage });
});
