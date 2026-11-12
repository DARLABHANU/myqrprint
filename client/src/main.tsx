import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Comprehensive Frontend Activity & Network Logger
if (typeof window !== "undefined") {
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const [resource, config] = args;
    const url = typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource.url;
    const method = (config?.method || "GET").toUpperCase();
    const start = performance.now();

    let sanitizedPayload: any = undefined;
    if (config?.body && typeof config.body === "string") {
      try {
        sanitizedPayload = JSON.parse(config.body);
        if (sanitizedPayload?.password) sanitizedPayload.password = "******";
        if (sanitizedPayload?.currentPassword) sanitizedPayload.currentPassword = "******";
        if (sanitizedPayload?.newPassword) sanitizedPayload.newPassword = "******";
      } catch {
        sanitizedPayload = config.body;
      }
    }

    const isFrequentPolling = url.includes("/api/agent/") || url.includes("/heartbeat");
    if (!isFrequentPolling) {
      console.log(`%c[NET REQ] ${method} ${url}`, "color: #2563eb; font-weight: 600;", sanitizedPayload ? sanitizedPayload : "");
    }

    try {
      const response = await originalFetch(...args);
      const duration = Math.round(performance.now() - start);

      if (!isFrequentPolling || !response.ok) {
        const color = response.ok ? "#059669" : "#dc2626";
        console.log(`%c[NET RES] ${method} ${url} -> ${response.status} (${duration}ms)`, `color: ${color}; font-weight: 600;`);
      }
      return response;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      console.error(`%c[NET FAILED] ${method} ${url} (${duration}ms)`, "color: #b91c1c; font-weight: bold;", error);
      throw error;
    }
  };

  window.addEventListener("error", (event) => {
    console.error("%c[UI ERROR]", "color: #dc2626; font-weight: bold;", event.message, event.error);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("%c[UNHANDLED PROMISE]", "color: #dc2626; font-weight: bold;", event.reason);
  });

  console.log("%c[Printly UI] Frontend logger active. Monitoring all routes and API calls.", "color: #7c3aed; font-weight: bold;");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
