"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export function useBusyStages(stages: string[], busy: boolean, stepMs = 1400) {
  const [index, setIndex] = useState(0);
  const joined = stages.join("\u0001");

  useEffect(() => {
    if (!busy) {
      setIndex(0);
      return;
    }
    const count = joined ? joined.split("\u0001").length : 0;
    if (count <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => Math.min(i + 1, count - 1));
    }, stepMs);
    return () => window.clearInterval(id);
  }, [busy, joined, stepMs]);

  if (!busy) return undefined;
  return stages[Math.min(index, Math.max(stages.length - 1, 0))];
}

export function BusyButton({
  busy,
  stage,
  children,
  className,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  stage?: string;
  children: ReactNode;
}) {
  const waiting = Boolean(busy);
  return (
    <button
      type={type}
      className={className}
      {...props}
      disabled={disabled || waiting}
      aria-busy={waiting}
    >
      {waiting ? (
        <span className="inline-flex items-center justify-center gap-2">
          <span className="btn-spinner" aria-hidden />
          <span aria-live="polite">{stage || children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
