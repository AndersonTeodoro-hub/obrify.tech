export default function CrossSectionSVG() {
  return (
    <svg viewBox="0 0 600 300" style={{ width: "100%", height: "auto", borderRadius: "12px", background: "#0a0a0a" }}>
      <line x1="0" y1="100" x2="600" y2="100" stroke="#333" strokeWidth="1" strokeDasharray="4" />
      <text x="10" y="95" fill="#666" fontSize="10">NTN ±0.00</text>
      <rect x="80" y="120" width="120" height="100" fill="rgba(139,92,246,0.15)" stroke="#8b5cf6" strokeWidth="1.5" rx="4" />
      <text x="105" y="175" fill="#8b5cf6" fontSize="11" fontWeight="600">B1 - 120×100</text>
      <rect x="350" y="110" width="140" height="120" fill="rgba(139,92,246,0.15)" stroke="#8b5cf6" strokeWidth="1.5" rx="4" />
      <text x="370" y="175" fill="#8b5cf6" fontSize="11" fontWeight="600">B2 - 140×120</text>
      <rect x="125" y="70" width="30" height="50" fill="rgba(255,107,53,0.2)" stroke="#ff6b35" strokeWidth="1.5" rx="2" />
      <text x="128" y="65" fill="#ff6b35" fontSize="10" fontWeight="600">P3</text>
      <rect x="400" y="60" width="30" height="50" fill="rgba(255,107,53,0.2)" stroke="#ff6b35" strokeWidth="1.5" rx="2" />
      <text x="403" y="55" fill="#ff6b35" fontSize="10" fontWeight="600">P7</text>
      <line x1="50" y1="180" x2="550" y2="180" stroke="#00c9a7" strokeWidth="3" />
      <circle cx="420" cy="180" r="12" fill="none" stroke="#ff3b5c" strokeWidth="2">
        <animate attributeName="r" values="12;18;12" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x="440" y="185" fill="#ff3b5c" fontSize="11" fontWeight="700">⚠ COLISÃO</text>
      <text x="110" y="240" fill="#666" fontSize="9">1.20m</text>
      <text x="390" y="250" fill="#666" fontSize="9">1.40m</text>
      <text x="270" y="290" fill="#555" fontSize="10">3.00m</text>
    </svg>
  );
}
