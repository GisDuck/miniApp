import type { CSSProperties } from "react";

import "./Skeleton.css";

type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
};

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <span
      className={["skeleton", className ?? ""].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
    />
  );
}
