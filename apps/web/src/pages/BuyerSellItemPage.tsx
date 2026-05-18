import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  acceptBuyerItemSubmissionOffer,
  createBuyerItemSubmission,
  getMyBuyerItemSubmissionOffers,
  getMyBuyerItemSubmissions,
  rejectBuyerItemSubmissionOffer,
  type BuyerItemSubmission,
  type BuyerItemSubmissionOffer,
} from "../services/buyerItemSubmissions";
import "../styles/buyer-sell-item.css";

type BuyerItemIntent = "PAWN_OFFERS" | "MARKETPLACE_LISTING" | "BOTH";

type DraftSubmission = {
  title: string;
  category: string;
  condition: string;
  estimatedValue: string;
  description: string;
  intent: BuyerItemIntent;
  radius: string;
  photos: string[];
};

function intentLabel(intent: BuyerItemIntent | string) {
  if (intent === "PAWN_OFFERS") return "Get pawnshop offers";
  if (intent === "MARKETPLACE_LISTING") return "List to marketplace later";
  return "Pawn offers + marketplace listing";
}

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount) || amount <= 0) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function firstImage(images?: string[]) {
  return Array.isArray(images) && images.length ? images[0] : "";
}

export default function BuyerSellItemPage() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Electronics");
  const [condition, setCondition] = useState("Good");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [description, setDescription] = useState("");
  const [intent, setIntent] = useState<BuyerItemIntent>("PAWN_OFFERS");
  const [radius, setRadius] = useState("25");
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  const [mySubmissions, setMySubmissions] = useState<BuyerItemSubmission[]>([]);
  const [mySubmissionOffers, setMySubmissionOffers] = useState<BuyerItemSubmissionOffer[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actioningOfferId, setActioningOfferId] = useState<string | null>(null);
  const [submittedDraft, setSubmittedDraft] = useState<DraftSubmission | null>(null);

  const canSubmit = useMemo(() => {
    return title.trim() && category.trim() && condition.trim() && photoPreviews.length > 0;
  }, [title, category, condition, photoPreviews.length]);

  async function loadActivity() {
    setLoadingActivity(true);

    try {
      const [submissions, offers] = await Promise.all([
        getMyBuyerItemSubmissions(),
        getMyBuyerItemSubmissionOffers(),
      ]);

      setMySubmissions(submissions);
      setMySubmissionOffers(offers);
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Failed to load your item submissions.",
      );
    } finally {
      setLoadingActivity(false);
    }
  }

  useEffect(() => {
    void loadActivity();
  }, []);

  function handlePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const readers = files.slice(0, 6).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Failed to preview photo."));
          reader.readAsDataURL(file);
        }),
    );

    Promise.all(readers)
      .then((nextPreviews) => {
        setPhotoPreviews((current) => [...current, ...nextPreviews].slice(0, 6));
        setNotice(null);
      })
      .catch((err) => {
        setNotice(err instanceof Error ? err.message : "Failed to preview photos.");
      });
  }

  function removePhoto(index: number) {
    setPhotoPreviews((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      setNotice("Add at least one photo, a title, category, and condition before submitting.");
      return;
    }

    const draft: DraftSubmission = {
      title: title.trim(),
      category,
      condition,
      estimatedValue,
      description: description.trim(),
      intent,
      radius,
      photos: photoPreviews,
    };

    try {
      setSubmitting(true);
      setNotice(null);

      await createBuyerItemSubmission({
        title: draft.title,
        category: draft.category,
        condition: draft.condition,
        estimatedValue: draft.estimatedValue,
        description: draft.description,
        intent: draft.intent,
        radiusMiles: Number(draft.radius) || 25,
        images: draft.photos,
      });

      setSubmittedDraft(draft);
      setNotice("Item request submitted. Pawnshop owners can now review and send cash offers.");
      await loadActivity();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to submit item request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOfferDecision(
    offerId: string,
    action: "accept" | "reject",
  ) {
    try {
      setActioningOfferId(offerId);
      setNotice(null);

      if (action === "accept") {
        await acceptBuyerItemSubmissionOffer(offerId);
        setNotice("Shop offer accepted.");
      } else {
        await rejectBuyerItemSubmissionOffer(offerId);
        setNotice("Shop offer rejected.");
      }

      await loadActivity();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to update offer.");
    } finally {
      setActioningOfferId(null);
    }
  }

  function resetForm() {
    setTitle("");
    setCategory("Electronics");
    setCondition("Good");
    setEstimatedValue("");
    setDescription("");
    setIntent("PAWN_OFFERS");
    setRadius("25");
    setPhotoPreviews([]);
    setSubmittedDraft(null);
    setNotice(null);
  }

  return (
    <main className="sellitem-page">
      <section className="sellitem-hero">
        <div className="sellitem-hero-copy">
          <span className="sellitem-pill">Sell / Pawn Item</span>
          <h1>Scan or photograph your item and send it for offers.</h1>
          <p>
            Take pictures, describe the item, and prepare it for pawnshop offers or a future
            buyer-to-buyer marketplace listing.
          </p>

          <div className="sellitem-hero-actions">
            <Link to="/buyer/item-locator">Find similar items</Link>
            <Link to="/marketplace">Browse marketplace</Link>
            <button type="button" onClick={() => void loadActivity()}>
              Refresh offers
            </button>
          </div>
        </div>

        <aside className="sellitem-hero-panel">
          <div>
            <span>Photos</span>
            <strong>{photoPreviews.length}</strong>
            <small>up to 6 previews</small>
          </div>
          <div>
            <span>Requests</span>
            <strong>{mySubmissions.length}</strong>
            <small>submitted items</small>
          </div>
          <div>
            <span>Shop Offers</span>
            <strong>{mySubmissionOffers.length}</strong>
            <small>pawnshop responses</small>
          </div>
          <div>
            <span>Status</span>
            <strong>{submittedDraft ? "Sent" : "New"}</strong>
            <small>owner review workflow</small>
          </div>
        </aside>
      </section>

      <section className="sellitem-discovery-strip">
        <Link to="/buyer/dashboard">
          Buyer dashboard <span>Return to command center</span>
        </Link>
        <Link to="/buyer/item-locator">
          Item locator <span>Compare similar items</span>
        </Link>
        <Link to="/offers">
          Offers <span>Track item offers</span>
        </Link>
        <Link to="/watchlist">
          Watchlist <span>Track saved inventory</span>
        </Link>
      </section>

      {notice ? <section className="sellitem-notice">{notice}</section> : null}

      <section className="sellitem-layout">
        <form className="sellitem-form" onSubmit={handleSubmit}>
          <div className="sellitem-section-title">
            <span>Item details</span>
            <h2>Tell shops what you have</h2>
            <p>
              Clear photos and details help pawnshop owners respond faster with realistic offers.
            </p>
          </div>

          <label className="sellitem-upload-box">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={handlePhotos}
            />
            <strong>Take or upload photos</strong>
            <span>Use your phone camera or select up to 6 item photos.</span>
          </label>

          {photoPreviews.length ? (
            <div className="sellitem-photo-grid">
              {photoPreviews.map((src, index) => (
                <div key={src.slice(0, 40) + index} className="sellitem-photo">
                  <img src={src} alt={`Item preview ${index + 1}`} />
                  <button type="button" onClick={() => removePhoto(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="sellitem-field-grid">
            <label>
              <span>Item title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Example: PS5 console bundle"
              />
            </label>

            <label>
              <span>Estimated value</span>
              <input
                value={estimatedValue}
                onChange={(event) => setEstimatedValue(event.target.value)}
                placeholder="$300"
                inputMode="decimal"
              />
            </label>

            <label>
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option>Electronics</option>
                <option>Jewelry</option>
                <option>Tools</option>
                <option>Watches</option>
                <option>Gaming</option>
                <option>Collectibles</option>
                <option>Musical Instruments</option>
                <option>Other</option>
              </select>
            </label>

            <label>
              <span>Condition</span>
              <select value={condition} onChange={(event) => setCondition(event.target.value)}>
                <option>New</option>
                <option>Like New</option>
                <option>Good</option>
                <option>Fair</option>
                <option>Needs Repair</option>
                <option>Not Sure</option>
              </select>
            </label>

            <label>
              <span>What do you want?</span>
              <select
                value={intent}
                onChange={(event) => setIntent(event.target.value as BuyerItemIntent)}
              >
                <option value="PAWN_OFFERS">Get pawnshop offers</option>
                <option value="MARKETPLACE_LISTING">List to marketplace later</option>
                <option value="BOTH">Both</option>
              </select>
            </label>

            <label>
              <span>Offer radius</span>
              <select value={radius} onChange={(event) => setRadius(event.target.value)}>
                <option value="10">10 miles</option>
                <option value="25">25 miles</option>
                <option value="50">50 miles</option>
                <option value="100">100 miles</option>
              </select>
            </label>
          </div>

          <label className="sellitem-textarea-label">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Include brand, model, serial/accessory notes, condition issues, and anything a shop should know."
              rows={5}
            />
          </label>

          <div className="sellitem-actions">
            <button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit item request"}
            </button>
            <button type="button" className="secondary" onClick={resetForm}>
              Reset
            </button>
          </div>
        </form>

        <aside className="sellitem-side-panel">
          <section className="sellitem-preview-card">
            <div className="sellitem-section-title">
              <span>Preview</span>
              <h2>Submission summary</h2>
            </div>

            <div className="sellitem-preview-media">
              {photoPreviews[0] ? <img src={photoPreviews[0]} alt="Item preview" /> : <span>No photo yet</span>}
            </div>

            <div className="sellitem-summary-list">
              <div>
                <span>Title</span>
                <strong>{title || "Not entered"}</strong>
              </div>
              <div>
                <span>Category</span>
                <strong>{category}</strong>
              </div>
              <div>
                <span>Condition</span>
                <strong>{condition}</strong>
              </div>
              <div>
                <span>Estimated value</span>
                <strong>{estimatedValue || "Not entered"}</strong>
              </div>
              <div>
                <span>Intent</span>
                <strong>{intentLabel(intent)}</strong>
              </div>
            </div>
          </section>

          <section className="sellitem-next-card">
            <div className="sellitem-section-title">
              <span>Shop offers</span>
              <h2>Pawnshop responses</h2>
              <p>
                Review offers from shops and accept or reject them from here.
              </p>
            </div>

            {loadingActivity ? (
              <div className="sellitem-flow-list">
                <div>Loading your submissions and shop offers...</div>
              </div>
            ) : mySubmissionOffers.length === 0 ? (
              <div className="sellitem-flow-list">
                <div>No shop offers yet.</div>
                <div>Submit an item request and nearby shops can respond.</div>
              </div>
            ) : (
              <div className="sellitem-flow-list">
                {mySubmissionOffers.map((offer) => (
                  <div key={offer.id}>
                    <strong>{offer.shop?.name || "Pawnshop"}</strong>
                    <span>{formatMoney(offer.amount)} · {offer.status}</span>
                    <small>{offer.submission?.title || "Submitted item"}</small>
                    {offer.message ? <small>{offer.message}</small> : null}

                    {String(offer.status || "").toUpperCase() === "PENDING" ? (
                      <div className="sellitem-mini-actions">
                        <button
                          type="button"
                          disabled={actioningOfferId === offer.id}
                          onClick={() => void handleOfferDecision(offer.id, "accept")}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={actioningOfferId === offer.id}
                          onClick={() => void handleOfferDecision(offer.id, "reject")}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="sellitem-next-card">
            <div className="sellitem-section-title">
              <span>My submissions</span>
              <h2>Submitted items</h2>
            </div>

            <div className="sellitem-flow-list">
              {mySubmissions.length === 0 ? (
                <div>No submitted items yet.</div>
              ) : (
                mySubmissions.slice(0, 5).map((submission) => (
                  <div key={submission.id}>
                    {firstImage(submission.images) ? (
                      <img
                        src={firstImage(submission.images)}
                        alt={submission.title}
                        style={{
                          width: "100%",
                          height: 120,
                          objectFit: "cover",
                          borderRadius: 12,
                          marginBottom: 8,
                        }}
                      />
                    ) : null}
                    <strong>{submission.title}</strong>
                    <span>{submission.status} · {intentLabel(submission.intent)}</span>
                    <small>{submission.category || "Category not listed"}</small>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
