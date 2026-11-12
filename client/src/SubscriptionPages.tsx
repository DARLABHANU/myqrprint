import { Clock3 } from "lucide-react";

function SubscriptionPlaceholder({ admin = false }: { admin?: boolean }) {
  return (
    <div className="workspace-page">
      <main className="settings-main">
        <section className="settings-card">
          <div className="reports-card-heading">
            <div>
              <h1>{admin ? "Subscription management" : "Shop subscription"}</h1>
              <p>Subscription plans and billing are not available yet.</p>
            </div>
          </div>
          <div className="success-alert" role="status">
            <Clock3 size={16} />
            <span>
              {admin
                ? "Subscription payments and plan activation are paused. No payment requests can be reviewed or approved."
                : "This is a placeholder for future subscription options. There is no subscription checkout, payment collection, expiry, or order limit."}
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

export function SubscriptionPage() {
  return <SubscriptionPlaceholder />;
}

export function AdminSubscriptionReviewPage() {
  return <SubscriptionPlaceholder admin />;
}
