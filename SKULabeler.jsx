const { useState, useEffect, useRef, createContext, useContext } = React;

// ─────────────────────────────────────────────────────────────────────────────
//  FIELDASSIST CLAYMORPHISM THEME SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
const DARK = {
  mode:          "dark",
  bg:            "#0F172A",
  clayBg:        "#1E293B",
  wellBg:        "#0D1527",
  cardBorder:    "rgba(255, 255, 255, 0.08)",
  shadowDark:    "rgba(0, 0, 0, 0.5)",
  shadowLight:   "rgba(255, 255, 255, 0.035)",
  highlight:     "rgba(255, 255, 255, 0.1)",
  navBg:         "rgba(15, 23, 42, 0.92)",
  navBorder:     "rgba(37, 99, 235, 0.2)",
  text:          "#F8FAFC",
  textSub:       "#CBD5E1",
  textMuted:     "#A9B7CB",
  accent:        "#2563EB", // FieldAssist Vivid Blue
  accentDark:    "#1D4ED8",
  accentLight:   "#60A5FA",
  accentGlow:    "rgba(37, 99, 235, 0.35)",
  accentBg:      "rgba(37, 99, 235, 0.12)",
  accentBorder:  "rgba(37, 99, 235, 0.35)",
  secondary:     "#0EA5E9",
  success:       "#10B981",
  warning:       "#F59E0B",
  danger:        "#EF4444",
  toggleBg:      "rgba(37, 99, 235, 0.15)",
  toggleText:    "#60A5FA",
};

const LIGHT = {
  mode:          "light",
  bg:            "#F0F4F9",
  clayBg:        "#FFFFFF",
  wellBg:        "#E2E8F0",
  cardBorder:    "rgba(255, 255, 255, 0.8)",
  shadowDark:    "rgba(163, 177, 198, 0.35)",
  shadowLight:   "#FFFFFF",
  highlight:     "rgba(255, 255, 255, 0.9)",
  navBg:         "rgba(240, 244, 249, 0.92)",
  navBorder:     "rgba(37, 99, 235, 0.15)",
  text:          "#1E293B",
  textSub:       "#475569",
  textMuted:     "#64748B",
  accent:        "#2563EB", // FieldAssist Vivid Blue
  accentDark:    "#1D4ED8",
  accentLight:   "#3B82F6",
  accentGlow:    "rgba(37, 99, 235, 0.22)",
  accentBg:      "rgba(37, 99, 235, 0.08)",
  accentBorder:  "rgba(37, 99, 235, 0.25)",
  secondary:     "#0284C7",
  success:       "#059669",
  warning:       "#D97706",
  danger:        "#DC2626",
  toggleBg:      "rgba(37, 99, 235, 0.08)",
  toggleText:    "#2563EB",
};

const ThemeCtx = createContext(LIGHT);
const useT = () => useContext(ThemeCtx);
const PageCtx = createContext(1);

const API_BASE_URL = window.NOESIS_API_URL || "http://localhost:8080/api/sessions";

function injectFonts() {
  if (document.getElementById("sku-fonts")) return;
  const l = document.createElement("link");
  l.id = "sku-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap";
  document.head.appendChild(l);
}

const buildCSS = (T) => `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${T.bg}; color: ${T.text}; transition: background 0.3s, color 0.3s; font-family: 'Inter', sans-serif; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.accentBorder}; border-radius: 4px; }
  
  /* Claymorphic Utility Classes */
  .clay-card {
    background: ${T.clayBg};
    border-radius: 20px;
    box-shadow: 8px 8px 20px ${T.shadowDark}, -8px -8px 20px ${T.shadowLight}, inset 1px 1px 2px ${T.highlight};
    border: 1px solid ${T.cardBorder};
    transition: all 0.25s ease;
  }
  
  .clay-card-interactive:hover {
    transform: translateY(-3px);
    box-shadow: 12px 12px 28px ${T.shadowDark}, -10px -10px 24px ${T.shadowLight}, inset 1px 1px 2px ${T.highlight};
  }
  
  .clay-well {
    background: ${T.wellBg};
    border-radius: 14px;
    box-shadow: inset 4px 4px 8px ${T.shadowDark}, inset -4px -4px 8px ${T.shadowLight};
  }
  
  .clay-btn-primary {
    background: linear-gradient(135deg, ${T.accent}, ${T.accentDark});
    color: #FFFFFF;
    border: none;
    border-radius: 14px;
    padding: 12px 24px;
    font-family: 'Inter', sans-serif;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    letter-spacing: 0.02em;
    box-shadow: 6px 6px 14px ${T.accentGlow}, inset 1.5px 1.5px 3px rgba(255,255,255,0.4), inset -1.5px -1.5px 3px rgba(0,0,0,0.2);
    transition: all 0.2s ease;
  }
  .clay-btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 8px 8px 20px ${T.accentGlow}, inset 1.5px 1.5px 3px rgba(255,255,255,0.5), inset -1.5px -1.5px 3px rgba(0,0,0,0.2);
    filter: brightness(1.05);
  }
  .clay-btn-primary:active {
    transform: translateY(1px);
    box-shadow: 3px 3px 8px ${T.accentGlow}, inset 2px 2px 4px rgba(0,0,0,0.3);
  }
  .clay-btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
  
  .clay-btn-secondary {
    background: ${T.clayBg};
    color: ${T.accent};
    border: 1px solid ${T.accentBorder};
    border-radius: 12px;
    padding: 10px 20px;
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    box-shadow: 4px 4px 10px ${T.shadowDark}, -4px -4px 10px ${T.shadowLight}, inset 1px 1px 2px ${T.highlight};
    transition: all 0.2s ease;
  }
  .clay-btn-secondary:hover {
    background: ${T.accentBg};
    color: ${T.accentDark};
    transform: translateY(-1px);
    box-shadow: 6px 6px 14px ${T.shadowDark}, -5px -5px 12px ${T.shadowLight};
  }
  .clay-btn-secondary:active {
    transform: translateY(1px);
    box-shadow: inset 2px 2px 5px ${T.shadowDark};
  }

  @keyframes shimmer { 0%{transform:translateX(-120%)} 100%{transform:translateX(220%)} }
  @keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  .page-enter { animation: fadeUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

  @media (max-width: 900px) {
    .responsive-grid { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 640px) {
    .stat-cards-container { grid-template-columns: 1fr 1fr !important; }
    .step-indicator { display: none !important; }
  }
`;

const mono = { fontFamily: "'JetBrains Mono', monospace" };
const lbl = (T) => ({ ...mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: T.textMuted, display: "block", marginBottom: 8, fontWeight: 600 });

// ─────────────────────────────────────────────────────────────────────────────
//  SHELL — FIELDASSIST CLAY NAVBAR & HEADER
// ─────────────────────────────────────────────────────────────────────────────
function Shell({ children, stepLabel, title, onToggleTheme }) {
  const T = useT();
  const currentPage = useContext(PageCtx);
  const stepNames = ["Upload", "Inference", "Results", "Browser"];

  return (
    <div style={{
      minHeight: "100vh",
      background: T.bg,
      fontFamily: "'Inter', sans-serif",
      color: T.text, paddingBottom: 32,
      transition: "background 0.3s, color 0.3s",
    }}>
      <style>{buildCSS(T)}</style>

      {/* Clay Navigation Bar */}
      <nav style={{
        display: "flex", alignItems: "center", gap: 16, padding: "16px 36px",
        background: T.navBg,
        borderBottom: `1px solid ${T.navBorder}`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        position: "sticky", top: 0, zIndex: 300,
        boxShadow: `0 4px 20px ${T.shadowDark}`,
      }}>
        {/* FieldAssist Brand Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg viewBox="0 0 32 32" width="30" height="30" style={{ flexShrink: 0 }}>
            <defs>
              <linearGradient id="fa-blue-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#0284C7" />
              </linearGradient>
            </defs>
            <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#fa-blue-grad)" />
            <path d="M9 10H23M9 16H19M9 22H15" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.01em", color: T.text }}>
              FieldAssist <span style={{ color: T.accent }}>Noesis</span>
            </span>
            <span style={{ ...mono, fontSize: 8.5, color: T.textMuted, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              SKU Labeller (YOLOv11)
            </span>
          </div>
        </div>

        {/* Clay Step Indicators */}
        <div className="step-indicator" style={{
          display: "flex", alignItems: "center", gap: 6, margin: "0 auto",
          background: T.wellBg, padding: "4px 10px", borderRadius: 100,
          boxShadow: `inset 2px 2px 5px ${T.shadowDark}, inset -2px -2px 5px ${T.shadowLight}`
        }}>
          {stepNames.map((name, i) => {
            const stepNum = i + 1;
            const isActive = currentPage === stepNum;
            const isDone = currentPage > stepNum;
            return (
              <React.Fragment key={stepNum}>
                {i > 0 && <span style={{ ...mono, fontSize: 11, color: T.textMuted, opacity: 0.4 }}>›</span>}
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 100,
                  background: isActive ? T.accent : "transparent",
                  color: isActive ? "#FFFFFF" : isDone ? T.accent : T.textMuted,
                  boxShadow: isActive ? `3px 3px 8px ${T.accentGlow}, inset 1px 1px 2px rgba(255,255,255,0.4)` : "none",
                  transition: "all 0.25s ease", fontWeight: isActive ? 700 : 500
                }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: isActive ? "#FFFFFF" : isDone ? T.accent : T.textMuted,
                  }} />
                  <span style={{ ...mono, fontSize: 11 }}>{name}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Dark/Light Theme Toggle */}
        <button className="clay-btn-secondary" onClick={onToggleTheme} style={{
          borderRadius: 100, padding: "8px 16px", display: "flex", alignItems: "center", gap: 6,
          fontWeight: 600, fontSize: 12
        }}>
          {T.mode === "dark" ? "☀ Light Mode" : "☾ Dark Mode"}
        </button>
      </nav>

      {/* Header Banner */}
      {title && (
        <div style={{ padding: "32px 40px 0", width: "100%", maxWidth: 1180, margin: "0 auto" }}>
          <p style={{ ...mono, fontSize: 11, color: T.accent, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>
            {stepLabel}
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.025em", color: T.text }}>{title}</h1>
        </div>
      )}

      <div style={{ padding: "24px 40px 0", display: "flex", flexDirection: "column", alignItems: "center" }} className="page-enter">
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CLAY UPLOAD ZONE
// ─────────────────────────────────────────────────────────────────────────────
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".bmp"]);

function filterImageFiles(files) {
  const allFiles = Array.from(files || []);
  const images = allFiles.filter(file => IMAGE_EXTENSIONS.has(file.name.slice(file.name.lastIndexOf(".")).toLowerCase()));
  return { images, ignored: allFiles.length - images.length };
}

function entryToFile(entry) {
  return new Promise(resolve => entry.file(resolve, () => resolve(null)));
}

async function readDirectory(entry) {
  const reader = entry.createReader();
  const entries = [];
  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    entries.push(...batch);
  }
  return entries;
}

async function collectEntryFiles(entry) {
  if (entry.isFile) {
    const file = await entryToFile(entry);
    return file ? [file] : [];
  }
  if (entry.isDirectory) {
    const children = await readDirectory(entry);
    const nested = await Promise.all(children.map(collectEntryFiles));
    return nested.flat();
  }
  return [];
}

function UploadZone({ label, accept, hint, icon, value, onChange, isFolder = false, subText, warnText }) {
  const T = useT();
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  const done = value && (Array.isArray(value) || value instanceof FileList ? value.length > 0 : value.name);
  const displayValue = done ? (isFolder ? `${value.length} images selected` : value.name) : "";

  return (
    <div>
      <span style={lbl(T)}>{label}</span>
      <div
        onClick={() => ref.current.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={async e => {
          e.preventDefault();
          setDrag(false);
          if (!isFolder) {
            onChange(e.dataTransfer.files[0] || null);
            return;
          }
          const transfer = e.dataTransfer;
          const items = Array.from(transfer.items || []);
          const hasEntryApi = items.some(item => typeof item.webkitGetAsEntry === "function");
          if (hasEntryApi) {
            const entries = items.map(item => item.webkitGetAsEntry?.()).filter(Boolean);
            const nestedFiles = (await Promise.all(entries.map(collectEntryFiles))).flat();
            onChange(nestedFiles.length ? nestedFiles : transfer.files);
          } else {
            onChange(transfer.files);
          }
        }}
        style={{
          borderRadius: 16, padding: "18px 16px", textAlign: "center", cursor: "pointer",
          transition: "all 0.2s ease",
          background: done ? (T.mode === "dark" ? "rgba(16,185,129,0.12)" : "rgba(5,150,105,0.08)") : (drag ? T.accentBg : T.wellBg),
          border: `2px dashed ${done ? T.success : drag ? T.accent : T.accentBorder}`,
          boxShadow: drag ? `0 0 16px ${T.accentGlow}` : `inset 3px 3px 6px ${T.shadowDark}, inset -3px -3px 6px ${T.shadowLight}`
        }}
      >
        <div style={{ fontSize: 22, marginBottom: 6, color: done ? T.success : T.accent }}>
          {done ? "✓" : icon}
        </div>
        <p style={{ ...mono, fontSize: 12, fontWeight: done ? 600 : 400, color: done ? T.success : T.textSub }}>
          {isFolder ? hint : (done ? displayValue : hint)}
        </p>
        {subText && <p style={{ ...mono, fontSize: 11, color: T.textSub, marginTop: 5 }}>{subText}</p>}
        {warnText && <p style={{ ...mono, fontSize: 10, color: T.textMuted, marginTop: 3 }}>{warnText}</p>}
        {isFolder && value !== null && value.length === 0 && <p style={{ ...mono, fontSize: 11, color: T.danger, marginTop: 5 }}>No PNG/JPG/BMP images found</p>}
        <input
          ref={ref}
          type="file"
          accept={accept}
          {...(isFolder ? { webkitdirectory: "", directory: "", multiple: true } : {})}
          style={{ display: "none" }}
          onChange={e => onChange(isFolder ? e.target.files : (e.target.files[0] || null))}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CLAY SLIDER & TOGGLE SWITCH
// ─────────────────────────────────────────────────────────────────────────────
function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01 }) {
  const T = useT();
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={lbl(T)}>{label}</span>
        <span style={{ ...mono, fontSize: 13, color: T.accent, fontWeight: 700 }}>{value.toFixed(2)}</span>
      </div>
      <div style={{ position: "relative", height: 8, marginBottom: 6 }}>
        <div style={{ position: "absolute", inset: 0, background: T.wellBg, borderRadius: 10, boxShadow: `inset 2px 2px 4px ${T.shadowDark}, inset -2px -2px 4px ${T.shadowLight}` }} />
        <div style={{
          position: "absolute", left: 0, top: 0, height: "100%",
          width: `${(value - min) / (max - min) * 100}%`,
          background: `linear-gradient(90deg, ${T.accentLight}, ${T.accent})`,
          borderRadius: 10, boxShadow: `0 0 10px ${T.accentGlow}`,
        }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(+e.target.value)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, zIndex: 2, cursor: "pointer" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ ...mono, fontSize: 10, color: T.textMuted }}>{min}</span>
        <span style={{ ...mono, fontSize: 10, color: T.textMuted }}>{max}</span>
      </div>
    </div>
  );
}

function ToggleSwitch({ label, value, onChange, hint }) {
  const T = useT();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 14, background: T.wellBg, boxShadow: `inset 2px 2px 5px ${T.shadowDark}, inset -2px -2px 5px ${T.shadowLight}` }}>
      <div>
        <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: T.text, display: "block" }}>{label}</span>
        {hint && <span style={{ ...mono, fontSize: 10, color: T.textMuted }}>{hint}</span>}
      </div>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 46, height: 26, borderRadius: 13, cursor: "pointer",
          background: value ? `linear-gradient(135deg, ${T.accent}, ${T.accentDark})` : T.clayBg,
          padding: 3, transition: "all 0.25s ease", position: "relative",
          boxShadow: value ? `0 0 10px ${T.accentGlow}` : `inset 2px 2px 4px ${T.shadowDark}`
        }}
      >
        <div style={{
          width: 20, height: 20, borderRadius: "50%", background: "#FFFFFF",
          transform: value ? "translateX(20px)" : "translateX(0)",
          transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: "1px 2px 4px rgba(0,0,0,0.2)"
        }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  const T = useT();
  return (
    <div className="clay-card" style={{ flex: 1, minWidth: 150, padding: "20px 22px" }}>
      <span style={lbl(T)}>{label}</span>
      <p style={{ ...mono, fontSize: 32, fontWeight: 700, color: accent || T.accent, letterSpacing: "-0.03em", lineHeight: 1, margin: "6px 0" }}>{value}</p>
      {sub && <p style={{ ...mono, fontSize: 11, color: T.textMuted }}>{sub}</p>}
    </div>
  );
}

function TipsBanner() {
  const T = useT();
  return (
    <div className="clay-card" style={{ padding: "16px 20px", background: T.accentBg, borderColor: T.accentBorder, display: "flex", alignItems: "flex-start", gap: 12 }}>
      <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>💡</span>
      <div>
        <span style={{ ...mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: T.accent, display: "block", marginBottom: 4, fontWeight: 700 }}>
          Optimization Tips
        </span>
        <p style={{ ...mono, fontSize: 12, color: T.textSub, lineHeight: "20px" }}>
          <span style={{ color: T.accent, fontWeight: 600 }}>Class-Agnostic NMS</span> is enabled by default to prevent duplicate labels on overlapping physical SKUs. Ideal <span style={{ color: T.accent, fontWeight: 600 }}>Confidence</span> is 0.60 – 0.70.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 1 — CONFIGURE & SETUP (YOLOv11 Only + Class-Agnostic NMS)
// ─────────────────────────────────────────────────────────────────────────────
function Page1({ onNext, onToggleTheme, setSessionArgs }) {
  const T = useT();
  const [files, setFiles] = useState({ images: null, ignoredImages: 0, weights: null, darknetLabels: null });
  const [conf, setConf]   = useState(0.25);
  const [iou,  setIou]    = useState(0.45);
  const [agnosticNms, setAgnosticNms] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const ready = files.images && files.images.length > 0 && files.weights;
  const set = k => v => setFiles(p => ({ ...p, [k]: v }));
  const setImages = selectedFiles => {
    const { images, ignored } = filterImageFiles(selectedFiles);
    setFiles(p => ({ ...p, images, ignoredImages: ignored }));
  };

  const handleStart = async () => {
    if(!ready) return;
    setUploading(true);
    setErrorMsg("");
    try {
      // 1. Create Session
      const sesRes = await fetch(`${API_BASE_URL}`, { method: 'POST' });
      if(!sesRes.ok) throw new Error("Failed to create session");
      const { session_id } = await sesRes.json();

      // 2. Upload Images
      const imgData = new FormData();
      for (let i = 0; i < files.images.length; i++) {
        imgData.append("files", files.images[i]);
      }
      const imgRes = await fetch(`${API_BASE_URL}/${session_id}/upload/images`, { method: "POST", body: imgData });
      if(!imgRes.ok) throw new Error("Image upload failed");

      // 3. Upload YOLOv11 .pt Model
      const modelData = new FormData();
      modelData.append("file", files.weights);
      const modRes = await fetch(`${API_BASE_URL}/${session_id}/upload/model`, { method: "POST", body: modelData });
      if(!modRes.ok) throw new Error("Model upload failed");

      // 4. Upload Darknet Labels (optional)
      if(files.darknetLabels) {
        const dlData = new FormData();
        dlData.append("file", files.darknetLabels);
        const dlRes = await fetch(`${API_BASE_URL}/${session_id}/upload/darknet_labels`, { method: "POST", body: dlData });
        if(!dlRes.ok) throw new Error("Darknet labels upload failed");
      }

      setSessionArgs(session_id, conf, iou, agnosticNms);
      onNext();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Shell stepLabel="Step 01 — Setup" title="Upload Dataset & Model Setup" onToggleTheme={onToggleTheme}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24, maxWidth: 1100, width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="clay-card" style={{ padding: 24 }}>
            <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 20, color: T.text }}>Dataset & Model Files</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <UploadZone label="Images Folder" accept=".png,.jpg,.jpeg,.bmp" isFolder={true} hint="PNG, JPG, JPEG or BMP · subfolders included · drop a folder or choose" icon="📁" value={files.images} onChange={setImages}
                subText={files.images !== null ? `${files.images.length} image${files.images.length === 1 ? "" : "s"} accepted` : null}
                warnText={files.ignoredImages > 0 ? `${files.ignoredImages} other file${files.ignoredImages === 1 ? "" : "s"} ignored` : null} />
              <UploadZone label="YOLOv11 Weights (.pt)" accept=".pt" hint="Upload YOLOv11 .pt model file" icon="⚡" value={files.weights} onChange={set("weights")} />
              <UploadZone label="Darknet Labels (optional)" accept="" hint="Upload _darknet.labels file" icon="🏷️" value={files.darknetLabels} onChange={set("darknetLabels")} />
            </div>
            {errorMsg && <p style={{ ...mono, color: T.danger, marginTop: 14, fontSize: 12, fontWeight: 600 }}>⚠️ {errorMsg}</p>}
          </div>
          <TipsBanner />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="clay-card" style={{ padding: 24 }}>
            <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 22, color: T.text }}>Inference Configuration</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <span style={lbl(T)}>Supported Engine</span>
                <div style={{
                  padding: "10px 14px", borderRadius: 12, background: T.accentBg, border: `1px solid ${T.accentBorder}`,
                  display: "flex", alignItems: "center", gap: 8
                }}>
                  <span style={{ fontSize: 16 }}>🎯</span>
                  <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: T.accent }}>YOLOv11 (Ultralytics)</span>
                </div>
              </div>

              <ToggleSwitch
                label="Class-Agnostic NMS"
                hint="agnostic_nms = True"
                value={agnosticNms}
                onChange={setAgnosticNms}
              />

              <Slider label="Confidence Threshold" value={conf} onChange={setConf} />
              <Slider label="IoU Threshold" value={iou} onChange={setIou} />
            </div>
          </div>

          <div className="clay-card" style={{ padding: 20, background: T.accentBg, borderColor: T.accentBorder }}>
            <span style={lbl(T)}>Configuration Summary</span>
            {[
              ["Images", files.images ? `${files.images.length} files` : "—"],
              ["Weights", files.weights?.name || "—"],
              ["Labels", files.darknetLabels?.name || "— (optional)"],
              ["Engine", "YOLOv11 Only"],
              ["Agnostic NMS", agnosticNms ? "ENABLED (True)" : "DISABLED"],
              ["Conf Thresh", conf.toFixed(2)],
              ["IoU Thresh", iou.toFixed(2)]
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.cardBorder}` }}>
                <span style={{ ...mono, fontSize: 11, color: T.textMuted }}>{k}</span>
                <span style={{ ...mono, fontSize: 11, color: T.text, fontWeight: 600, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
              </div>
            ))}
          </div>

          <button disabled={!ready || uploading} className="clay-btn-primary" style={{ width: "100%", padding: 16, fontSize: 15 }} onClick={handleStart}>
            {uploading ? "Uploading Assets..." : "Run YOLOv11 Inference →"}
          </button>
          {!ready && <p style={{ ...mono, fontSize: 11, color: T.textMuted, textAlign: "center", marginTop: -6 }}>Upload images & .pt weights to start</p>}
        </div>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 2 — RUNNING INFERENCE
// ─────────────────────────────────────────────────────────────────────────────
function Page2({ onNext, onBack, onToggleTheme, sessionId, conf, iou, agnosticNms }) {
  const T = useT();
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [log, setLog] = useState([`Connecting to YOLOv11 Engine (agnostic_nms=${agnosticNms})...`]);
  const [done, setDone] = useState(false);
  const [inferenceError, setInferenceError] = useState("");
  const [totalDetections, setTotalDetections] = useState(0);
  const [lastImageDets, setLastImageDets] = useState(0);
  const [logOpen, setLogOpen] = useState(true);
  const logRef = useRef({ addedRunning: false });
  const doneRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    if(!sessionId) return;
    logRef.current = { addedRunning: false };
    doneRef.current = false;
    mountedRef.current = true;
    const sse = new EventSource(`${API_BASE_URL}/${sessionId}/infer?conf=${conf}&iou=${iou}&agnostic_nms=${agnosticNms}`);

    sse.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if(data.status === "loading_model") {
        setLog(l => l.includes("Loading model...") ? l : [...l, "Loading model..."]);
      }
      if(data.error) {
        setLog(l => [...l, `Error: ${data.error}`]);
        sse.close();
        if (mountedRef.current && !doneRef.current) setInferenceError(data.error);
        return;
      }

      setProgress(data.progress || 0);
      setTotal(data.total || 0);
      if(data.detections !== undefined) setTotalDetections(data.detections);
      if(data.image_detections !== undefined) setLastImageDets(data.image_detections);

      if(data.progress && data.total && !logRef.current.addedRunning) {
        logRef.current.addedRunning = true;
        setLog(l => [...l, "Running YOLOv11 batch inference with Class-Agnostic NMS..."]);
      }

      if(data.detections !== undefined && data.progress) {
        const imgNum = data.progress;
        const imgDet = data.image_detections !== undefined ? data.image_detections : null;
        setLog(l => {
          const base = l.filter(line => !line.startsWith("↳"));
          if(imgNum <= 10 && imgDet !== null) {
            const imgLines = l.filter(line => line.startsWith("↳") && !line.includes("total detections"));
            return [...base, ...imgLines, `↳ Image ${imgNum}: ${imgDet} detections`];
          } else {
            const imgLines = l.filter(line => line.startsWith("↳") && line.includes("Image "));
            const first10 = imgLines.slice(0, 10);
            return [...base, ...first10, `↳ ${data.detections} total detections (${imgNum} images processed)`];
          }
        });
      }

      if(data.done) {
        doneRef.current = true;
        setDone(true);
        setLog(l => [...l, "✓ Inference complete!"]);
        sse.close();
        setTimeout(onNext, 1200);
      }
    };

    sse.onerror = () => {
      if (!doneRef.current && mountedRef.current) {
        sse.close();
        setLog(l => [...l, "Connection to the inference server was lost."]);
        setInferenceError("Connection to the inference server was lost.");
      }
    };

    return () => {
      mountedRef.current = false;
      sse.close();
    };
  }, [sessionId, conf, iou, agnosticNms]);

  const pct = total ? Math.min((progress / total) * 100, 100) : 0;

  return (
    <Shell stepLabel="Step 02 — Processing" title="Executing YOLOv11 Inference" onToggleTheme={onToggleTheme}>
      {inferenceError ? (
        <div className="clay-card" style={{ maxWidth: 720, width: "100%", padding: 28, textAlign: "center" }}>
          <p style={{ ...mono, color: T.danger, marginBottom: 18 }}>{inferenceError}</p>
          <button className="clay-btn-secondary" onClick={onBack}>Back to setup</button>
        </div>
      ) : (
      <div style={{ maxWidth: 720, width: "100%" }}>
        {/* Progress Card */}
        <div className="clay-card" style={{ textAlign: "center", padding: "40px 36px 32px", marginBottom: 20 }}>
          <p style={{ ...mono, fontSize: 80, fontWeight: 700, color: T.accent, letterSpacing: "-0.04em", lineHeight: 1 }}>
            {progress}<span style={{ fontSize: 32, color: T.textMuted }}>/{total}</span>
          </p>
          <p style={{ ...mono, fontSize: 13, color: T.textMuted, marginTop: 8, marginBottom: 28, fontWeight: 500 }}>
            images processed via YOLOv11
          </p>
          <div className="clay-well" style={{ position: "relative", height: 12, overflow: "hidden", borderRadius: 10 }}>
            <div style={{
              height: "100%", width: `${pct}%`,
              background: `linear-gradient(90deg, ${T.accentLight}, ${T.accent})`,
              borderRadius: 10, transition: "width 0.22s ease",
              boxShadow: `0 0 16px ${T.accentGlow}`
            }} />
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.2) 50%, transparent 75%)",
              animation: done ? "none" : "shimmer 1.8s infinite"
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            <span style={{ ...mono, fontSize: 12, color: T.textMuted }}>{pct.toFixed(1)}% complete</span>
            <span style={{ ...mono, fontSize: 12, color: done ? T.success : T.accent, fontWeight: 600 }}>{done ? "✓ Complete" : `Inference running...`}</span>
          </div>
        </div>

        {/* Detection Log Card */}
        <div className="clay-card" style={{ padding: 20, marginBottom: 20 }}>
          <div onClick={() => setLogOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none", marginBottom: logOpen ? 12 : 0 }}>
            <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: "0.06em", textTransform: "uppercase" }}>📋 Live Inference Log</span>
            <span style={{ ...mono, fontSize: 13, color: T.textMuted, transition: "transform 0.2s", transform: logOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
          </div>
          {logOpen && (
            <div className="clay-well" style={{ padding: "12px 16px", maxHeight: 150, overflowY: "auto" }}>
              {log.map((line, i) => (
                <p key={i} style={{ ...mono, fontSize: 12, color: line.includes("✓") ? T.success : (line.includes("Error") ? T.danger : T.textSub), margin: "3px 0" }}>
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* 3 Stat Cards */}
        <div className="stat-cards-container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <StatCard label="Total Detections" value={totalDetections} />
          <StatCard label="Last Image" value={`${lastImageDets} det.`} />
          <StatCard label="Remaining" value={Math.max(0, total - progress)} />
        </div>
      </div>
      )}
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 3 — SUMMARY & ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
function Page3({ onViewImages, onRerun, onToggleTheme, sessionId, setAnalyticsData }) {
  const T = useT();
  const [classOpen, setClassOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    fetch(`${API_BASE_URL}/${sessionId}/analytics`)
      .then(r => {
        if (!r.ok) throw new Error(`Analytics request failed (${r.status})`);
        return r.json();
      })
      .then(d => { setData(d); setAnalyticsData(d); setLoadError(false); })
      .catch(() => setLoadError(true));
  }, [sessionId, retryCount]);

  if(loadError) return <Shell stepLabel="Step 03 — Review" title="Detection Summary & Analytics" onToggleTheme={onToggleTheme}>
    <div className="clay-card" style={{ padding: 28, textAlign: "center" }}>
      <p style={{ ...mono, color: T.danger, marginBottom: 18 }}>Could not load results</p>
      <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
        <button className="clay-btn-secondary" onClick={() => { setLoadError(false); setRetryCount(n => n + 1); }}>Retry</button>
        <button className="clay-btn-secondary" onClick={onRerun}>Back to setup</button>
      </div>
    </div>
  </Shell>;
  if(!data) return <Shell><p style={{ ...mono, padding: 40, color: T.textMuted }}>Loading analytics...</p></Shell>;

  const { summary, histogram, class_counts } = data;
  const maxCls = class_counts.length > 0 ? class_counts[0].count : 1;

  return (
    <Shell stepLabel="Step 03 — Review" title="Detection Summary & Analytics" onToggleTheme={onToggleTheme}>
      <div style={{ maxWidth: 1100, width: "100%" }}>
        <div className="stat-cards-container" style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
          <StatCard label="Images Processed" value={summary.total_images} sub="100% complete" />
          <StatCard label="Total Detections" value={summary.total_detections} sub="across all classes" />
          <StatCard label="Avg / Image" value={summary.avg_per_image} sub="detections" />
          <StatCard label="Mean Confidence" value={summary.mean_confidence} sub="YOLOv11 score" accent={T.success} />
        </div>

        <div className="responsive-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="clay-card" style={{ padding: 24 }}>
              <span style={lbl(T)}>Confidence Distribution Histogram</span>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 130, paddingTop: 16 }}>
                {histogram.map((d, i) => {
                  const mx = Math.max(...histogram.map(x => x.count), 1);
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <span style={{ ...mono, fontSize: 11, color: T.textMuted, fontWeight: 600 }}>{d.count}</span>
                      <div className="clay-well" style={{ width: "100%", height: `${(d.count / mx) * 90}px`, position: "relative", overflow: "hidden", borderRadius: "8px 8px 0 0" }}>
                        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${T.accentLight}, ${T.accent})`, opacity: 0.85 + i * 0.03 }} />
                      </div>
                      <span style={{ ...mono, fontSize: 10, color: T.textMuted }}>{d.range}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <div className="clay-card" style={{ padding: 20, position: "sticky", top: 90 }}>
              <span style={lbl(T)}>Actions</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button className="clay-btn-primary" style={{ width: "100%", padding: 14 }} onClick={onViewImages}>View All Images →</button>
                <button className="clay-btn-secondary" style={{ width: "100%", padding: 12 }} onClick={() => window.open(`${API_BASE_URL}/${sessionId}/export`, "_blank")}>⬇ Download ZIP Dataset</button>
                <button className="clay-btn-secondary" style={{ width: "100%", padding: 12 }} onClick={onRerun}>↺ Rerun Detection</button>
                <button className="clay-btn-secondary" style={{ width: "100%", padding: 12 }} onClick={() => setClassOpen(p => !p)}>
                  {classOpen ? "▲ Hide" : "▼ View"} Class Distribution
                </button>
              </div>
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.cardBorder}` }}>
                <span style={lbl(T)}>Top Detected Classes</span>
                {class_counts.slice(0, 5).map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: c.color || T.accent, flexShrink: 0 }} />
                    <span style={{ ...mono, fontSize: 11, color: T.textSub, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ ...mono, fontSize: 11, color: T.text, fontWeight: 700 }}>{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {classOpen && (
          <div className="clay-card page-enter" style={{ padding: 24, marginTop: 16 }}>
            <span style={lbl(T)}>Class Distribution — Sorted by Detection Count</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              {class_counts.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ ...mono, fontSize: 11, color: T.textMuted, minWidth: 20, textAlign: "right" }}>{i + 1}</span>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: c.color || T.accent, flexShrink: 0 }} />
                  <span style={{ ...mono, fontSize: 12, color: T.text, minWidth: 220, fontWeight: 500 }}>{c.name}</span>
                  <div className="clay-well" style={{ flex: 1, height: 10, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(c.count / maxCls) * 100}%`, background: c.color || T.accent, borderRadius: 5 }} />
                  </div>
                  <span style={{ ...mono, fontSize: 12, color: T.textMuted, minWidth: 44, textAlign: "right", fontWeight: 700 }}>{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 4 — INFERENCED IMAGE VIEWER & DATASET BROWSER
// ─────────────────────────────────────────────────────────────────────────────
function Page4({ onBack, onToggleTheme, sessionId, analyticsData }) {
  const T = useT();
  const [sort, setSort] = useState("high");
  const [images, setImages] = useState([]);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  const [scale, setScale] = useState(1);
  const [imgDims, setImgDims] = useState({});

  const [visibleCount, setVisibleCount] = useState(12);
  const sentinelRef = useRef(null);

  const [filterOpen, setFilterOpen] = useState(false);
  const [classSearch, setClassSearch] = useState("");
  const filterBtnRef = useRef(null);
  const dropdownRef = useRef(null);

  const classColors = {};
  if (analyticsData && analyticsData.class_counts) {
    analyticsData.class_counts.forEach(c => { classColors[c.name] = c.color; });
  }

  const filtered = images.filter(img =>
    selectedClasses.length === 0 ||
    selectedClasses.some(c => (img.classes || []).includes(c))
  );

  const sorted = [...filtered].sort((a, b) =>
    sort === "high" ? b.detections - a.detections :
    sort === "low"  ? a.detections - b.detections : a.id - b.id
  );

  const activeModalImg = selectedIndex !== null ? sorted[selectedIndex] : null;

  useEffect(() => {
    fetch(`${API_BASE_URL}/${sessionId}/images`)
      .then(r => r.json())
      .then(d => setImages(d))
      .catch(console.error);
  }, [sessionId]);

  useEffect(() => {
    if (images.length === 0) return;
    let cancelled = false;
    const CONCURRENT = 6;
    const queue = images.map((_, i) => i);
    let queueIdx = 0;

    const loadNext = () => {
      if (cancelled || queueIdx >= queue.length) return;
      const currentIdx = queueIdx++;
      const img = images[queue[currentIdx]];
      const loader = new window.Image();
      loader.onload = () => {
        if (!cancelled) {
          setImgDims(prev => {
            if (prev[img.id]) return prev;
            return { ...prev, [img.id]: { w: loader.naturalWidth, h: loader.naturalHeight } };
          });
        }
        loadNext();
      };
      loader.onerror = () => loadNext();
      loader.src = `${API_BASE_URL}/${sessionId}/preview/${img.name}`;
    };

    for (let i = 0; i < Math.min(CONCURRENT, images.length); i++) {
      loadNext();
    }
    return () => { cancelled = true; };
  }, [images.length]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const nearby = [-2, -1, 0, 1, 2, 3];
    nearby.forEach(offset => {
      const i = selectedIndex + offset;
      if (i < 0 || i >= sorted.length) return;
      const img = sorted[i];
      if (!img || imgDims[img.id]) return;
      const loader = new window.Image();
      loader.onload = () => {
        setImgDims(prev => ({ ...prev, [img.id]: { w: loader.naturalWidth, h: loader.naturalHeight } }));
      };
      loader.src = `${API_BASE_URL}/${sessionId}/preview/${img.name}`;
    });
  }, [selectedIndex]);

  useEffect(() => { setVisibleCount(12); }, [sorted.length, sort, selectedClasses.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisibleCount(p => Math.min(p + 12, sorted.length)); },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [sorted.length, visibleCount]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setSelectedIndex(null);
        setScale(1);
        return;
      }
      if (e.key === "ArrowLeft") {
        setSelectedIndex(p => p <= 0 ? sorted.length - 1 : p - 1);
        setScale(1);
      }
      if (e.key === "ArrowRight") {
        setSelectedIndex(p => p >= sorted.length - 1 ? 0 : p + 1);
        setScale(1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedIndex, sorted.length]);

  if(images.length === 0) return <Shell><p style={{ ...mono, padding: 40, color: T.textMuted }}>Loading dataset...</p></Shell>;

  const visibleImages = sorted.slice(0, visibleCount);

  const toggleClass = (cName) => {
    setSelectedClasses(prev => prev.includes(cName) ? prev.filter(x => x !== cName) : [...prev, cName]);
  };

  const activeClassCounts = activeModalImg ? (activeModalImg.bboxes || []).reduce((acc, b) => {
    const name = b.class_name || "Unknown";
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {}) : {};

  return (
    <>
      <Shell onToggleTheme={onToggleTheme}>
        <div style={{ maxWidth: 1100, width: "100%" }}>

          {/* Clay Controls Bar */}
          <div className="clay-card" style={{ padding: "14px 20px", display: "flex", gap: 12, marginBottom: 24, alignItems: "center", flexWrap: "wrap" }}>
            <button className="clay-btn-secondary" onClick={onBack} style={{ padding: "8px 16px" }}>← Back to Summary</button>
            <span style={{ ...mono, fontSize: 11, color: T.textMuted, fontWeight: 700, marginLeft: 4 }}>SORT:</span>
            {[["high", "Density ↓"], ["low", "Density ↑"], ["orig", "Original"]].map(([v, l]) => (
              <button key={v} className="clay-btn-secondary" onClick={() => setSort(v)} style={{
                padding: "6px 14px", fontSize: 12,
                background: sort === v ? T.accent : T.clayBg,
                color: sort === v ? "#FFFFFF" : T.textSub,
                borderColor: sort === v ? T.accent : T.cardBorder
              }}>{l}</button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
              <button ref={filterBtnRef} className="clay-btn-secondary"
                onClick={() => setFilterOpen(f => !f)}
                style={{
                  padding: "8px 16px", fontSize: 12, display: "flex", alignItems: "center", gap: 6,
                  background: selectedClasses.length > 0 ? T.accentBg : T.clayBg,
                  borderColor: selectedClasses.length > 0 ? T.accent : T.cardBorder,
                  color: selectedClasses.length > 0 ? T.accent : T.textSub
                }}
              >
                <span>⧩ Filter ({selectedClasses.length})</span>
              </button>
              <span style={{ ...mono, fontSize: 12, color: T.textMuted, fontWeight: 600 }}>{sorted.length} images</span>
            </div>
          </div>

          {/* Filter Dropdown */}
          {analyticsData && analyticsData.class_counts && filterOpen && (
            <div ref={dropdownRef} className="clay-card page-enter" style={{
              position: "absolute", zIndex: 1000, right: 40, top: 180, width: 320, maxHeight: 380,
              display: "flex", flexDirection: "column", overflow: "hidden", padding: 0
            }}>
              <input autoFocus placeholder="🔍 Search classes..." value={classSearch} onChange={e => setClassSearch(e.target.value)}
                style={{ width: "100%", padding: "14px", background: T.wellBg, border: "none", color: T.text, fontSize: 13, outline: "none", ...mono }}
              />
              <div style={{ overflowY: "auto", flex: 1, padding: "8px" }}>
                {analyticsData.class_counts
                  .filter(c => c.name.toLowerCase().includes(classSearch.toLowerCase()))
                  .map(c => {
                    const active = selectedClasses.includes(c.name);
                    return (
                      <div key={c.name} onClick={() => toggleClass(c.name)} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer",
                        borderRadius: 8, background: active ? T.accentBg : "transparent"
                      }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: 4, border: `2px solid ${active ? T.accent : T.textMuted}`,
                          background: active ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                          {active && <span style={{ color: "#fff", fontSize: 10 }}>✓</span>}
                        </div>
                        <span style={{ ...mono, fontSize: 12, color: T.text, flex: 1 }}>{c.name}</span>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Clay Image Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
            {visibleImages.map((img) => (
              <div key={img.id} className="clay-card clay-card-interactive" onClick={() => setSelectedIndex(sorted.indexOf(img))}
                style={{ padding: 10, cursor: "pointer", overflow: "hidden" }}>
                <div style={{ aspectRatio: "4/3", background: T.wellBg, borderRadius: 12, position: "relative", overflow: "hidden" }}>
                  <img
                    src={`${API_BASE_URL}/${sessionId}/preview/${img.name}`}
                    onLoad={(e) => setImgDims(prev => ({ ...prev, [img.id]: { w: e.target.naturalWidth, h: e.target.naturalHeight } }))}
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  />
                  {imgDims[img.id] && (
                    <svg viewBox={`0 0 ${imgDims[img.id].w} ${imgDims[img.id].h}`} preserveAspectRatio="xMidYMid meet" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                      {img.bboxes && img.bboxes.map((b, j) => {
                        const [x1, y1, x2, y2] = b.bbox;
                        const color = classColors[b.class_name] || T.accent;
                        const fZ = Math.max(8, imgDims[img.id].h * 0.012);
                        const label = `${b.class_name} ${b.confidence.toFixed(2)}`;
                        return (
                          <g key={j}>
                            <rect x={x1} y={y1} width={x2-x1} height={y2-y1} fill="none" stroke={color} strokeWidth={2} />
                            <rect x={x1} y={y1 - fZ - 3} width={(label.length * fZ * 0.6) + 4} height={fZ + 3} fill={color} opacity="0.9" />
                            <text x={x1 + 2} y={y1 - 3} fill="#FFFFFF" fontSize={fZ} fontFamily="'JetBrains Mono', monospace" fontWeight="600">{label}</text>
                          </g>
                        );
                      })}
                    </svg>
                  )}
                  <div style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.7)", ...mono, color: "#fff", fontSize: 10, padding: "2px 8px", borderRadius: 6 }}>
                    {img.detections} det
                  </div>
                </div>
                <div style={{ padding: "8px 4px 2px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ ...mono, fontSize: 11, color: T.textSub, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.name}</span>
                  <span style={{ ...mono, fontSize: 11, color: img.avgConf > 0.8 ? T.success : T.warning, fontWeight: 700 }}>{(img.avgConf * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>

          {visibleCount < sorted.length && <div ref={sentinelRef} style={{ height: 1 }} />}
        </div>
      </Shell>

      {/* FULLSCREEN INFERENCED IMAGE VIEWER MODAL */}
      {activeModalImg && ReactDOM.createPortal(
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,0.96)", backdropFilter: "blur(12px)", zIndex: 99999, display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${T.cardBorder}`, background: T.clayBg }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button className="clay-btn-secondary" onClick={() => { setSelectedIndex(null); setScale(1); }} style={{ padding: "6px 14px", fontSize: 12 }}>✕ Close</button>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="clay-btn-secondary" onClick={() => { setSelectedIndex(p => p <= 0 ? sorted.length - 1 : p - 1); setScale(1); }} style={{ padding: "4px 10px", fontSize: 13 }} title="Previous Image (←)">◀</button>
                <button className="clay-btn-secondary" onClick={() => { setSelectedIndex(p => p >= sorted.length - 1 ? 0 : p + 1); setScale(1); }} style={{ padding: "4px 10px", fontSize: 13 }} title="Next Image (→)">▶</button>
              </div>
              <span style={{ ...mono, fontSize: 14, color: "#fff", fontWeight: 700 }}>{activeModalImg.name}</span>
              <span style={{ ...mono, fontSize: 12, color: T.textMuted }}>{selectedIndex + 1} / {sorted.length}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="clay-btn-secondary" onClick={() => setShowLabels(!showLabels)} style={{ padding: "6px 14px", fontSize: 12 }}>
                {showLabels ? "Hide Bboxes" : "Show Bboxes"}
              </button>
              <button className="clay-btn-secondary" onClick={() => setScale(s => Math.max(0.5, s - 0.25))} style={{ padding: "4px 10px", fontSize: 16 }}>-</button>
              <span style={{ ...mono, fontSize: 12, color: T.textMuted }}>{Math.round(scale * 100)}%</span>
              <button className="clay-btn-secondary" onClick={() => setScale(s => Math.min(4, s + 0.25))} style={{ padding: "4px 10px", fontSize: 14 }}>+</button>
            </div>
          </div>

          {/* Canvas & Detections Sidebar */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* Canvas */}
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, transform: `scale(${scale})`, transformOrigin: "center center", transition: "transform 0.2s ease-out" }}>
                <img
                  src={`${API_BASE_URL}/${sessionId}/preview/${activeModalImg.name}`}
                  onLoad={(e) => {
                    if (!imgDims[activeModalImg.id]) {
                      setImgDims(prev => ({ ...prev, [activeModalImg.id]: { w: e.target.naturalWidth, h: e.target.naturalHeight } }));
                    }
                  }}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
                />

                {showLabels && imgDims[activeModalImg.id] && (
                  <svg
                    viewBox={`0 0 ${imgDims[activeModalImg.id].w} ${imgDims[activeModalImg.id].h}`} preserveAspectRatio="xMidYMid meet"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                    {(activeModalImg.bboxes || []).map((b, i) => {
                      const [x1, y1, x2, y2] = b.bbox;
                      const color = classColors[b.class_name] || T.accent;
                      const fZ = Math.max(10, imgDims[activeModalImg.id].h * 0.014);
                      const label = `${b.class_name} ${b.confidence.toFixed(2)}`;

                      return (
                        <g key={i}>
                          <rect x={x1} y={y1} width={x2-x1} height={y2-y1} fill="none" stroke={color} strokeWidth={2} />
                          <rect x={x1} y={Math.max(0, y1 - fZ - 4)} width={(label.length * fZ * 0.6) + 6} height={fZ + 4} fill={color} opacity="0.9" />
                          <text x={x1 + 3} y={Math.max(fZ, y1 - 3)} fill="#FFFFFF" fontSize={fZ} fontFamily="'JetBrains Mono', monospace" fontWeight="600">{label}</text>
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>
            </div>

            {/* Right Side Detections Summary Panel */}
            <div style={{ width: 300, background: T.clayBg, borderLeft: `1px solid ${T.cardBorder}`, display: "flex", flexDirection: "column", zIndex: 30 }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.cardBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: "#fff" }}>Detected Objects</span>
                <span style={{ background: T.accentBg, color: T.accent, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, ...mono }}>
                  {activeModalImg.detections} total
                </span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
                {Object.keys(activeClassCounts).length === 0 ? (
                  <p style={{ ...mono, fontSize: 12, color: T.textMuted, textAlign: "center", padding: 20 }}>No detections in this image</p>
                ) : (
                  Object.entries(activeClassCounts).map(([name, count]) => {
                    const color = classColors[name] || T.accent;
                    return (
                      <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: T.wellBg, borderRadius: 10, marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                          <span style={{ ...mono, fontSize: 12, color: T.text }}>{name}</span>
                        </div>
                        <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: T.accent }}>{count}</span>
                      </div>
                    );
                  })
                )}
              </div>
              <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.cardBorder}`, background: T.wellBg }}>
                <div style={{ display: "flex", justifyContent: "space-between", ...mono, fontSize: 11, color: T.textMuted }}>
                  <span>Avg Confidence:</span>
                  <span style={{ color: activeModalImg.avgConf > 0.8 ? T.success : T.warning, fontWeight: 700 }}>
                    {(activeModalImg.avgConf * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  APP ROOT
// ─────────────────────────────────────────────────────────────────────────────
function App() {
  const [page,       setPage]     = useState(1);
  const [isDark,     setDark]     = useState(false);
  const [sessionId,  setSessionId]= useState(null);
  const [conf,       setConf]     = useState(0.25);
  const [iou,        setIou]      = useState(0.45);
  const [agnosticNms, setAgnosticNms] = useState(true);
  const [advData,    setAdvData]  = useState(null);

  const theme = isDark ? DARK : LIGHT;

  useEffect(() => { injectFonts(); }, []);

  return (
    <PageCtx.Provider value={page}>
      <ThemeCtx.Provider value={theme}>
        {page === 1 && <Page1 onNext={() => setPage(2)} onToggleTheme={() => setDark(d => !d)} setSessionArgs={(id, c, i, nms) => { setSessionId(id); setConf(c); setIou(i); setAgnosticNms(nms); }} />}
        {page === 2 && <Page2 onNext={() => setPage(3)} onBack={() => setPage(1)} onToggleTheme={() => setDark(d => !d)} sessionId={sessionId} conf={conf} iou={iou} agnosticNms={agnosticNms} />}
        {page === 3 && <Page3 onViewImages={() => setPage(4)} onRerun={() => setPage(1)} onToggleTheme={() => setDark(d => !d)} sessionId={sessionId} setAnalyticsData={setAdvData} />}
        {page === 4 && <Page4 onBack={() => setPage(3)} onToggleTheme={() => setDark(d => !d)} sessionId={sessionId} analyticsData={advData} />}
      </ThemeCtx.Provider>
    </PageCtx.Provider>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return <div style={{ padding: 40, color: '#EF4444', fontFamily: 'monospace' }}>
        <h2>React Application Error:</h2>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.toString()}</pre>
        <pre style={{ whiteSpace: 'pre-wrap', marginTop: 20, color: '#64748B' }}>{this.state.error.stack}</pre>
      </div>;
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><App /></ErrorBoundary>);
