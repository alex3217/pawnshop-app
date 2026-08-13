import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createShopConversation, type ContactReason } from "../services/shopMessaging";
import { getMyBuyerItemSubmissions, type BuyerItemSubmission } from "../services/buyerItemSubmissions";
import "../styles/shop-messaging.css";

const reasons: Array<[ContactReason, string]> = [["SELL_ITEM", "Sell an item"], ["PAWN_ITEM", "Pawn an item"], ["INVENTORY", "Ask about inventory"], ["OFFER", "Ask about an offer"], ["VISIT", "Schedule or discuss a visit"], ["OTHER", "Other"]];
export default function MessageShopPage() {
  const { id = "" } = useParams(); const navigate = useNavigate();
  const [reason, setReason] = useState<ContactReason>("SELL_ITEM"); const [subject, setSubject] = useState(""); const [message, setMessage] = useState("");
  const [submissions, setSubmissions] = useState<BuyerItemSubmission[]>([]); const [submissionId, setSubmissionId] = useState("");
  const [error, setError] = useState<string | null>(null); const [sending, setSending] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSending(true); setError(null);
    try { const result = await createShopConversation({ shopId: id, subject, contactReason: reason, message, ...(submissionId ? { buyerItemSubmissionId: submissionId } : {}) }); navigate(`/messages/${result.conversation.id}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start conversation."); }
    finally { setSending(false); }
  }
  useEffect(() => { const controller = new AbortController(); void getMyBuyerItemSubmissions(controller.signal).then(setSubmissions).catch(() => setSubmissions([])); return () => controller.abort(); }, []);
  return <main className="messaging-page"><section className="messaging-panel"><Link to={`/shops/${id}`}>← Back to shop</Link><h1>Message this pawnshop</h1><p>Messaging complements PawnLoop’s structured <Link to="/buyer/sell-item">Sell / Pawn Item</Link> workflow. Prices, identity checks, agreements, and payments stay in that workflow.</p><form onSubmit={submit} className="messaging-form"><label>Contact reason<select value={reason} onChange={(e) => setReason(e.target.value as ContactReason)}>{reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{submissions.length ? <label>Related Sell / Pawn submission (optional)<select value={submissionId} onChange={(e) => setSubmissionId(e.target.value)}><option value="">No linked submission</option>{submissions.map((submission) => <option key={submission.id} value={submission.id}>{submission.title} · {submission.status}</option>)}</select></label> : null}<label>Subject<input required maxLength={120} value={subject} onChange={(e) => setSubject(e.target.value)} /></label><label>Message<textarea required maxLength={4000} rows={7} value={message} onChange={(e) => setMessage(e.target.value)} /></label><small>No links, HTML, or attachments are supported in V1.</small>{error ? <p role="alert" className="messaging-error">{error}</p> : null}<button disabled={sending}>{sending ? "Sending…" : "Start private conversation"}</button></form></section></main>;
}
