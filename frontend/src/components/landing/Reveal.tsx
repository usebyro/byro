"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return [ref, seen] as const;
}

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  variant?: "rise" | "stamp";
  style?: CSSProperties;
}

const hidden = {
  rise: "opacity-0 translate-y-5",
  stamp: "opacity-0 scale-[1.6]",
};

const shown = {
  rise: "opacity-100 translate-y-0",
  stamp: "opacity-100 scale-100",
};

const easing = {
  rise: "ease-out",
  stamp: "ease-[cubic-bezier(.2,1.4,.3,1)]",
};

export function Reveal({ children, className = "", delay = 0, variant = "rise", style }: RevealProps) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms`, ...style }}
      className={`transition-[opacity,transform] duration-700 ${easing[variant]} motion-reduce:!translate-y-0 motion-reduce:!scale-100 motion-reduce:!opacity-100 motion-reduce:transition-none ${
        seen ? shown[variant] : hidden[variant]
      } ${className}`}
    >
      {children}
    </div>
  );
}
