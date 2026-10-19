import { STAMP_INK } from "@/components/brand/Stamp";

/**
 * The stamp drawn for server-made images (emails, share cards). Same look as <Stamp>, but
 * built from two rings because the image renderer can't draw a double border.
 */
export function StampArt({ look, size }) {
  const color = STAMP_INK[look.ink];
  const radius = look.shape === "round" ? size / 2 : Math.round(size * 0.18);
  const ring = Math.max(3, Math.round(size * 0.022));
  const gap = Math.max(3, Math.round(size * 0.02));
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        borderRadius: radius,
        border: `${ring}px solid ${color}`,
        background: "#FFFFFF",
        padding: gap,
        transform: `rotate(${look.tilt}deg)`,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          borderRadius: Math.max(0, radius - ring - gap),
          border: `${ring}px solid ${color}`,
          color,
          padding: Math.round(size * 0.06),
          gap: Math.round(size * 0.03),
        }}
      >
        <div style={{ display: "flex", fontSize: Math.round(size * 0.08), fontWeight: 800, letterSpacing: "0.14em" }}>{look.city}</div>
        <div style={{ display: "flex", fontSize: Math.round(size * 0.13), fontWeight: 800, lineHeight: 1 }}>{look.name}</div>
        <div style={{ display: "flex", fontSize: Math.round(size * 0.08), fontWeight: 800, letterSpacing: "0.1em" }}>{look.date}</div>
      </div>
    </div>
  );
}
