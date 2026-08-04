import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { trainingApi, type TrainingItem } from "../services/training";

export default function KnowledgeLessonPage() {
  const { slug = "" } = useParams(); const [item, setItem] = useState<TrainingItem | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function load() { setLoading(true); setError(""); try { setItem((await trainingApi.get(slug)).item); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load this lesson."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save(completed: boolean) { if (!item) return; setSaving(true); setError(""); try { await trainingApi.progress(item.id, completed ? (item.durationSeconds || item.progress?.resumePositionSeconds || 0) : (item.progress?.resumePositionSeconds || 0), completed); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save progress."); } finally { setSaving(false); } }
  if (loading) return <main className="training-shell"><p role="status">Loading lesson…</p></main>;
  if (error && !item) return <main className="training-shell"><div role="alert" className="training-error"><p>{error}</p><button onClick={() => void load()}>Try again</button></div></main>;
  if (!item) return null;
  return <main className="training-shell training-lesson"><Link to="/knowledge">← Knowledge Center</Link><header><div className="training-badges"><span>{item.category}</span><span>{item.difficulty}</span>{item.required && <span>Required</span>}</div><h1>{item.title}</h1><p>{item.summary}</p></header>
    {error && <p role="alert" className="training-error">{error}</p>}
    {item.type === "VIDEO" && item.videoUrl ? <section><h2>Training video</h2><p><a href={item.videoUrl} target="_blank" rel="noopener noreferrer">Watch on the approved video provider</a></p><p>For safety, PawnLoop opens the validated provider URL and never stores executable embed code.</p></section> : <ol className="training-steps">{item.steps.map((step) => <li key={step.position}><h2>{step.title}</h2><p>{step.body}</p></li>)}</ol>}
    <div className="training-actions"><button disabled={saving || Boolean(item.progress?.completedAt)} onClick={() => void save(true)}>{item.progress?.completedAt ? "Completed" : saving ? "Saving…" : "Mark complete"}</button></div>
  </main>;
}
