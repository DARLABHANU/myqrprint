import { Printer } from "lucide-react";

export function PrinterManagementPage() {
  return (
    <div className="workspace-page">
      <main className="settings-main">
        <section className="settings-card">
          <div className="reports-card-heading">
            <div>
              <h1>Printer management</h1>
              <p>Printer setup and automatic fulfillment are temporarily paused.</p>
            </div>
            <Printer size={22} aria-hidden="true" />
          </div>
          <div className="form-alert" role="status">
            The printer agent, printer pairing, printer routing, and print-job execution are unavailable. Customer orders and payment tracking remain available. Shops can prepare orders outside Printly and mark paid orders ready for pickup.
          </div>
        </section>
      </main>
    </div>
  );
}
