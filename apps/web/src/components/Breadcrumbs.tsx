import { Link, useLocation } from "react-router-dom";

function labelize(value: string) {
  return value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function Breadcrumbs() {
  const location = useLocation();
  const parts = location.pathname.split("/").filter(Boolean);

  if (parts.length === 0) return null;

  const crumbs = parts.map((part, index) => ({
    label: labelize(part),
    href: `/${parts.slice(0, index + 1).join("/")}`,
    current: index === parts.length - 1,
  }));

  return (
    <nav aria-label="Breadcrumbs" style={{ display: "flex", gap: 8, flexWrap: "wrap", color: "#94a3b8", fontSize: 13 }}>
      <Link to="/" style={{ color: "#bfdbfe", textDecoration: "none", fontWeight: 800 }}>
        Home
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.href} style={{ display: "inline-flex", gap: 8 }}>
          <span>/</span>
          {crumb.current ? (
            <span style={{ color: "#e2e8f0", fontWeight: 800 }}>{crumb.label}</span>
          ) : (
            <Link to={crumb.href} style={{ color: "#bfdbfe", textDecoration: "none", fontWeight: 800 }}>
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
