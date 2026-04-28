import { useNavigate } from "react-router-dom";

export default function PageBackButton() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(-1)}
      style={{
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        color: "#eef2ff",
        borderRadius: 10,
        padding: "8px 12px",
        fontWeight: 800,
        cursor: "pointer",
      }}
    >
      ← Back
    </button>
  );
}
