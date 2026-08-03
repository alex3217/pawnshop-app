import { launchReadiness } from "../data/launchReadiness";

export default function SuperAdminLaunchReadinessPage() {
  return (
    <main className="admin-page space-y-6">
      <header className="admin-page-header">
        <div><p className="eyebrow">Super Admin only</p><h1>Launch War Room</h1></div>
        <p>Evidence-driven readiness; a status is never promoted without retained evidence.</p>
        <p><strong>Last updated:</strong> <time dateTime={launchReadiness.lastUpdated}>{new Date(launchReadiness.lastUpdated).toLocaleString()}</time></p>
      </header>
      <section aria-labelledby="launch-gates-heading">
        <h2 id="launch-gates-heading">Launch gates</h2>
        <div className="admin-grid">
          {launchReadiness.items.map((item) => <article className="admin-card" key={item.area}><h3>{item.area}</h3><strong>{item.status}</strong><p>{item.evidence}</p></article>)}
        </div>
      </section>
      <section aria-labelledby="launch-decisions-heading">
        <h2 id="launch-decisions-heading">Launch decisions</h2>
        <div className="admin-grid">
          {launchReadiness.decisions.map((item) => <article className="admin-card" key={item.area}><h3>{item.area}</h3><strong>{item.status}</strong><p>{item.evidence}</p></article>)}
        </div>
      </section>
    </main>
  );
}
