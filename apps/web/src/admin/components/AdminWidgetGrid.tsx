import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  minColumnWidth?: number;
  gap?: number;
  className?: string;
  style?: CSSProperties;
};

export default function AdminWidgetGrid({
  children,
  minColumnWidth = 280,
  gap = 16,
  className = "",
  style,
}: Props) {
  return (
    <div
      className={`grid ${className}`.trim()}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${minColumnWidth}px, 1fr))`,
        gap,
        alignItems: "stretch",
        width: "100%",
        ...style,
      }}
    >
      {children}
    </div>
  );
}