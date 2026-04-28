import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function AdminPageShell({
  title,
  subtitle,
  actions,
  children,
}: Props) {
  return (
    <div className="page-stack">
      <div className="page-card">
        <div
          className="toolbar"
          style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}
        >
          <div>
            <div className="section-title">{title}</div>
            {subtitle ? <div className="section-subtitle">{subtitle}</div> : null}
          </div>

          {actions ? <div style={{ marginLeft: "auto" }}>{actions}</div> : null}
        </div>

        {children}
      </div>
    </div>
  );
}
