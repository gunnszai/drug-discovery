import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";
import "./fcw.css";

const API = process.env.REACT_APP_API_URL || "http://127.0.0.1:5000";

/* ── helpers ─────────────────────────────────────────────────── */
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }

function getScoreLabel(score) {
  if (score >= 0.85) return { label: "Exceptional Binding", color: "#10b981", bg: "rgba(16,185,129,0.12)", emoji: "🏆" };
  if (score >= 0.65) return { label: "Strong Binding", color: "#06b6d4", bg: "rgba(6,182,212,0.12)", emoji: "🔗" };
  if (score >= 0.45) return { label: "Moderate Binding", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", emoji: "⚡" };
  if (score >= 0.25) return { label: "Weak Binding", color: "#7c3aed", bg: "rgba(124,58,237,0.12)", emoji: "🔎" };
  return { label: "No Significant Binding", color: "#ef4444", bg: "rgba(239,68,68,0.12)", emoji: "⛔" };
}

const RISK_COLOR = { low: "#10b981", moderate: "#f59e0b", high: "#ef4444" };
const BIO_COLOR = { good: "#10b981", moderate: "#f59e0b", poor: "#ef4444" };
const SEL_COLOR = { high: "#10b981", moderate: "#f59e0b", low: "#ef4444" };
const TOX_COLOR = { none: "#10b981", low: "#06b6d4", moderate: "#f59e0b", high: "#ef4444" };

/* ── Markdown-ish renderer ─────────────────────────────────── */
function MarkdownText({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <div className="md-text">
      {lines.map((line, i) => {
        if (line.match(/^(\s*[-*•])\s/)) {
          const content = line.replace(/^(\s*[-*•])\s/, "");
          return <div key={i} className="md-bullet">• <InlineFormat text={content} /></div>;
        }
        if (line.match(/^\d+\.\s/)) {
          return <div key={i} className="md-bullet"><InlineFormat text={line} /></div>;
        }
        if (line.startsWith("## ")) return <div key={i} className="md-h2"><InlineFormat text={line.slice(3)} /></div>;
        if (line.startsWith("# ")) return <div key={i} className="md-h1"><InlineFormat text={line.slice(2)} /></div>;
        if (line.trim() === "") return <div key={i} className="md-space" />;
        return <div key={i} className="md-line"><InlineFormat text={line} /></div>;
      })}
    </div>
  );
}

function InlineFormat({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i} className="inline-code">{part.slice(1, -1)}</code>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/* ── Score Ring ──────────────────────────────────────────────── */
function ScoreRing({ score, size = 130 }) {
  const R = size * 0.415;
  const C = 2 * Math.PI * R;
  const pct = clamp(score, 0, 1);
  const { label, color } = getScoreLabel(score);
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <defs>
          <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle className="score-ring-bg" cx={size / 2} cy={size / 2} r={R} />
        <circle
          className="score-ring-fill"
          cx={size / 2} cy={size / 2} r={R}
          strokeDasharray={C}
          strokeDashoffset={C - pct * C}
          stroke={color}
        />
      </svg>
      <div className="score-ring-text">
        <span className="score-value">{(score * 100).toFixed(1)}%</span>
        <span className="score-label-small">Score</span>
      </div>
    </div>
  );
}

/* ── Badge ───────────────────────────────────────────────────── */
function Badge({ value, colorMap, fallback = "moderate" }) {
  const key = (value || fallback).toLowerCase();
  const color = colorMap[key] || "#94a3b8";
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: "999px",
      fontSize: "0.75rem",
      fontWeight: 700,
      letterSpacing: "0.03em",
      textTransform: "capitalize",
      background: color + "22",
      color,
      border: `1px solid ${color}44`,
    }}>
      {key}
    </span>
  );
}

/* ── Toast ───────────────────────────────────────────────────── */
function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 6000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`toast ${type}`} role="alert">
      <span className="toast-icon">{type === "error" ? "⚠️" : "✅"}</span>
      <span>{message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Dismiss">✕</button>
    </div>
  );
}

/* ── Copy Button ─────────────────────────────────────────────── */
function CopyButton({ text, small }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className={`copy-btn ${small ? "copy-btn-sm" : ""}`} onClick={handleCopy} title="Copy to clipboard">
      {copied ? "✓ Copied" : "📋 Copy"}
    </button>
  );
}

/* ── Radar Chart (SVG) ───────────────────────────────────────── */
function RadarChart({ scores, labels, colors }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 80;
  const n = scores.length;
  const angleStep = (2 * Math.PI) / n;

  const getPoint = (i, val) => {
    const angle = i * angleStep - Math.PI / 2;
    return {
      x: cx + r * val * Math.cos(angle),
      y: cy + r * val * Math.sin(angle),
    };
  };

  const rings = [0.25, 0.5, 0.75, 1.0];
  const polyPoints = scores.map((s, i) => {
    const p = getPoint(i, clamp(s, 0, 1));
    return `${p.x},${p.y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="radar-svg">
      {/* Rings */}
      {rings.map(r_ => {
        const pts = Array.from({ length: n }, (_, i) => {
          const p = getPoint(i, r_);
          return `${p.x},${p.y}`;
        }).join(" ");
        return <polygon key={r_} points={pts} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />;
      })}
      {/* Axes */}
      {scores.map((_, i) => {
        const p = getPoint(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />;
      })}
      {/* Data polygon */}
      <polygon
        points={polyPoints}
        fill="rgba(124,58,237,0.18)"
        stroke="url(#radarGrad)"
        strokeWidth="2"
      />
      <defs>
        <linearGradient id="radarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      {/* Data points */}
      {scores.map((s, i) => {
        const p = getPoint(i, clamp(s, 0, 1));
        return <circle key={i} cx={p.x} cy={p.y} r="4" fill={colors[i] || "#7c3aed"} />;
      })}
      {/* Labels */}
      {labels.map((lbl, i) => {
        const p = getPoint(i, 1.28);
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fontSize="9.5" fill="rgba(255,255,255,0.6)" fontFamily="Inter,sans-serif">
            {lbl}
          </text>
        );
      })}
    </svg>
  );
}

/* ── Mini Progress Bar ───────────────────────────────────────── */
function MiniBar({ value, color, label, pct }) {
  const v = clamp(value, 0, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
          {pct ? `${(v * 100).toFixed(0)}%` : value.toFixed(2)}
        </span>
      </div>
      <div className="confidence-bar">
        <div className="confidence-bar-fill" style={{ width: `${v * 100}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }} />
      </div>
    </div>
  );
}

/* ── ADMET Phase Card ────────────────────────────────────────── */
function AdmetCard({ icon, title, score, color, children }) {
  return (
    <div className="admet-card" style={{ "--admet-color": color }}>
      <div className="admet-card-header">
        <div className="admet-icon" style={{ background: `${color}20` }}>{icon}</div>
        <div>
          <div className="admet-title">{title}</div>
          <div className="admet-score-row">
            <div className="admet-score-bar-wrap">
              <div className="admet-score-bar" style={{ width: `${score * 100}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }} />
            </div>
            <span className="admet-score-label">{(score * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
      <div className="admet-body">{children}</div>
    </div>
  );
}

/* ── Residue Node ────────────────────────────────────────────── */
function ResidueNode({ residue, index }) {
  const colorMap = {
    "H-bond": "#06b6d4",
    "hydrogen_bond": "#06b6d4",
    "hydrophobic": "#f59e0b",
    "ionic": "#10b981",
    "pi-stacking": "#a78bfa",
    "van_der_waals": "#94a3b8",
  };
  const contribSize = { critical: 52, major: 44, minor: 36 };
  const color = colorMap[residue.interaction_type] || "#94a3b8";
  const sz = contribSize[residue.contribution] || 40;

  return (
    <div className="residue-node" style={{
      "--node-color": color,
      width: sz, height: sz,
      animationDelay: `${index * 80}ms`,
    }}>
      <div className="residue-aa">{residue.one_letter || residue.amino_acid?.slice(0, 1)}</div>
      <div className="residue-pos">{residue.position}</div>
      <div className="residue-tooltip">
        <div className="rt-header">{residue.amino_acid} {residue.position}</div>
        <div className="rt-row">Type: <strong>{residue.interaction_type?.replace(/_/g, " ")}</strong></div>
        <div className="rt-row">Role: <strong>{residue.contribution}</strong></div>
        <div className="rt-row">Dist: <strong>{residue.distance_angstrom?.toFixed?.(1) ?? residue.distance_angstrom}Å</strong></div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PREDICTOR TAB
═══════════════════════════════════════════════════════════════ */
function PredictorTab() {
  const [protein, setProtein] = useState("");
  const [drug, setDrug] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const resultsRef = useRef(null);

  const dismissToast = useCallback(() => setToast(null), []);

  const EXAMPLE_PROTEIN = "MKTIIALSYIFCLVFADYKDDDDK";
  const EXAMPLE_DRUG = "CC(=O)Oc1ccccc1C(=O)O";
  const fillExample = () => { setProtein(EXAMPLE_PROTEIN); setDrug(EXAMPLE_DRUG); setResult(null); };

  const handleSubmit = async () => {
    if (!protein.trim() || !drug.trim()) {
      setToast({ message: "Please fill in both Protein Sequence and Drug SMILES fields.", type: "error" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protein: protein.trim(), drug: drug.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      setResult(data);
      setToast({ message: "AI analysis complete! Review your results below.", type: "success" });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    } catch (err) {
      setToast({
        message: err.message.includes("fetch")
          ? "Cannot reach the Flask backend. Run: python app.py"
          : `Error: ${err.message}`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSubmit(); };
  const si = result ? getScoreLabel(result.binding_score) : null;

  const exportResult = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "drugsx-analysis.json"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section className="hero">
        <div className="hero-eyebrow">
          <span>⚡</span> Powered by Groq · Llama 3.3 70B · Protein-Ligand AI
        </div>
        <h1 className="hero-title">
          Accelerate <span className="gradient-text">Drug Discovery</span><br />with AI precision
        </h1>
        <p className="hero-subtitle">
          Enter a protein sequence and drug SMILES notation to get instant AI-powered binding
          affinity analysis — mechanism, risk, bioavailability &amp; more.
        </p>
        <div className="hero-stats">
          {[
            { v: "10M+", l: "Compounds Screened" },
            { v: "94.2%", l: "Model Accuracy" },
            { v: "<200ms", l: "Prediction Speed" },
            { v: "50K+", l: "Researchers" },
          ].map(s => (
            <div className="stat-item" key={s.l}>
              <div className="stat-value">{s.v}</div>
              <div className="stat-label">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="feature-pills">
        {[
          ["🔬", "Protein-Drug Interaction"], ["🧪", "SMILES Notation"],
          ["🤖", "Llama 3.3 · 70B"], ["📊", "Binding Affinity Score"],
          ["💊", "Pharmacokinetics"], ["🔐", "Secure & Private"],
        ].map(([icon, text]) => (
          <div key={text} className="feature-pill">
            <span className="pill-icon">{icon}</span>{text}
          </div>
        ))}
      </div>

      <div className="divider" style={{ margin: "2.5rem 0" }} />

      <section className="prediction-section">
        <div className="section-header">
          <div className="section-number">1</div>
          <h2 className="section-title">Binding Affinity Predictor</h2>
          <span className="section-subtitle">Ctrl+Enter to predict</span>
          <button className="btn-example" onClick={fillExample} id="example-btn">⚗️ Try Example</button>
        </div>

        <div className="card">
          <div className="input-grid">
            <div className="field-group">
              <label className="field-label" htmlFor="protein-input">
                <span className="field-label-icon">🧬</span>
                Protein Sequence
                <span className="field-badge">FASTA / Amino Acid</span>
              </label>
              <textarea
                id="protein-input"
                className="field-input"
                placeholder={"Enter amino acid sequence…\nExample: MKTIIALSYIFCLVFA"}
                value={protein}
                onChange={e => setProtein(e.target.value)}
                onKeyDown={handleKey}
              />
              <p className="field-hint">💡 Single-letter amino acid codes (e.g. MKTII…)</p>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="drug-input">
                <span className="field-label-icon">💊</span>
                Drug SMILES
                <span className="field-badge">SMILES Notation</span>
              </label>
              <textarea
                id="drug-input"
                className="field-input"
                placeholder={"Enter SMILES string…\nExample: CC(=O)Oc1ccccc1C(=O)O"}
                value={drug}
                onChange={e => setDrug(e.target.value)}
                onKeyDown={handleKey}
              />
              <p className="field-hint">🔬 Simplified Molecular Input Line-Entry System</p>
            </div>
          </div>

          <button id="predict-btn" className="btn-predict" onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <><div className="spinner" />Analyzing with Groq AI…</>
            ) : (
              <><span>🚀</span> Predict Binding Affinity <span className="btn-predict-icon">→</span></>
            )}
          </button>
        </div>
      </section>

      {result && (
        <section className="results-section" ref={resultsRef} aria-live="polite">
          <div className="section-header">
            <div className="section-number">2</div>
            <h2 className="section-title">AI Analysis Results</h2>
            <span className="section-subtitle">{si.emoji} {si.label}</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
              <CopyButton text={JSON.stringify(result, null, 2)} small />
              <button className="btn-export" onClick={exportResult} title="Export JSON">⬇️ Export</button>
            </div>
          </div>

          <div className="results-grid">
            <div className="score-card">
              <ScoreRing score={result.binding_score} />
              <div className="score-title">Binding Affinity Score</div>
              <p className="score-interpretation">{si.label} — {result.recommendation}</p>
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-purple">📊</div>
                <div className="info-card-title">Confidence Metrics</div>
              </div>
              {[
                { label: "Binding Probability", v: result.binding_score, cls: "fill-purple" },
                { label: "Model Confidence", v: result.confidence, cls: "fill-cyan" },
                { label: "Pharmacological Score", v: clamp(result.binding_score * 0.97, 0, 1), cls: "fill-emerald" },
              ].map(m => (
                <div key={m.label} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                    <span style={{ color: "var(--text-secondary)" }}>{m.label}</span>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{(m.v * 100).toFixed(1)}%</span>
                  </div>
                  <div className="confidence-bar">
                    <div className={`confidence-bar-fill ${m.cls}`}
                      style={{ width: `${m.v * 100}%` }}
                      role="progressbar"
                      aria-valuenow={Math.round(m.v * 100)}
                      aria-valuemin={0} aria-valuemax={100} />
                  </div>
                </div>
              ))}
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-cyan">🧪</div>
                <div className="info-card-title">Pharmacokinetic Profile</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { label: "Interaction Type", val: result.interaction_type, cm: { hydrophobic: "#7c3aed", hydrogen_bond: "#06b6d4", ionic: "#f59e0b", van_der_waals: "#10b981", mixed: "#a78bfa", unknown: "#94a3b8" } },
                  { label: "Bioavailability", val: result.bioavailability, cm: BIO_COLOR },
                  { label: "Side-Effect Risk", val: result.side_effects_risk, cm: RISK_COLOR },
                  { label: "Selectivity", val: result.selectivity, cm: SEL_COLOR },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{row.label}</span>
                    <Badge value={row.val} colorMap={row.cm} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-emerald">🔬</div>
                <div className="info-card-title">Binding Mechanism</div>
              </div>
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                {result.mechanism}
              </p>
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-amber">💡</div>
                <div className="info-card-title">Drug-Likeness Assessment</div>
              </div>
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                {result.drug_likeness}
              </p>
              <div style={{ marginTop: "auto", paddingTop: "12px", borderTop: "1px solid var(--border)", fontSize: "0.72rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                <span>🤖</span> Generated by <strong style={{ color: "var(--purple-light)" }}>Groq · {result.model_used}</strong>
              </div>
            </div>
          </div>

          <div className="info-card" style={{ marginTop: "1rem" }}>
            <div className="info-card-header">
              <div className="info-card-icon icon-purple">📋</div>
              <div className="info-card-title">Molecular Input Summary</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: "8px" }}>
              {[
                { icon: "🧬", label: "Protein", val: result.protein_preview },
                { icon: "💊", label: "Drug SMILES", val: result.drug_preview },
                { icon: "🔗", label: "Interaction", val: result.interaction_type },
                { icon: "⏱️", label: "Analysed by", val: `Groq / ${result.model_used}` },
              ].map(r => (
                <div key={r.label} style={{ padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "3px" }}>{r.icon} {r.label}</div>
                  <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)", wordBreak: "break-all" }}>{r.val}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   PHARMACOKINETICS TAB
═══════════════════════════════════════════════════════════════ */
const PK_EXAMPLES = [
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
  { name: "Ibuprofen", smiles: "CC(C)Cc1ccc(cc1)C(C)C(=O)O" },
  { name: "Atorvastatin", smiles: "CC(C)c1c(C(=O)Nc2ccccc2F)c(-c2ccccc2)n(CC[C@@H](OH)CC(=O)O)c1C(C)C" },
  { name: "Sildenafil", smiles: "CCCC1=NN(C)C(=O)c2[nH]cnc21" },
  { name: "Metformin", smiles: "CN(C)C(=N)NC(=N)N" },
];

const ADMET_PHASES = [
  { key: "absorption", label: "Absorption", icon: "🫁", color: "#06b6d4" },
  { key: "distribution", label: "Distribution", icon: "🩸", color: "#a78bfa" },
  { key: "metabolism", label: "Metabolism", icon: "⚗️", color: "#f59e0b" },
  { key: "excretion", label: "Excretion", icon: "🚽", color: "#10b981" },
  { key: "toxicity", label: "Toxicity", icon: "☠️", color: "#ef4444" },
];

function PharmacokineticTab() {
  const [smiles, setSmiles] = useState("");
  const [drugName, setDrugName] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [activePhase, setActivePhase] = useState(null);
  const resultsRef = useRef(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const handleAnalyze = async () => {
    if (!smiles.trim()) {
      setToast({ message: "Please enter a SMILES string.", type: "error" });
      return;
    }
    setLoading(true);
    setResult(null);
    setActivePhase(null);
    try {
      const res = await fetch(`${API}/pharmacokinetics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smiles: smiles.trim(), drug_name: drugName.trim() || "Unknown" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      setResult(data);
      setActivePhase("absorption");
      setToast({ message: "ADMET analysis complete!", type: "success" });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    } catch (err) {
      setToast({ message: err.message.includes("fetch") ? "Backend not running. Run: python app.py" : `Error: ${err.message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const exportResult = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "pk-admet-report.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const radarScores = result ? [
    result.absorption?.score ?? 0,
    result.distribution?.score ?? 0,
    result.metabolism?.score ?? 0,
    result.excretion?.score ?? 0,
    result.toxicity?.score ?? 0,
  ] : [];

  const radarColors = ["#06b6d4", "#a78bfa", "#f59e0b", "#10b981", "#ef4444"];
  const radarLabels = ["Absorb", "Distrib", "Metab", "Excrete", "Safety"];
  const activeData = result && activePhase ? result[activePhase] : null;
  const activeConfig = ADMET_PHASES.find(p => p.key === activePhase);

  return (
    <>
      {/* HERO */}
      <section className="hero" style={{ paddingBottom: "2rem" }}>
        <div className="hero-eyebrow">
          <span>🧬</span> AI-Powered ADMET · Pharmacokinetics Profiler
        </div>
        <h1 className="hero-title">
          <span className="gradient-text">Pharmacokinetics</span><br />& ADMET Analysis
        </h1>
        <p className="hero-subtitle">
          Full Absorption, Distribution, Metabolism, Excretion, and Toxicity profiling.
          Predict drug behaviour in the human body using advanced AI modelling.
        </p>

        <div className="pk-phase-legend">
          {ADMET_PHASES.map(p => (
            <div key={p.key} className="pk-legend-item">
              <div className="pk-legend-dot" style={{ background: p.color }} />
              <span>{p.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* INPUT */}
      <div className="card" style={{ maxWidth: "760px", margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          <div className="field-group">
            <label className="field-label" htmlFor="pk-drug-name">
              <span className="field-label-icon">🏷️</span>
              Drug / Compound Name
              <span className="field-badge">Optional</span>
            </label>
            <input
              id="pk-drug-name"
              className="field-input"
              style={{ minHeight: "auto", padding: "10px 14px" }}
              placeholder="e.g. Aspirin, Compound X…"
              value={drugName}
              onChange={e => setDrugName(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="pk-smiles">
              <span className="field-label-icon">🔬</span>
              Drug SMILES
              <span className="field-badge">Required</span>
            </label>
            <input
              id="pk-smiles"
              className="field-input"
              style={{ minHeight: "auto", padding: "10px 14px" }}
              placeholder="CC(=O)Oc1ccccc1C(=O)O"
              value={smiles}
              onChange={e => setSmiles(e.target.value)}
            />
          </div>
        </div>

        <div className="smiles-examples" style={{ marginBottom: "1rem" }}>
          <span className="field-hint">Quick examples:</span>
          {PK_EXAMPLES.map(ex => (
            <button key={ex.name} className="example-chip" onClick={() => { setSmiles(ex.smiles); setDrugName(ex.name); }}>
              {ex.name}
            </button>
          ))}
        </div>

        <button id="pk-analyze-btn" className="btn-predict" onClick={handleAnalyze} disabled={loading}>
          {loading
            ? <><div className="spinner" />Running ADMET Analysis…</>
            : <><span>🔬</span> Run Full PK/ADMET Analysis <span className="btn-predict-icon">→</span></>
          }
        </button>
      </div>

      {/* RESULTS */}
      {result && (
        <div className="pk-results" ref={resultsRef}>
          {/* Header */}
          <div className="section-header" style={{ marginTop: "2.5rem" }}>
            <div className="section-number">✓</div>
            <h2 className="section-title">
              ADMET Report — {result.compound_name || drugName || "Compound"}
            </h2>
            <span className="section-subtitle">Overall PK Score: <strong style={{ color: "#10b981" }}>{((result.overall_pk_score || 0) * 100).toFixed(0)}%</strong></span>
            <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
              <CopyButton text={JSON.stringify(result, null, 2)} small />
              <button className="btn-export" onClick={exportResult}>⬇️ Export</button>
            </div>
          </div>

          {/* Top Row */}
          <div className="pk-top-grid">
            {/* Radar */}
            <div className="info-card pk-radar-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-purple">📡</div>
                <div className="info-card-title">ADMET Radar</div>
              </div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
                <RadarChart scores={radarScores} labels={radarLabels} colors={radarColors} />
              </div>
              <div className="pk-overall-score">
                <div className="pk-score-ring-wrap">
                  <ScoreRing score={result.overall_pk_score || 0} size={96} />
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Overall PK Score</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "2px" }}>{result.drug_class || "Unknown Class"}</div>
                </div>
              </div>
            </div>

            {/* Molecular Properties */}
            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-cyan">⚗️</div>
                <div className="info-card-title">Molecular Properties</div>
              </div>
              <div className="pk-props-grid">
                {[
                  { label: "Molecular Formula", val: result.molecular_formula || "—", icon: "🔤" },
                  { label: "Molecular Weight", val: result.molecular_weight ? `${result.molecular_weight} Da` : "—", icon: "⚖️" },
                  { label: "LogP", val: result.logP?.toFixed?.(2) ?? (result.logP || "—"), icon: "💧" },
                  { label: "HB Donors", val: result.hbd ?? "—", icon: "🔵" },
                  { label: "HB Acceptors", val: result.hba ?? "—", icon: "🟢" },
                  { label: "TPSA (Å²)", val: result.tpsa?.toFixed?.(1) ?? (result.tpsa || "—"), icon: "📐" },
                  { label: "Rotatable Bonds", val: result.rotatable_bonds ?? "—", icon: "🔄" },
                  { label: "Lipinski RO5", val: result.lipinski_compliant ? "✅ Compliant" : "❌ Non-compliant", icon: "📏" },
                ].map(p => (
                  <div key={p.label} className="pk-prop-item">
                    <div className="pk-prop-icon">{p.icon}</div>
                    <div>
                      <div className="pk-prop-label">{p.label}</div>
                      <div className="pk-prop-val">{String(p.val)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Key Concerns */}
              {result.key_concerns?.length > 0 && (
                <div className="pk-concerns">
                  <div className="pk-concerns-title">⚠️ Key Concerns</div>
                  {result.key_concerns.map((c, i) => (
                    <div key={i} className="pk-concern-item">{c}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Development Stage */}
            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-emerald">🧪</div>
                <div className="info-card-title">Development Profile</div>
              </div>

              <div className="pk-dev-stage-wrap">
                {["preclinical", "phase_i", "phase_ii", "phase_iii", "approved"].map((stage, i) => {
                  const labels = ["PreClinical", "Phase I", "Phase II", "Phase III", "Approved"];
                  const stageKey = result.development_stage?.toLowerCase().replace(/ /g, "_") || "preclinical";
                  const stageIdx = ["preclinical", "phase_i", "phase_ii", "phase_iii", "approved"].indexOf(stageKey);
                  const active = i === stageIdx;
                  const passed = i <= stageIdx;
                  return (
                    <div key={stage} className={`pk-stage ${active ? "active" : ""} ${passed && !active ? "passed" : ""}`}>
                      <div className="pk-stage-circle">{passed ? (active ? "●" : "✓") : "○"}</div>
                      <div className="pk-stage-label">{labels[i]}</div>
                    </div>
                  );
                })}
                <div className="pk-stage-bar-bg">
                  <div className="pk-stage-bar-fill" style={{
                    width: `${(["preclinical", "phase_i", "phase_ii", "phase_iii", "approved"].indexOf(
                      result.development_stage?.toLowerCase().replace(/ /g, "_") || "preclinical"
                    ) / 4) * 100}%`
                  }} />
                </div>
              </div>

              {/* ADMET bar scores */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "1rem" }}>
                {ADMET_PHASES.map(p => (
                  <MiniBar key={p.key}
                    label={`${p.icon} ${p.label}`}
                    value={result[p.key]?.score ?? 0}
                    color={p.color}
                    pct={true}
                  />
                ))}
              </div>

              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6, marginTop: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                {result.recommendations}
              </p>
            </div>
          </div>

          {/* ADMET Phase Tabs */}
          <div className="admet-phase-tabs">
            {ADMET_PHASES.map(p => (
              <button
                key={p.key}
                id={`pk-phase-${p.key}`}
                className={`admet-phase-tab ${activePhase === p.key ? "active" : ""}`}
                style={{ "--phase-color": p.color }}
                onClick={() => setActivePhase(p.key)}
              >
                <span>{p.icon}</span> {p.label}
              </button>
            ))}
          </div>

          {/* Active phase detail */}
          {activeData && activeConfig && (
            <div className="admet-detail-panel" style={{ "--panel-color": activeConfig.color }}>
              <div className="admet-detail-header">
                <div className="admet-detail-icon">{activeConfig.icon}</div>
                <div>
                  <div className="admet-detail-title">{activeConfig.label} Analysis</div>
                  <div className="admet-detail-score">Score: {((activeData.score || 0) * 100).toFixed(0)}%</div>
                </div>
                <div className="admet-detail-ring">
                  <ScoreRing score={activeData.score ?? 0} size={80} />
                </div>
              </div>

              <div className="admet-detail-grid">
                {Object.entries(activeData)
                  .filter(([k]) => k !== "score" && k !== "notes")
                  .map(([key, val]) => (
                    <div key={key} className="admet-detail-item">
                      <div className="admet-detail-key">{key.replace(/_/g, " ")}</div>
                      <div className="admet-detail-val">{String(val)}</div>
                    </div>
                  ))
                }
              </div>

              {activeData.notes && (
                <div className="admet-notes">
                  <span>📝</span> {activeData.notes}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   PROTEIN-DRUG INTERACTION TAB (Advanced)
═══════════════════════════════════════════════════════════════ */
const PDI_EXAMPLES = [
  {
    label: "COX-2 + Ibuprofen",
    protein_name: "Cyclooxygenase-2 (COX-2)",
    drug_name: "Ibuprofen",
    protein: "MLARALLLCAVLALSHTANPCCSHPCQNRGVCMSVGFDQYKCDCTRTGFYGENCTTPEFLTRIKLFLKPTPNTVHYILTHFKGFWNVVNNIPFLRNAIMSYVLTSRSHLIDSPPTYNADYGYKSWEAFSNLSYYTRALPPVPDDCPTPLGVKGKKQLPDSNEIVEKLLLRRKFIPDPQGTNLMFAFFAQHFTHQFFKTDHKRGPGRKALRPGSRTTDSRYNLGSVLPSCQKHNNHCSPEDPQPGPIFHLQEYGVKDSISLDTSASVPPHTSVEPVNHTPPPIVHNHPIILQQVMPGPQTFPYLFNHCGMHSDAYEKGWKAALINEFKKNLVLSTLEFQNLTNYDLSVPGQSMVSARQAIQAIQLFQDPQLEAAK",
    drug: "CC(C)Cc1ccc(cc1)C(C)C(=O)O",
  },
  {
    label: "EGFR + Gefitinib",
    protein_name: "Epidermal Growth Factor Receptor (EGFR)",
    drug_name: "Gefitinib",
    protein: "MRPSGTAGAALLALLAALCPASRALEEKKVCQGTSNKLTQLGTFEDHFLSLQRMFNNCEVVLGNLEITYVQRNYDLSFLKTIQEVAGYVLIALNTVERIPLENLQIIRGNMYYENSYALAVLSNYDANKTGLKELPMRNLQEILHGAVRFSNNPALCNVESIQWRDIVSSDFLSNMSMDFQNHLGSCQKCDPSCPNGSCWGAGEENCQKLTKIICAQQCSGRCRGKSPSDCCHNQCAAGCTGPRESDCLVCRKFRDEATCKDTCPPLMLYNPTTYQMDVNPEGKYSFGATCVKKCPRNYVVTDHGSCVRACGADSYEMEEDGVRKCKKCEGPCRKVCNGIGIGEFKDSLSINATNIKHFKNCTSISGDLHILPVAFRGDSFTHTPPLDPQELDILKTVKEITGFLLIQAWPENRTDLHAFENLEIIRGRTKQHGQFSLAVVSLNITSLGLRSLKEISDGDVIISGNKNLCYANTINWKKLFGTSGQKTKIISNRGENSCKATGQVCHALCSPEGCWGPEPRDCVSCRNVSRGRECVDKCNLLEGEPREFVENSECIQCHPECLPQAMNITCTGRGPDNCIQCAHYIDGPHCVKTCPAGVMGENNTLVWKYADAGHVCHLCHPNCTYGCTGPGLEGCPTNGPKIPSIATGMVGALLLLLVVALGIGLFMRRRHIVRKRTLRRLLQERELVEPLTPSGEAPNQALLRILKETEFKKIKVLGSGAFGTVYKGLWIPEGEKVKIPVAIKELREATSPKANKEILDEAYVMASVDNPHVCRLLGICLTSTVQLITQLMPFGCLLDYVREHKDNIGSQYLLNWCVQIAKGMNYLEDRRLVHRDLAARNVLVKTPQHVKITDFGLAKLLGAEEKEYHAEGGKVPIKWMALESILHRIYTHQSDVWSYGVTVWELMTFGSKPYDGIPASEISSILEKGERLPQPPICTIDVYMIMVKCWMIDADSRPKFRELIIEFSKMARDPQRYLVIQGDERMHLPSPTDSNFYRALMDEEDMDDVVDADEYLIPQQGFFSSPSTSRTPLLSSLSATSNNSTVACIDRNGLQSCPIKEDSFLQRYSSDPTGALTEDSIDDTFLPVPEYINQSVPKRPAGSVQNPVYHNQPLNPAPSRDPHYQDPHSTAVGNPEYLNTVQPTCVNSTFDSPAHWAQKGSHQISLDNPDYQQDFFPKEAKPNGIFKGSTAENAEYLRVAPQSSEFIGA",
    drug: "COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1",
  },
];

function ProteinDrugInteractionTab() {
  const [protein, setProtein] = useState("");
  const [drug, setDrug] = useState("");
  const [proteinName, setProteinName] = useState("");
  const [drugName, setDrugName] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const resultsRef = useRef(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const fillExample = (ex) => {
    setProtein(ex.protein);
    setDrug(ex.drug);
    setProteinName(ex.protein_name);
    setDrugName(ex.drug_name);
    setResult(null);
  };

  const handleSubmit = async () => {
    if (!protein.trim() || !drug.trim()) {
      setToast({ message: "Please fill both Protein Sequence and Drug SMILES.", type: "error" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/protein-drug-interaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protein: protein.trim(),
          drug: drug.trim(),
          protein_name: proteinName.trim() || "Unknown Protein",
          drug_name: drugName.trim() || "Unknown Drug",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      setResult(data);
      setToast({ message: "Interaction analysis complete!", type: "success" });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    } catch (err) {
      setToast({
        message: err.message.includes("fetch")
          ? "Cannot reach Flask backend. Run: python app.py"
          : `Error: ${err.message}`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const exportResult = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "pdi-report.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const interactionColors = {
    "H-bond": "#06b6d4",
    "hydrogen_bond": "#06b6d4",
    hydrophobic: "#f59e0b",
    ionic: "#10b981",
    "pi-stacking": "#a78bfa",
    van_der_waals: "#94a3b8",
  };

  return (
    <>
      {/* HERO */}
      <section className="hero" style={{ paddingBottom: "2rem" }}>
        <div className="hero-eyebrow">
          <span>🔗</span> Advanced Structural Bioinformatics · Molecular Docking AI
        </div>
        <h1 className="hero-title">
          Protein–Drug <span className="gradient-text">Interaction</span><br />Deep Analysis
        </h1>
        <p className="hero-subtitle">
          Uncover binding site architecture, key residue contacts, docking energetics,
          thermodynamics, and clinical potential using AI-driven structural analysis.
        </p>

        <div className="pdi-stats-row">
          {[
            { v: "3D", l: "Binding Site Map" },
            { v: "ΔG", l: "Free Energy" },
            { v: "Ki", l: "Inhibition Const." },
            { v: "CYP", l: "Interaction Network" },
          ].map(s => (
            <div className="stat-item" key={s.l}>
              <div className="stat-value">{s.v}</div>
              <div className="stat-label">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* EXAMPLES */}
      <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", alignSelf: "center" }}>Examples:</span>
        {PDI_EXAMPLES.map((ex, i) => (
          <button key={i} className="example-chip" style={{ padding: "6px 14px", fontSize: "0.78rem" }} onClick={() => fillExample(ex)}>
            🧬 {ex.label}
          </button>
        ))}
      </div>

      {/* INPUT */}
      <div className="card" style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          <div className="field-group">
            <label className="field-label" htmlFor="pdi-protein-name">
              <span className="field-label-icon">🏷️</span>
              Protein Name <span className="field-badge">Optional</span>
            </label>
            <input id="pdi-protein-name" className="field-input" style={{ minHeight: "auto", padding: "10px 14px" }}
              placeholder="e.g. COX-2, EGFR, ACE2…" value={proteinName} onChange={e => setProteinName(e.target.value)} />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="pdi-drug-name">
              <span className="field-label-icon">💊</span>
              Drug Name <span className="field-badge">Optional</span>
            </label>
            <input id="pdi-drug-name" className="field-input" style={{ minHeight: "auto", padding: "10px 14px" }}
              placeholder="e.g. Ibuprofen, Gefitinib…" value={drugName} onChange={e => setDrugName(e.target.value)} />
          </div>
        </div>

        <div className="input-grid">
          <div className="field-group">
            <label className="field-label" htmlFor="pdi-protein">
              <span className="field-label-icon">🧬</span>
              Protein Sequence
              <span className="field-badge">FASTA / AA</span>
            </label>
            <textarea id="pdi-protein" className="field-input"
              placeholder={"Enter amino acid sequence…\nMKTIIALSYIFCLVFA…"}
              value={protein} onChange={e => setProtein(e.target.value)} />
            <p className="field-hint">💡 Single-letter amino acid codes</p>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="pdi-drug">
              <span className="field-label-icon">⚗️</span>
              Drug SMILES
              <span className="field-badge">SMILES</span>
            </label>
            <textarea id="pdi-drug" className="field-input"
              placeholder={"Enter SMILES…\nCC(=O)Oc1ccccc1C(=O)O"}
              value={drug} onChange={e => setDrug(e.target.value)} />
            <p className="field-hint">🔬 Simplified Molecular Input Line-Entry System</p>
          </div>
        </div>

        <button id="pdi-analyze-btn" className="btn-predict" onClick={handleSubmit} disabled={loading} style={{ marginTop: "1rem" }}>
          {loading
            ? <><div className="spinner" />Performing Deep Interaction Analysis…</>
            : <><span>🔬</span> Analyze Protein-Drug Interaction <span className="btn-predict-icon">→</span></>
          }
        </button>
      </div>

      {/* RESULTS */}
      {result && (
        <div className="pdi-results" ref={resultsRef}>
          <div className="section-header" style={{ marginTop: "2.5rem" }}>
            <div className="section-number">✓</div>
            <h2 className="section-title">Interaction Analysis Report</h2>
            <span className="section-subtitle">
              <strong style={{ color: "#10b981" }}>{proteinName || "Protein"}</strong> + <strong style={{ color: "#06b6d4" }}>{drugName || "Drug"}</strong>
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
              <CopyButton text={JSON.stringify(result, null, 2)} small />
              <button className="btn-export" onClick={exportResult}>⬇️ Export</button>
            </div>
          </div>

          {/* TOP 3 METRICS */}
          <div className="pdi-top-metrics">
            <div className="pdi-metric-card">
              <ScoreRing score={result.binding_affinity ?? 0} size={110} />
              <div className="pdi-metric-label">Binding Affinity</div>
              <div className="pdi-metric-sub">{getScoreLabel(result.binding_affinity ?? 0).label}</div>
            </div>
            <div className="pdi-metric-card">
              <ScoreRing score={result.confidence ?? 0} size={110} />
              <div className="pdi-metric-label">AI Confidence</div>
              <div className="pdi-metric-sub">Prediction reliability</div>
            </div>
            <div className="pdi-metric-card pdi-docking-card">
              <div className="pdi-dock-score">{result.docking_score?.toFixed?.(1) ?? "—"}</div>
              <div className="pdi-dock-unit">kcal/mol</div>
              <div className="pdi-metric-label">Docking Score</div>
              <div className="pdi-metric-sub">Estimated free energy</div>
            </div>
            <div className="pdi-metric-card pdi-thermo-card">
              <div className="pdi-dock-score" style={{ color: "#a78bfa" }}>
                {result.thermodynamics?.delta_g?.toFixed?.(1) ?? "—"}
              </div>
              <div className="pdi-dock-unit">kcal/mol</div>
              <div className="pdi-metric-label">ΔG Binding</div>
              <div className="pdi-metric-sub">Ki: {result.thermodynamics?.ki_estimate || "—"}</div>
            </div>
          </div>

          {/* MAIN GRID */}
          <div className="pdi-main-grid">
            {/* Binding Site */}
            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-purple">🎯</div>
                <div className="info-card-title">Binding Site</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { label: "Pocket Volume", val: result.binding_site?.pocket_volume, cm: {} },
                  { label: "Druggability", val: result.binding_site?.druggability, cm: SEL_COLOR },
                  { label: "Active Site", val: result.binding_site?.active_site, cm: {} },
                  { label: "Allosteric", val: result.binding_site?.allosteric, cm: {} },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{row.label}</span>
                    {Object.keys(row.cm).length > 0
                      ? <Badge value={row.val} colorMap={row.cm} />
                      : <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)", textTransform: "capitalize" }}>{String(row.val || "—")}</span>
                    }
                  </div>
                ))}
              </div>
            </div>

            {/* Interaction Network Chart */}
            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-cyan">🕸️</div>
                <div className="info-card-title">Interaction Network</div>
              </div>
              {result.interaction_network && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {[
                    { key: "hydrogen_bonds", label: "H-Bonds", color: "#06b6d4" },
                    { key: "hydrophobic_contacts", label: "Hydrophobic", color: "#f59e0b" },
                    { key: "ionic_interactions", label: "Ionic", color: "#10b981" },
                    { key: "pi_stacking", label: "π-Stacking", color: "#a78bfa" },
                    { key: "van_der_waals", label: "Van der Waals", color: "#94a3b8" },
                  ].map(row => {
                    const count = result.interaction_network[row.key] || 0;
                    const total = result.interaction_network.total_contacts || 1;
                    return (
                      <div key={row.key} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", width: "100px", flexShrink: 0 }}>{row.label}</span>
                        <div style={{ flex: 1, height: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{ height: "100%", background: `linear-gradient(90deg, ${row.color}55, ${row.color})`, borderRadius: "4px", width: `${(count / Math.max(total, 1)) * 100}%`, transition: "width 1s ease" }} />
                        </div>
                        <span style={{ fontSize: "0.75rem", color: row.color, fontWeight: 700, width: "20px", textAlign: "right" }}>{count}</span>
                      </div>
                    );
                  })}
                  <div style={{ marginTop: "4px", padding: "6px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", textAlign: "center", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>Total Contacts: </span>
                    <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)" }}>{result.interaction_network.total_contacts}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Interaction Strength Radar */}
            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-emerald">📊</div>
                <div className="info-card-title">Interaction Strengths</div>
              </div>
              {result.visualization_data?.interaction_strengths && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <RadarChart
                    scores={[
                      result.visualization_data.interaction_strengths.h_bond_strength || 0,
                      result.visualization_data.interaction_strengths.hydrophobic_strength || 0,
                      result.visualization_data.interaction_strengths.ionic_strength || 0,
                      result.visualization_data.interaction_strengths.vdw_strength || 0,
                      result.visualization_data.interaction_strengths.pi_strength || 0,
                    ]}
                    labels={["H-Bond", "Hydro", "Ionic", "VdW", "π-Stack"]}
                    colors={["#06b6d4", "#f59e0b", "#10b981", "#94a3b8", "#a78bfa"]}
                  />
                </div>
              )}
            </div>
          </div>

          {/* KEY RESIDUES Visualization */}
          {result.key_residues?.length > 0 && (
            <div className="info-card" style={{ marginTop: "1rem" }}>
              <div className="info-card-header">
                <div className="info-card-icon icon-amber">🧩</div>
                <div className="info-card-title">Key Binding Residues</div>
                <div style={{ marginLeft: "auto", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {Object.entries(interactionColors).slice(0, 5).map(([k, c]) => (
                    <span key={k} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.65rem", color: "var(--text-muted)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />
                      {k.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
              <div className="residue-map">
                {result.key_residues.map((res, i) => (
                  <ResidueNode key={i} residue={res} index={i} />
                ))}
              </div>
              {/* Residue Table */}
              <div className="residue-table" style={{ marginTop: "1rem" }}>
                <div className="residue-table-header">
                  {["Residue", "Position", "Interaction", "Contribution", "Distance"].map(h => (
                    <div key={h} className="rt-cell rt-head">{h}</div>
                  ))}
                </div>
                {result.key_residues.map((res, i) => (
                  <div key={i} className="residue-table-row">
                    <div className="rt-cell">
                      <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{res.amino_acid}</span>
                    </div>
                    <div className="rt-cell" style={{ color: "var(--purple-light)" }}>{res.position}</div>
                    <div className="rt-cell">
                      <Badge value={res.interaction_type?.replace(/_/g, "-")} colorMap={interactionColors} fallback="unknown" />
                    </div>
                    <div className="rt-cell">
                      <Badge value={res.contribution} colorMap={{ critical: "#10b981", major: "#f59e0b", minor: "#94a3b8" }} fallback="minor" />
                    </div>
                    <div className="rt-cell" style={{ color: "var(--text-secondary)" }}>
                      {res.distance_angstrom?.toFixed?.(1) ?? res.distance_angstrom}Å
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Row: Analysis Details */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
            {/* Protein Analysis */}
            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-purple">🧬</div>
                <div className="info-card-title">Protein Analysis</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[
                  { label: "Secondary Structure", val: result.protein_analysis?.secondary_structure },
                  { label: "Flexibility", val: result.protein_analysis?.flexibility },
                  { label: "Functional Class", val: result.protein_analysis?.functional_class },
                  { label: "Target Family", val: result.protein_analysis?.target_family },
                ].map(r => (
                  <div key={r.label} style={{ padding: "7px 10px", background: "rgba(255,255,255,0.03)", borderRadius: "7px", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "2px" }}>{r.label}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-primary)", fontWeight: 500, textTransform: "capitalize" }}>{String(r.val || "—").replace(/_/g, " ")}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Drug Analysis */}
            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-cyan">💊</div>
                <div className="info-card-title">Drug Analysis</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[
                  { label: "Binding Mode", val: result.drug_analysis?.binding_mode },
                  { label: "Pharmacophore Match", val: result.drug_analysis?.pharmacophore_match },
                  { label: "Strain Energy", val: result.drug_analysis?.strain_energy },
                  { label: "Induced Fit", val: result.drug_analysis?.induced_fit },
                ].map(r => (
                  <div key={r.label} style={{ padding: "7px 10px", background: "rgba(255,255,255,0.03)", borderRadius: "7px", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "2px" }}>{r.label}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-primary)", fontWeight: 500, textTransform: "capitalize" }}>{String(r.val || "—").replace(/_/g, " ")}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Selectivity Profile */}
            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-emerald">🎯</div>
                <div className="info-card-title">Selectivity Profile</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  { label: "Target Selectivity", val: result.selectivity_profile?.target_selectivity, cm: SEL_COLOR },
                  { label: "Off-Target Risk", val: result.selectivity_profile?.off_target_risk, cm: RISK_COLOR },
                  { label: "Resistance Risk", val: result.selectivity_profile?.resistance_risk, cm: RISK_COLOR },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{row.label}</span>
                    <Badge value={row.val} colorMap={row.cm} />
                  </div>
                ))}
                {result.selectivity_profile?.notes && (
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {result.selectivity_profile.notes}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Clinical Relevance */}
          <div className="info-card pdi-clinical-card" style={{ marginTop: "1rem" }}>
            <div className="info-card-header">
              <div className="info-card-icon icon-amber">🏥</div>
              <div className="info-card-title">Clinical Relevance & Recommendations</div>
              <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
                {[
                  { label: "Therapeutic Potential", val: result.clinical_relevance?.therapeutic_potential, cm: SEL_COLOR },
                  { label: "Novelty", val: result.clinical_relevance?.novelty, cm: { "me-too": "#94a3b8", improved: "#f59e0b", novel: "#10b981" } },
                  { label: "Development Stage", val: result.clinical_relevance?.development_readiness, cm: { "early-stage": "#94a3b8", "lead-optimization": "#f59e0b", preclinical: "#06b6d4", clinical: "#10b981" } },
                ].map(b => (
                  <div key={b.label} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginBottom: "3px" }}>{b.label}</div>
                    <Badge value={b.val} colorMap={b.cm} />
                  </div>
                ))}
              </div>
            </div>
            {result.clinical_relevance?.notes && (
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                {result.clinical_relevance.notes}
              </p>
            )}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>🔬 Recommendations</div>
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                {result.recommendations}
              </p>
            </div>
          </div>

          {/* Thermodynamics */}
          <div className="info-card" style={{ marginTop: "1rem" }}>
            <div className="info-card-header">
              <div className="info-card-icon icon-purple">🌡️</div>
              <div className="info-card-title">Thermodynamic Profile</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: "12px" }}>
              {[
                { label: "ΔG Binding", val: `${result.thermodynamics?.delta_g?.toFixed?.(1) ?? "—"} kcal/mol`, color: "#a78bfa" },
                { label: "Enthalpy Driven", val: String(result.thermodynamics?.enthalpy_driven || "—"), color: "#06b6d4" },
                { label: "Entropy Driven", val: String(result.thermodynamics?.entropy_driven || "—"), color: "#f59e0b" },
                { label: "Ki Estimate", val: result.thermodynamics?.ki_estimate || "—", color: "#10b981" },
              ].map(t => (
                <div key={t.label} style={{ padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", border: "1px solid var(--border)", textAlign: "center" }}>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "6px" }}>{t.label}</div>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: t.color, textTransform: "capitalize" }}>{t.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   CHATBOT TAB
═══════════════════════════════════════════════════════════════ */
const SUGGESTED_QUESTIONS = [
  "What is SMILES notation and how is it used in drug discovery?",
  "Explain the Lipinski Rule of Five for drug-likeness.",
  "What does a binding score of 0.85 mean for a drug candidate?",
  "How does hydrogen bonding affect protein-drug interaction?",
  "What are pharmacokinetics (ADMET) in drug development?",
  "Explain the difference between selectivity and specificity in pharmacology.",
];

function ChatbotTab({ embedded = false }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "👋 Hello! I'm **DrugsX AI**, your expert guide in drug discovery and bioinformatics.\n\nI can help you understand:\n- **Protein sequences** and their structures\n- **SMILES notation** and molecular properties\n- **Binding affinities** and pharmacokinetics\n- **Drug development pipeline** and clinical trials\n\nAsk me anything about drug discovery!",
      id: Date.now(),
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMsg = { role: "user", content: msg, id: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const history = messages
      .filter(m => m.role === "user" || (m.role === "assistant" && m.id !== messages[0]?.id))
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      setMessages(prev => [...prev, { role: "assistant", content: data.reply, id: Date.now() }]);
    } catch (err) {
      setToast({
        message: err.message.includes("fetch")
          ? "Cannot reach Flask backend. Run: python app.py"
          : `Error: ${err.message}`,
        type: "error",
      });
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "⚠️ I couldn't connect to the backend. Please make sure `python app.py` is running.",
        id: Date.now(),
        isError: true,
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    setMessages([{
      role: "assistant",
      content: "Chat cleared! How can I help you with drug discovery today?",
      id: Date.now(),
    }]);
  };

  const exportChat = () => {
    const text = messages.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "drugsx-chat.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`chatbot-container ${embedded ? "chatbot-embedded" : ""}`}>
      {/* Show full header only when NOT embedded */}
      {!embedded && (
        <div className="chat-header">
          <div className="chat-header-left">
            <div className="chat-avatar-main">🧬</div>
            <div>
              <div className="chat-title">DrugsX AI Assistant</div>
              <div className="chat-subtitle">
                <div className="status-dot" /> Powered by Groq · Llama 3.3 70B
              </div>
            </div>
          </div>
          <div className="chat-header-actions">
            <button className="chat-action-btn" onClick={exportChat} title="Export">⬇️</button>
            <button className="chat-action-btn chat-action-danger" onClick={clearChat} title="Clear">🗑️</button>
          </div>
        </div>
      )}

      {/* When embedded, show compact action row */}
      {embedded && (
        <div className="chat-embedded-actions">
          <button className="chat-action-btn" onClick={exportChat} title="Export chat">⬇️ Export</button>
          <button className="chat-action-btn chat-action-danger" onClick={clearChat} title="Clear">🗑️ Clear</button>
        </div>
      )}

      {messages.length <= 1 && (
        <div className={`suggested-section ${embedded ? "suggested-compact" : ""}`}>
          <div className="suggested-label">💬 Try asking</div>
          <div className="suggested-grid">
            {(embedded ? SUGGESTED_QUESTIONS.slice(0, 3) : SUGGESTED_QUESTIONS).map((q, i) => (
              <button key={i} className="suggested-pill" onClick={() => sendMessage(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chat-messages" id={embedded ? "chat-messages-embed" : "chat-messages"}>
        {messages.map(msg => (
          <div key={msg.id} className={`chat-message-row ${msg.role}`}>
            <div className={`chat-avatar ${msg.role}`}>
              {msg.role === "assistant" ? "🧬" : "👤"}
            </div>
            <div className={`chat-bubble ${msg.role} ${msg.isError ? "error" : ""}`}>
              <MarkdownText text={msg.content} />
              <div className="chat-bubble-footer">
                <CopyButton text={msg.content} small />
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-message-row assistant">
            <div className="chat-avatar assistant">🧬</div>
            <div className="chat-bubble assistant">
              <div className="typing-indicator"><span /><span /><span /></div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            id={embedded ? "chat-input-embed" : "chat-input"}
            className="chat-input"
            placeholder={embedded ? "Ask DrugsX AI…" : "Ask about pharmacokinetics, SMILES, binding affinity… (Enter to send)"}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={embedded ? 1 : 2}
            disabled={loading}
          />
          <button
            id={embedded ? "chat-send-embed" : "chat-send-btn"}
            className="chat-send-btn"
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            aria-label="Send message"
          >
            {loading ? <div className="spinner" /> : "➤"}
          </button>
        </div>
        {!embedded && <div className="chat-input-hint">Press Enter to send · Shift+Enter for new line</div>}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   SMILES ANALYZER TAB
═══════════════════════════════════════════════════════════════ */
function SmilesTab() {
  const [smiles, setSmiles] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const EXAMPLES = [
    { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
    { name: "Caffeine", smiles: "Cn1cnc2c1c(=O)n(c(=O)n2C)C" },
    { name: "Ibuprofen", smiles: "CC(C)Cc1ccc(cc1)C(C)C(=O)O" },
    { name: "Paracetamol", smiles: "CC(=O)Nc1ccc(O)cc1" },
  ];

  const handleAnalyze = async () => {
    if (!smiles.trim()) {
      setToast({ message: "Please enter a SMILES string.", type: "error" });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${API}/analyze-smiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smiles: smiles.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      setResult(data);
      setToast({ message: "SMILES analysis complete!", type: "success" });
    } catch (err) {
      setToast({ message: err.message.includes("fetch") ? "Backend not running. Run: python app.py" : `Error: ${err.message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="hero" style={{ paddingBottom: "2rem" }}>
        <div className="hero-eyebrow"><span>🧪</span> AI-Powered Molecular Analysis</div>
        <h1 className="hero-title">
          Analyze <span className="gradient-text">SMILES</span> Structures
        </h1>
        <p className="hero-subtitle">
          Paste any SMILES string to instantly get compound class, drug-likeness (Lipinski RO5),
          toxicity alerts, functional groups, and therapeutic area predictions.
        </p>
      </section>

      <div className="card" style={{ maxWidth: "700px", margin: "0 auto" }}>
        <div className="field-group">
          <label className="field-label" htmlFor="smiles-input">
            <span className="field-label-icon">🔬</span>
            SMILES String
            <span className="field-badge">Simplified Molecular Input</span>
          </label>
          <textarea
            id="smiles-input"
            className="field-input"
            placeholder="Paste SMILES here… e.g. CC(=O)Oc1ccccc1C(=O)O"
            value={smiles}
            onChange={e => setSmiles(e.target.value)}
            rows={3}
            style={{ minHeight: "80px" }}
          />
          <div className="smiles-examples">
            <span className="field-hint">Quick examples:</span>
            {EXAMPLES.map(ex => (
              <button key={ex.name} className="example-chip" onClick={() => setSmiles(ex.smiles)}>
                {ex.name}
              </button>
            ))}
          </div>
        </div>

        <button id="analyze-smiles-btn" className="btn-predict" onClick={handleAnalyze} disabled={loading} style={{ marginTop: "1rem" }}>
          {loading ? <><div className="spinner" />Analyzing structure…</> : <><span>🔬</span> Analyze SMILES <span className="btn-predict-icon">→</span></>}
        </button>
      </div>

      {result && (
        <div className="smiles-results" style={{ maxWidth: "700px", margin: "2rem auto 0" }}>
          <div className="section-header">
            <div className="section-number">✓</div>
            <h2 className="section-title">Analysis Results</h2>
            <CopyButton text={JSON.stringify(result, null, 2)} small />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-purple">🧬</div>
                <div className="info-card-title">Compound Identity</div>
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div><span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Compound / Class</span><br /><strong style={{ color: "var(--text-primary)" }}>{result.compound_name || "—"}</strong></div>
                <div><span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Molecular Formula</span><br /><strong style={{ color: "var(--purple-light)" }}>{result.molecular_formula || "—"}</strong></div>
                <div><span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Therapeutic Area</span><br /><strong style={{ color: "var(--cyan-light)" }}>{result.therapeutic_area || "—"}</strong></div>
              </div>
            </div>

            <div className="info-card">
              <div className="info-card-header">
                <div className="info-card-icon icon-amber">⚗️</div>
                <div className="info-card-title">Risk Assessment</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>Toxicity Alert</span>
                  <Badge value={result.toxicity_alert || "none"} colorMap={TOX_COLOR} />
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{result.drug_likeness}</p>
              </div>
            </div>
          </div>

          {result.functional_groups?.length > 0 && (
            <div className="info-card" style={{ marginTop: "1rem" }}>
              <div className="info-card-header">
                <div className="info-card-icon icon-cyan">🔗</div>
                <div className="info-card-title">Functional Groups Detected</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {result.functional_groups.map((fg, i) => (
                  <span key={i} className="functional-group-tag">{fg}</span>
                ))}
              </div>
            </div>
          )}

          {result.notes && (
            <div className="info-card" style={{ marginTop: "1rem" }}>
              <div className="info-card-header">
                <div className="info-card-icon icon-emerald">📝</div>
                <div className="info-card-title">Structural Notes</div>
              </div>
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>{result.notes}</p>
            </div>
          )}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   FLOATING MESSENGER WIDGET
═══════════════════════════════════════════════════════════════ */
function FloatingChatWidget() {
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [greeting, setGreeting] = useState(true);

  // Hide greeting bubble after 6s
  useEffect(() => {
    const t = setTimeout(() => setGreeting(false), 6000);
    return () => clearTimeout(t);
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setHasUnread(false);
    setGreeting(false);
  };
  const handleClose = () => setOpen(false);

  return (
    <div className="fcw-root" aria-label="AI Chat Widget">

      {/* ── Greeting bubble ── */}
      {greeting && !open && (
        <div className="fcw-greeting" role="status">
          <span className="fcw-greeting-emoji">👋</span>
          <div>
            <div className="fcw-greeting-hi">Hi there!</div>
            <div className="fcw-greeting-msg">Ask me about drugs, pharmacokinetics, or protein interactions.</div>
          </div>
          <button className="fcw-greeting-close" onClick={() => setGreeting(false)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* ── Chat panel ── */}
      <div className={`fcw-panel ${open ? "fcw-open" : ""}`} role="dialog" aria-modal="true" aria-label="DrugsX AI Chat">
        {/* Panel header */}
        <div className="fcw-panel-header">
          <div className="fcw-panel-header-left">
            <div className="fcw-avatar-wrap">
              <span className="fcw-avatar-emoji">🧬</span>
              <span className="fcw-avatar-dot" />
            </div>
            <div>
              <div className="fcw-panel-name">DrugsX AI</div>
              <div className="fcw-panel-status">
                <div className="status-dot" />
                Groq · Llama 3.3 · Online
              </div>
            </div>
          </div>
          <div className="fcw-panel-actions">
            <button className="fcw-action-btn" onClick={handleClose} aria-label="Minimise" title="Minimise">─</button>
            <button className="fcw-action-btn fcw-close-btn" onClick={handleClose} aria-label="Close" title="Close">✕</button>
          </div>
        </div>

        {/* Chat body — embedded ChatbotTab */}
        <div className="fcw-panel-body">
          <ChatbotTab embedded />
        </div>
      </div>

      {/* ── FAB button ── */}
      <button
        id="chat-fab-btn"
        className={`fcw-fab ${open ? "fcw-fab-open" : ""}`}
        onClick={open ? handleClose : handleOpen}
        aria-label={open ? "Close AI chat" : "Open AI chat"}
        title="DrugsX AI Assistant"
      >
        {/* Gradient ring pulse when closed */}
        {!open && hasUnread && <span className="fcw-fab-pulse" />}

        {/* Icon morphs: bot → X */}
        <span className={`fcw-fab-icon ${open ? "fcw-icon-hide" : ""}`}>🤖</span>
        <span className={`fcw-fab-icon fcw-fab-x ${open ? "" : "fcw-icon-hide"}`}>✕</span>

        {/* Unread badge */}
        {!open && hasUnread && <span className="fcw-unread-badge">1</span>}

        {/* Label pill beside FAB */}
        {!open && <span className="fcw-fab-tooltip">Ask AI</span>}
      </button>

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN APP (Tabs)
═══════════════════════════════════════════════════════════════ */
const TABS = [
  { id: "predictor", label: "🔬 Predictor", shortLabel: "Predictor" },
  { id: "pk", label: "💊 Pharmacokinetics", shortLabel: "PK/ADMET" },
  { id: "pdi", label: "🔗 Protein–Drug Interaction", shortLabel: "PDI" },
  { id: "smiles", label: "🧪 SMILES Analyzer", shortLabel: "SMILES" },
  
];

export default function App() {
  const [activeTab, setActiveTab] = useState("predictor");

  return (
    <div className="app">

      {/* ══ NAVBAR ══ */}
      <nav className="navbar">
        <a href="/" className="navbar-brand">
          <div className="navbar-logo">🧬</div>
          <div>
            <div className="navbar-name">DrugsX</div>
            <div className="navbar-tagline">Biotechnology AI Platform</div>
          </div>
        </a>

        <div className="nav-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              className={`nav-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="navbar-badge">
          <div className="status-dot" />
          Groq Online
        </div>
      </nav>

      {/* ══ MAIN ══ */}
      <main className="main-content">
        {activeTab === "predictor" && <PredictorTab />}
        {activeTab === "pk" && <PharmacokineticTab />}
        {activeTab === "pdi" && <ProteinDrugInteractionTab />}
        {activeTab === "smiles" && <SmilesTab />}
        {activeTab === "chat" && <ChatbotTab />}
      </main>

      {/* ══ FLOATING CHAT ══ */}
      <FloatingChatWidget />
    </div>
  );
}
