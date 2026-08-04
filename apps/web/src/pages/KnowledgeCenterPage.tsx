import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { trainingApi, type TrainingItem } from "../services/training";

export default function KnowledgeCenterPage() {
  const [items, setItems] = useState<TrainingItem[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [filters, setFilters] = useState({ search: "", category: "", difficulty: "", type: "" });
  async function load(next = filters) { setLoading(true); setError(""); try { setItems((await trainingApi.list(next)).items); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load training."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function submit(event: FormEvent) { event.preventDefault(); void load(); }
  return <main className="training-shell">
    <header><p className="training-kicker">Training and Knowledge Center</p><h1>Learn PawnLoop at your pace</h1><p>Role-specific videos and written walkthroughs complement the interactive navigation tours.</p></header>
    <form className="training-filters" onSubmit={submit} aria-label="Knowledge filters">
      <input aria-label="Search knowledge" placeholder="Search titles, topics, or categories" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
      <input aria-label="Category" placeholder="Category" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} />
      <select aria-label="Difficulty" value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}><option value="">All difficulties</option><option>BEGINNER</option><option>INTERMEDIATE</option><option>ADVANCED</option></select>
      <select aria-label="Content type" value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">All formats</option><option>VIDEO</option><option>TUTORIAL</option></select><button>Search</button>
    </form>
    {loading ? <p role="status">Loading knowledge content…</p> : error ? <div role="alert" className="training-error"><p>{error}</p><button onClick={() => void load()}>Try again</button></div> : !items.length ? <div className="training-empty"><h2>No lessons found</h2><p>Try a broader search or check back after new content is published.</p></div> : <section className="training-grid" aria-label="Training lessons">{items.map((item) => <article className="training-card" key={item.id}>
      <div className="training-badges">{item.featured && <span>Featured</span>}{item.required && <span>Required</span>}<span>{item.type}</span></div><h2><Link to={`/knowledge/${item.slug}`}>{item.title}</Link></h2><p>{item.summary}</p><small>{item.category} · {item.difficulty.toLowerCase()} · {item.durationSeconds ? `${Math.ceil(item.durationSeconds / 60)} min` : "Self-paced"}</small><p>{item.progress?.completedAt ? "Completed" : item.progress ? `Resume at ${item.progress.resumePositionSeconds}s` : "Not started"}</p>
    </article>)}</section>}
  </main>;
}
