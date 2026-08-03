import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createShop } from "../services/shops";
import "../styles/owner-workspace-readability.css";

export default function CreateShopPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const trimmedName = name.trim();

      if (!trimmedName) {
        throw new Error("Shop name is required.");
      }

      await createShop({
        name: trimmedName,
        address: address.trim(),
        phone: phone.trim(),
        description: description.trim(),
        hours: hours.trim(),
      });

      navigate("/owner", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create shop.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="owner-readable-page owner-create-shop-page">
      <div className="owner-readable-card owner-create-shop-card">
        <div className="owner-create-shop-header">
          <h1 className="owner-readable-heading">Create Your First Shop</h1>
          <p className="owner-readable-muted">
            Set up your pawn shop before adding inventory or creating auctions.
          </p>
        </div>

        <form onSubmit={onSubmit} className="owner-create-shop-form">
          <label className="owner-readable-field">
            Shop Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Downtown Pawn"
              required
            />
          </label>

          <label className="owner-readable-field">
            Address
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Houston, TX"
            />
          </label>

          <label className="owner-readable-field">
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="713-555-1111"
            />
          </label>

          <label className="owner-readable-field">
            Hours
            <input
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="Mon-Sat 10am-6pm"
            />
          </label>

          <label className="owner-readable-field">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell buyers about your shop."
              rows={4}
            />
          </label>

          {error ? <div className="owner-readable-error" role="alert">{error}</div> : null}

          <div className="owner-create-shop-actions">
            <button type="submit" disabled={submitting} className="owner-readable-button owner-readable-button-primary">
              {submitting ? "Creating Shop..." : "Create Shop"}
            </button>

            <Link to="/owner" className="owner-readable-link">
              Back to Dashboard
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
