import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createShop } from "../services/shops";

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
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h2 style={styles.title}>Create Your First Shop</h2>
          <p style={styles.subtitle}>
            Set up your pawn shop before adding inventory or creating auctions.
          </p>
        </div>

        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.label}>
            Shop Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Downtown Pawn"
              required
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Address
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Houston, TX"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Phone
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="713-555-1111"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Hours
            <input
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="Mon-Sat 10am-6pm"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell buyers about your shop."
              rows={4}
              style={styles.textarea}
            />
          </label>

          {error ? <div style={styles.error}>{error}</div> : null}

          <div style={styles.actions}>
            <button type="submit" disabled={submitting} style={styles.primaryButton}>
              {submitting ? "Creating Shop..." : "Create Shop"}
            </button>

            <Link to="/owner" style={styles.secondaryLink}>
              Back to Dashboard
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "grid",
    placeItems: "start",
  },
  card: {
    width: "100%",
    maxWidth: 720,
    background: "#121935",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: 24,
    color: "#eef2ff",
    boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
  },
  header: {
    marginBottom: 20,
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
  },
  subtitle: {
    marginTop: 8,
    color: "#a7b0d8",
  },
  form: {
    display: "grid",
    gap: 16,
  },
  label: {
    display: "grid",
    gap: 8,
    fontWeight: 600,
    color: "#d7def7",
  },
  input: {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0c1330",
    color: "#eef2ff",
    padding: "12px 14px",
  },
  textarea: {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0c1330",
    color: "#eef2ff",
    padding: "12px 14px",
    resize: "vertical",
  },
  actions: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  primaryButton: {
    border: "none",
    borderRadius: 12,
    padding: "12px 16px",
    background: "#6ea8fe",
    color: "#08111f",
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryLink: {
    color: "#c7d2fe",
    textDecoration: "none",
    fontWeight: 700,
  },
  error: {
    color: "#ff9ead",
    fontWeight: 700,
  },
};
