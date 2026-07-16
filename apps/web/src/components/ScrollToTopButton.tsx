import { useEffect, useState } from "react";

export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      style={{
        position: "fixed",
        right: 8,
        bottom: 8,
        zIndex: 50,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "#6366f1",
        color: "#fff",
        borderRadius: 999,
        width: 44,
        height: 44,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 20,
        lineHeight: 1,
        fontWeight: 900,
        cursor: "pointer",
        boxShadow: "0 12px 30px rgba(0,0,0,0.32)",
      }}
      aria-label="Scroll to top"
      title="Scroll to top"
    >
      ↑
    </button>
  );
}
