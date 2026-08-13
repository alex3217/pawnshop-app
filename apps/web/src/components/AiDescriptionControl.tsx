import { useEffect, useId, useRef, useState } from "react";
import { requestAiDescription, type AiDescriptionInput } from "../services/aiListingAssistant";
import "../styles/ai-description-control.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  input: Omit<AiDescriptionInput, "description">;
  disabled?: boolean;
};

export default function AiDescriptionControl({ value, onChange, input, disabled = false }: Props) {
  const statusId = useId();
  const controller = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastGenerated, setLastGenerated] = useState("");
  const hasGenerated = Boolean(lastGenerated);

  useEffect(() => () => controller.current?.abort(), []);

  async function generate() {
    if (value.trim() && value !== lastGenerated && !window.confirm("Replace the current description with an AI-generated description? Your current text will not be recoverable from this form.")) return;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setLoading(true);
    setError("");
    try {
      const generated = await requestAiDescription({ ...input, description: value }, nextController.signal);
      setLastGenerated(generated);
      onChange(generated);
    } catch (cause) {
      if (nextController.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "AI description generation failed. Your description was not changed.");
    } finally {
      if (controller.current === nextController) setLoading(false);
    }
  }

  function clearGenerated() {
    if (value !== lastGenerated && value.trim() && !window.confirm("Clear the edited description that began as AI-generated text?")) return;
    onChange("");
    setLastGenerated("");
    setError("");
  }

  return (
    <div className="ai-description-control" data-ai-description-context={input.context} aria-describedby={statusId}>
      <div className="ai-description-actions">
        <button type="button" onClick={() => void generate()} disabled={disabled || loading || (!input.title.trim() && !input.linkedInventoryTitle?.trim())}>
          {loading ? "Generating…" : hasGenerated ? "Regenerate" : "Generate with AI"}
        </button>
        {hasGenerated ? <button type="button" className="ai-description-clear" onClick={clearGenerated} disabled={disabled || loading}>Clear generated description</button> : null}
      </div>
      <p id={statusId} className={`ai-description-status${error ? " is-error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">
        {loading ? "Generating an AI description. Your form will not be saved or submitted." : error || (hasGenerated ? "AI-generated text is ready to review and edit before saving." : "AI uses only the item facts supplied here. Review all generated text before saving.")}
      </p>
    </div>
  );
}
