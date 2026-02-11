interface StatCardProps {
  number: string | number;
  label: string;
  type: string;
}

const colors: Record<string, string> = {
  critical: "#ff3b5c",
  warning: "#ffd60a",
  info: "#00c9a7",
  ok: "#4ade80",
};

export default function StatCard({ number, label, type }: StatCardProps) {
  const color = colors[type] || "#888";
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "16px",
      padding: "20px",
      textAlign: "center",
    }}>
      <div style={{ fontSize: "32px", fontWeight: 800, color, lineHeight: 1 }}>{number}</div>
      <div style={{ fontSize: "12px", color: "#888", marginTop: "6px", fontWeight: 500 }}>{label}</div>
    </div>
  );
}
