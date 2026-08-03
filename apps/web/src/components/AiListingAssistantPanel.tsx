import { useState } from "react";
import {
  requestListingAssistant,
  type AiListingSuggestion,
} from "../services/aiListingAssistant";

export type AiListingAssistantFields = {
  title: string;
  description: string;
  category: string;
  condition: string;
  price?: string | number;
  images?: string[];
  shopName?: string;
  notes?: string;
  pickupAvailable?: boolean;
  shippingAvailable?: boolean;
};

type EditableListingFields = Pick<
  AiListingAssistantFields,
  "title" | "description" | "category" | "condition"
>;

export type AiListingAssistantPanelProps = {
  fields: AiListingAssistantFields;
  onApply(fields: EditableListingFields): void;
  disabled?: boolean;
};

export default function AiListingAssistantPanel({
  fields,
  onApply,
  disabled = false,
}: AiListingAssistantPanelProps) {
  const [suggestion, setSuggestion] = useState<AiListingSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previous, setPrevious] = useState<EditableListingFields | null>(null);

  async function generate() {
    setLoading(true);
    setError("");
    setNotice("");

    try {
      setSuggestion(
        await requestListingAssistant({
          ...fields,
          price: fields.price === undefined ? undefined : String(fields.price),
          images: fields.images?.slice(0, 6),
        }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "AI listing assistant failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  function apply(kind: "title" | "description" | "category" | "all") {
    if (!suggestion) return;

    setPrevious({
      title: fields.title,
      description: fields.description,
      category: fields.category,
      condition: fields.condition,
    });
    onApply({
      title:
        kind === "title" || kind === "all" ? suggestion.title : fields.title,
      description:
        kind === "description" || kind === "all"
          ? suggestion.description
          : fields.description,
      category:
        kind === "category" || kind === "all"
          ? suggestion.category
          : fields.category,
      condition:
        kind === "category" || kind === "all"
          ? suggestion.condition
          : fields.condition,
    });
    setNotice(
      "Suggestion applied. Review every detail before saving or publishing.",
    );
  }

  function undo() {
    if (!previous) return;

    onApply(previous);
    setPrevious(null);
    setNotice("Previous seller-entered values restored.");
  }

  return (
    <section
      className="list-card ai-listing-review"
      aria-labelledby="ai-listing-review-title"
    >
      <div>
        <h2 id="ai-listing-review-title">AI listing assistant</h2>
        <p>
          Generate a reviewable suggestion from the information and images you
          deliberately provide. Nothing is submitted or published automatically.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={disabled || loading}
          onClick={() => void generate()}
        >
          {loading
            ? "Generating…"
            : suggestion
              ? "Regenerate suggestion"
              : fields.description.trim()
                ? "Improve with AI"
                : "Generate with AI"}
        </button>
      </div>

      {error ? <p role="alert">{error}</p> : null}
      {notice ? (
        <p role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}

      {suggestion ? (
        <div className="ai-listing-review__suggestion">
          <p>
            <strong>Source:</strong>{" "}
            {suggestion.source === "openai" ? "OpenAI" : "Safe local fallback"}
          </p>
          <h3>{suggestion.title}</h3>
          <p>{suggestion.description}</p>
          <p>
            <strong>Category / condition:</strong> {suggestion.category} /{" "}
            {suggestion.condition}
          </p>
          <p>
            <strong>Search tags:</strong>{" "}
            {suggestion.tags.join(", ") || "None suggested"}
          </p>
          <p>
            <strong>Search keywords:</strong>{" "}
            {suggestion.searchKeywords.join(", ") || "None suggested"}
          </p>
          <h4>Missing-information warnings</h4>
          <ul>
            {suggestion.qualityIssues.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
          <h4>Risk warnings</h4>
          <ul>
            {suggestion.riskWarnings.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
          <h4>Seller checklist</h4>
          <ul>
            {suggestion.ownerChecklist.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
          <h4>Buyer-trust notes</h4>
          <ul>
            {suggestion.buyerTrustNotes.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
          <div
            className="buyer-subscription-actions"
            aria-label="Apply AI suggestion"
          >
            <button type="button" onClick={() => apply("title")}>
              Apply title only
            </button>
            <button type="button" onClick={() => apply("description")}>
              Apply description only
            </button>
            <button type="button" onClick={() => apply("category")}>
              Apply category and condition
            </button>
            <button type="button" onClick={() => apply("all")}>
              Apply suggestion
            </button>
            {previous ? (
              <button type="button" onClick={undo}>
                Undo applied suggestion
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
