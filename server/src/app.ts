import cors from "cors";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
import { authRouter } from "./routes/auth.js";
import { merchantOrdersRouter } from "./routes/merchantOrders.js";
import { publicShopsRouter } from "./routes/publicShops.js";
import { shopsRouter } from "./routes/shops.js";
import { printersRouter } from "./routes/printers.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";

export const app = express();
app.set("trust proxy", 1);
const allowedOrigins = new Set(
  (process.env.CLIENT_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const sessionSecret = process.env.SESSION_SECRET;
const mongoUri = process.env.MONGODB_URI;

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Request origin is not allowed."));
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
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
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 12,
    },
  }),
);

app.use((request, response, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    const origin = request.get("origin");
    if (!origin || !allowedOrigins.has(origin)) {
      response.status(403).json({ error: "Request origin is not allowed." });
      return;
    }
  }
  next();
});

app.use("/api/auth", authRouter);
app.use("/api/shops", shopsRouter);
app.use("/api/shops", printersRouter);
app.use("/api/shops", printersRouter);
app.use("/api/shops", merchantOrdersRouter);
app.use("/api/public/shops", publicShopsRouter);
app.use("/api", subscriptionsRouter);

app.get("/api/health", (_request, response) => {
  const database = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  const status = database === "connected" ? 200 : 503;

  response.status(status).json({
    status: database === "connected" ? "ok" : "unavailable",
    database,
  });
});

app.use((_request, response) => {
  response.status(404).json({ error: "Route not found." });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof Error && error.message === "Request origin is not allowed.") {
    response.status(403).json({ error: "Request origin is not allowed." });
    return;
  }
  console.error("API request failed:", error);
  response.status(500).json({ error: "The server could not complete the request." });
});
