const { useState, useEffect, useRef, createContext, useContext } = React;

// ─────────────────────────────────────────────────────────────────────────────
//  FIELDASSIST CLAYMORPHISM THEME SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
const DARK = {
  mode:"dark", bg:"var(--bg)", clayBg:"var(--surface)", wellBg:"var(--surface-2)", cardBorder:"var(--border)",
  shadowDark:"rgba(0,0,0,0)", shadowLight:"rgba(0,0,0,0)", highlight:"transparent", navBg:"var(--surface)", navBorder:"var(--border)",
  text:"var(--text)", textSub:"var(--text-2)", textMuted:"var(--text-3)", accent:"var(--primary)", accentDark:"var(--primary-hover)",
  accentLight:"var(--primary)", accentGlow:"rgba(92,146,240,.24)", accentBg:"var(--primary-soft)", accentBorder:"var(--border-strong)",
  secondary:"var(--primary)", success:"var(--success)", warning:"var(--warn)", danger:"var(--danger)", toggleBg:"var(--primary-soft)", toggleText:"var(--primary)"
};

const LIGHT = {
  mode:"light", bg:"var(--bg)", clayBg:"var(--surface)", wellBg:"var(--surface-2)", cardBorder:"var(--border)",
  shadowDark:"rgba(14,26,51,.05)", shadowLight:"transparent", highlight:"transparent", navBg:"var(--surface)", navBorder:"var(--border)",
  text:"var(--text)", textSub:"var(--text-2)", textMuted:"var(--text-3)", accent:"var(--primary)", accentDark:"var(--primary-hover)",
  accentLight:"var(--primary)", accentGlow:"rgba(43,104,206,.22)", accentBg:"var(--primary-soft)", accentBorder:"var(--border-strong)",
  secondary:"var(--primary)", success:"var(--success)", warning:"var(--warn)", danger:"var(--danger)", toggleBg:"var(--primary-soft)", toggleText:"var(--primary)"
};
const ThemeCtx = createContext(LIGHT);
const useT = () => useContext(ThemeCtx);
const PageCtx = createContext(1);

const API_BASE_URL = window.NOESIS_API_URL || "http://localhost:8080/api/sessions";
const API_ROOT = API_BASE_URL.replace(/\/api\/sessions\/?$/, "");

function injectFonts() {
  if (document.getElementById("sku-fonts") || document.querySelector('link[href*="Plus+Jakarta+Sans"]')) return;
  const l = document.createElement("link");
  l.id = "sku-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap";
  document.head.appendChild(l);
}

const buildCSS = (T) => `
  *,*::before,*::after { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.accentBorder}; border-radius: 4px; }
  
  /* Neosis card surfaces and interaction styles are defined in IR_DESIGN_CSS. */
  
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
  :root { --bg:#F3F5FA;--surface:#fff;--surface-2:#F7F9FD;--surface-3:#EDF1F9;--border:#E1E6F0;--border-strong:#C9D2E4;--text:#0E1A33;--text-2:#445272;--text-3:#5D6A86;--primary:#2B68CE;--primary-hover:#2159B8;--primary-soft:#E8F0FD;--on-primary:#fff;--success:#12805C;--success-soft:#E3F5EE;--warn:#B45309;--warn-soft:#FEF1DD;--danger:#C62828;--danger-soft:#FDE9E9;--shadow:0 1px 2px rgba(14,26,51,.05),0 6px 18px rgba(14,26,51,.05);--focus:0 0 0 3px rgba(43,104,206,.35); }
  :root[data-theme="dark"] { --bg:#0A1120;--surface:#111B30;--surface-2:#15213A;--surface-3:#1B2A48;--border:#22314F;--border-strong:#33466F;--text:#EDF2FC;--text-2:#BAC6DD;--text-3:#8D9BB8;--primary:#5C92F0;--primary-hover:#7BA6F4;--primary-soft:#172B52;--on-primary:#06122B;--success:#4CD6A0;--success-soft:#0F3329;--warn:#F5B454;--warn-soft:#3A2A10;--danger:#FF8A8A;--danger-soft:#3A1818;--shadow:none;--focus:0 0 0 3px rgba(92,146,240,.45); }
  :root { --warn-bar:#E9A23B; }
  :root[data-theme="dark"] { --warn-bar:#F0A63A; }
  :root { --violet:#7C6FC1;--pink:#FE9AC3; }
  html,body,#root { min-height:100%; background:var(--bg); }
  body,button,input,select { font-family:'Plus Jakarta Sans',system-ui,sans-serif !important; }
  body { color:var(--text);font-size:14px;font-variant-numeric:tabular-nums; }
  .neosis-shell { min-height:100vh;background:var(--bg);color:var(--text);padding-bottom:0 !important; }
  .neosis-topbar { position:sticky;top:0;z-index:300;height:64px;padding:0 max(16px,calc((100vw - 1616px)/2));display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--border); }
  .neosis-brand { display:flex;align-items:center;gap:14px;min-width:0; }
  .brand-logo { display:block;width:162px;height:auto;max-height:26px;object-fit:contain;object-position:left center; }
  .brand-divider { width:1px;height:28px;background:var(--border-strong); }
  .brand-title { display:flex;flex-direction:column;line-height:1.15;color:var(--text); }
  .brand-title b { font-size:16px;letter-spacing:.09em;font-weight:800; }
  .brand-title small { font-size:12px;color:var(--text-3); }
  .neosis-steps { list-style:none;display:flex;align-items:center;gap:8px;margin:0;padding:0; }
  .neosis-steps li { display:flex;align-items:center;gap:8px;padding:6px 12px 6px 8px;border-radius:999px;color:var(--text-3);font-size:13px;font-weight:600; }
  .neosis-steps li > span { display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--surface-3);color:var(--text-3);font-size:12px;font-weight:700; }
  .neosis-steps li.current { background:var(--primary-soft);color:var(--primary); }
  .neosis-steps li.current > span { color:var(--on-primary);background:var(--primary); }
  .neosis-steps li.done { color:var(--text-2); }
  .neosis-steps li.done > span { color:var(--success);background:var(--success-soft); }
  .neosis-steps li+li::before { content:"";width:20px;height:2px;background:var(--border);display:block; }
  .neosis-steps li.done+li::before { background:var(--success); }
  .step-mobile { display:none; }
  .theme-toggle { justify-self:end;width:40px;height:40px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text-2);font-size:20px;cursor:pointer;display:grid;place-items:center; }
  .neosis-page-head,.neosis-content { width:100%;max-width:1680px;margin:0 auto;padding-left:32px;padding-right:32px; }
  .neosis-page-head { padding-top:26px; }
  .neosis-page-head h1 { color:var(--text);font:800 28px/1.2 'Plus Jakarta Sans',sans-serif;letter-spacing:-.015em; }
  .neosis-content { padding-top:18px;padding-bottom:32px; }
  .neosis-content > div { width:100% !important;max-width:1680px !important; }
  .clay-card { background:var(--surface) !important;border:1px solid var(--border) !important;border-radius:14px !important;box-shadow:var(--shadow) !important;color:var(--text); }
  .clay-card-interactive:hover { transform:translateY(-2px) !important;border-color:var(--primary) !important;box-shadow:var(--shadow) !important; }
  .clay-well { background:var(--surface-2) !important;border:1px solid var(--border) !important;border-radius:10px !important;box-shadow:none !important; }
  .clay-btn-primary,.clay-btn-secondary { font-family:'Plus Jakarta Sans',sans-serif !important;border-radius:10px !important;box-shadow:none !important;letter-spacing:0 !important; }
  .clay-btn-primary { background:var(--primary) !important;color:var(--on-primary) !important;border:1px solid var(--primary) !important; }
  .clay-btn-primary:hover { background:var(--primary-hover) !important;transform:translateY(-1px); }
  .clay-btn-secondary { background:var(--surface) !important;color:var(--text-2) !important;border:1px solid var(--border-strong) !important; }
  .clay-btn-secondary:hover { background:var(--surface-3) !important;transform:none !important; }
  .page-enter { animation:none !important; }
  :focus-visible { outline:none !important;box-shadow:var(--focus) !important; }
  .num,[data-number] { font-variant-numeric:tabular-nums; }
  .setup-layout { display:flex;flex-direction:column;gap:20px; }
  .upload-zone { padding:18px;border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:var(--shadow);min-width:0; }
  .upload-heading { display:flex;align-items:flex-start;gap:12px;justify-content:space-between;margin-bottom:14px; }
  .upload-heading h3 { color:var(--text);font:700 15px/1.3 'Plus Jakarta Sans',sans-serif;margin:0; }
  .upload-heading p { color:var(--text-3);font:500 12.5px/1.45 'Plus Jakarta Sans',sans-serif;margin:4px 0 0; }
  .upload-badge { flex:none;border-radius:999px;background:var(--primary-soft);color:var(--primary);font-size:11px;font-weight:700;padding:4px 9px; }
  .upload-badge.optional { background:var(--surface-3);color:var(--text-3); }
  .upload-drop { min-height:146px;padding:16px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;cursor:pointer;transition:background .15s,border-color .15s; }
  .upload-drop:hover,.upload-drop.dragging { border-color:var(--primary);background:var(--primary-soft); }
  .upload-drop.filled { align-items:flex-start;text-align:left;background:var(--success-soft);border-color:color-mix(in srgb,var(--success) 38%,var(--border)); }
  .upload-drop input[type=file] { display:none; }
  .upload-icon { width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--surface);border:1px solid var(--border);color:var(--primary);font-size:18px;font-weight:700; }
  .upload-drop.filled .upload-icon { background:var(--success);border:0;color:#fff; }
  .upload-instruction { color:var(--text-2);font-size:13px; }
  .upload-filename { color:var(--text);font-size:14px;max-width:100%;overflow-wrap:anywhere; }
  .upload-meta { color:var(--text-2);font-size:12px; }
  .upload-meta.skipped { color:var(--text-3); }
  .upload-error { color:var(--danger);font-size:12px;font-weight:600; }
  .choose-file,.replace-file { border:1px solid var(--border-strong);border-radius:8px;padding:6px 11px;background:var(--surface);color:var(--text-2);font:600 12px 'Plus Jakarta Sans',sans-serif;cursor:pointer; }
  .replace-file { align-self:flex-end;margin-top:4px;color:var(--primary); }
  .settings-heading { display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px; }
  .settings-heading h2 { margin:0;font-size:16px; }
  .engine-chip { border-radius:999px;background:var(--surface-3);color:var(--text-2);font-size:12px;font-weight:600;padding:6px 10px; }
  .setting-cell { min-width:0; }
  .setting-help { color:var(--text-3);font-size:12px;line-height:1.5;margin:10px 0 0; }
  .readiness-chips { display:flex;gap:8px;flex-wrap:wrap; }
  .readiness-chips span { padding:7px 10px;border-radius:999px;background:var(--surface-3);color:var(--text-3);font-size:12px;font-weight:600; }
  .readiness-chips .ready { background:var(--success-soft);color:var(--success); }
  .readiness-chips .missing { background:var(--warn-soft);color:var(--warn); }
  .setup-action .action-right { display:flex;align-items:center;gap:12px;color:var(--text-3);font-size:12px; }
  .setup-action small { position:absolute;right:34px;bottom:-18px;font-size:11px;color:var(--text-3); }
  .upload-error-banner { border:1px solid color-mix(in srgb,var(--danger) 35%,var(--border));border-radius:12px;background:var(--danger-soft);padding:14px 16px;color:var(--text-2);display:flex;flex-direction:column;gap:4px; }
  .upload-error-banner strong { color:var(--danger); }
  .neosis-page-head { display:flex;align-items:flex-end;justify-content:space-between;gap:20px; }
  .neosis-page-head p { color:var(--text-2);font-size:14.5px;line-height:1.5;max-width:70ch;margin-top:4px; }
  .page-actions { display:flex;align-items:center;gap:10px; }
  .field-value { color:var(--primary);font-size:20px;font-weight:800;font-variant-numeric:tabular-nums; }
  .range-caption { color:var(--text-3);font-size:11px; }
  .switch-control { width:46px!important;height:26px!important;border-radius:999px!important;background:var(--border-strong)!important;box-shadow:none!important;flex:none; }
  .switch-control.is-on { background:var(--primary)!important; }
  .switch-control:focus-visible { box-shadow:var(--focus)!important; }
  .infer-layout { display:grid!important;max-width:none!important;width:100%!important;grid-template-columns:minmax(0,7fr) minmax(0,5fr);grid-template-rows:minmax(340px,1fr) auto;gap:18px;min-height:calc(100vh - 330px); }
  .infer-layout .progress-card { grid-column:1;grid-row:1;margin:0!important;display:flex;flex-direction:column;justify-content:center; }
  .infer-layout .activity-card { grid-column:2;grid-row:1 / span 2;margin:0!important;display:flex;flex-direction:column;min-height:100%; }
  .activity-card .activity-log { max-height:none!important;flex:1;min-height:300px;overflow:auto!important;font:400 12.5px/1.75 'JetBrains Mono',monospace!important; }
  .activity-card .activity-log p { font:400 12.5px/1.75 'JetBrains Mono',monospace!important; }
  .activity-log .log-line { color:var(--text-3)!important; }
  .activity-log .log-live { color:var(--primary)!important; }
  .activity-log .log-success { color:var(--success)!important; }
  .activity-log .log-error { color:var(--danger)!important; }
  .activity-card > div:first-child { pointer-events:none; }
  .activity-card > div:first-child > span:last-child { display:none; }
  .infer-layout > .stat-cards-container { grid-column:1;grid-row:2;align-self:start; }
  .inference-count { display:flex;align-items:baseline;gap:12px;width:100%; }
  .infer-layout .inference-count > p { font:800 64px/1 'Plus Jakarta Sans',sans-serif!important;color:var(--primary)!important;font-variant-numeric:tabular-nums; }
  .progress-percent { margin-left:auto;font-size:28px;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums; }
  .infer-layout .progress-card > p:nth-of-type(2) { font:500 14px 'Plus Jakarta Sans',sans-serif!important;color:var(--text-2)!important; }
  .progress-card .progress-track > div:last-child { display:none; }
  .stat-cards-container .clay-card { min-width:0!important; }
  .stat-card { display:flex;align-items:center;gap:14px; }
  .stat-icon { width:46px;height:46px;flex:none;border-radius:12px;background:var(--primary-soft);color:var(--primary);display:grid;place-items:center;font-size:21px; }
  .stat-icon.success { background:var(--success-soft);color:var(--success); }
  .stat-label { font-size:12px;font-weight:600;color:var(--text-2); }
  .stat-value { font-size:28px;font-weight:800;letter-spacing:-.02em;line-height:1.15;font-variant-numeric:tabular-nums;margin:3px 0 0; }
  .stat-sub { color:var(--text-3);font-size:12px;margin-top:2px; }
  .stat-cards-container p { font-variant-numeric:tabular-nums; }
  .stat-cards-container span { font-family:'Plus Jakarta Sans',sans-serif!important;font-size:13px!important;letter-spacing:normal!important;text-transform:none!important; }
  .neosis-content > div[style*="max-width: 1100"] { max-width:1680px!important; }
  .neosis-content .responsive-grid { display:grid!important;grid-template-columns:minmax(0,7fr) minmax(0,5fr)!important;gap:20px!important; }
  .neosis-content .stat-cards-container[style*="display: flex"] { display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr)); }
  .neosis-content .stat-cards-container .clay-card { padding:18px 20px!important; }
  .browser-grid { grid-template-columns:repeat(auto-fill,minmax(250px,1fr))!important;gap:18px!important; }
  .browser-grid img { object-fit:cover!important; }
  .browser-grid > div > div:first-child > div:last-child { left:6px!important;right:auto!important;border-radius:999px!important; }
  .phase-tracker { display:flex;align-items:center;justify-content:center;gap:10px;margin:0 auto 32px;color:var(--text-3);font-size:12px;font-weight:600; }
  .phase-tracker i { width:24px;height:1px;background:var(--border-strong); }
  .phase-tracker span { padding:6px 9px;border-radius:999px;background:var(--surface-3); }
  .phase-tracker .phase-done { color:var(--success);background:var(--success-soft); }
  .phase-tracker .phase-now { color:var(--primary);background:var(--primary-soft); }
  .loading-copy { margin:-8px 0 24px; }
  .loading-copy h2 { color:var(--text);font-size:18px;margin-bottom:4px; }
  .loading-copy p { color:var(--text-2);font-size:13px;max-width:58ch;margin:auto; }
  .progress-track.indeterminate > div:first-child { width:34%!important;background:var(--primary)!important;animation:indeterminate-slide 1.4s ease-in-out infinite; }
  @keyframes indeterminate-slide { 0%{margin-left:-34%}100%{margin-left:100%} }
  .browser-toolbar { position:sticky;top:72px;z-index:10;display:flex;align-items:center;gap:10px;padding:12px!important; }
  .toolbar-label,.image-count { color:var(--text-2);font-size:12px;font-weight:600;white-space:nowrap; }
  .sort-segment { display:flex;border:1px solid var(--border);border-radius:10px;overflow:hidden; }
  .sort-segment button { border:0;border-right:1px solid var(--border);background:var(--surface);color:var(--text-2);padding:8px 10px;font-size:12px;font-weight:600;white-space:nowrap; }
  .sort-segment button:last-child { border-right:0; }
  .sort-segment button[aria-pressed="true"] { background:var(--primary-soft);color:var(--primary); }
  .quick-filters { display:flex;gap:6px;flex-wrap:wrap; }
  .filter-chip { border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-2);padding:7px 10px;font-size:12px;font-weight:600;white-space:nowrap; }
  .filter-chip[aria-pressed="true"] { border-color:var(--primary);background:var(--primary-soft);color:var(--primary); }
  .toolbar-spacer { flex:1; }
  .review-list { display:flex;flex-direction:column;gap:12px;margin-top:16px; }
  .review-row { display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2); }
  .review-row > strong { min-width:54px;color:var(--primary);font-size:24px;font-variant-numeric:tabular-nums; }
  .review-row > div { flex:1;min-width:0; }
  .review-row b { display:block;color:var(--text);font-size:13px; }
  .review-row span { display:block;color:var(--text-2);font-size:11.5px;line-height:1.4;margin-top:2px; }
  .review-row button { flex:none; }
  .class-dist-head { display:flex;align-items:center;justify-content:space-between;gap:16px; }
  .class-dist-head h2 { font-size:16px;margin:0; }
  .class-dist-head span { color:var(--text-3);font-size:12px; }
  .class-dist-head input { width:240px;max-width:45%;height:38px;padding:0 12px;border:1px solid var(--border-strong);border-radius:10px;background:var(--surface);color:var(--text); }
  .class-rows > div { min-width:0; }
  .show-all-classes { display:flex;justify-content:center;margin-top:14px; }
  .empty-browser { text-align:center;padding:48px 24px;margin:40px auto;max-width:600px; }
  .empty-browser p { color:var(--text-2);margin:6px 0 18px; }
  .class-popover { position:absolute!important;right:32px!important;top:124px!important;width:320px!important;max-height:420px!important;z-index:30;display:flex;flex-direction:column;overflow:hidden;padding:0!important; }
  .class-popover-actions { display:flex;align-items:center;justify-content:space-between;padding:10px;border-top:1px solid var(--border); }
  .link-button { border:0;background:transparent;color:var(--primary);font-weight:600;cursor:pointer;padding:8px; }
  .viewer-overlay { background:#080D19!important;backdrop-filter:none!important;color:#EDF2FC; }
  .viewer-header { height:60px;flex:none;padding:8px 20px!important;background:#080D19!important;border-bottom:1px solid #22314F!important; }
  .viewer-header > div:first-child > span:nth-last-child(-n+2) { color:#EDF2FC!important; }
  .viewer-controls { position:fixed;z-index:100000;left:50%;bottom:20px;transform:translateX(-50%);padding:8px 12px;border:1px solid #33466F;border-radius:999px;background:#111B30; }
  .viewer-controls input[type=range] { width:150px;accent-color:#5C92F0; }
  .viewer-content > div:first-child { min-width:0;overflow:auto!important;align-items:flex-start!important;justify-content:flex-start!important;padding-bottom:70px; }
  .viewer-image-stage { position:relative!important;inset:auto!important;transform:none!important;transition:none!important;width:var(--viewer-zoom);height:var(--viewer-zoom);flex:none; }
  .viewer-sidebar { width:330px!important;flex:none;background:#111B30!important;border-left:1px solid #22314F!important;padding:20px; }
  .viewer-sidebar h3,.viewer-sidebar p,.viewer-sidebar span { color:#EDF2FC; }
  .viewer-sidebar .clay-card { background:#15213A!important; }
  @media(max-width:980px) { .viewer-sidebar { display:none!important; }.neosis-page-head { align-items:flex-start; }.page-actions { flex-wrap:wrap;justify-content:flex-end; } }
  .setup-uploads { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px; }
  .setup-slot { padding:18px;min-width:0; }
  .setup-slot h3 { font-size:15px;margin:0 0 4px; }
  .setup-slot .slot-help { font-size:13px;color:var(--text-3);min-height:38px;margin-bottom:12px; }
  .setup-settings { padding:20px; }
  .setup-settings-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px; }
  .setup-action { position:sticky;bottom:0;z-index:20;margin:0 calc((1680px - 100vw)/2);padding:12px max(32px,calc((100vw - 1616px)/2));width:100vw!important;max-width:none!important;background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(12px);border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:16px; }
  .setup-action button { min-width:180px; }
  .browser-grid { grid-template-columns:repeat(auto-fill,minmax(250px,1fr)) !important;gap:18px !important; }
  .browser-grid img { object-fit:cover !important; }
  .responsive-grid { grid-template-columns:minmax(0,7fr) minmax(0,5fr) !important; }
  @media(max-width:1199px) { .setup-uploads,.setup-settings-grid { grid-template-columns:repeat(2,minmax(0,1fr));gap:18px; } }
  @media(max-width:979px) { .neosis-steps li:not(.current) b { display:none; }.responsive-grid { grid-template-columns:1fr !important; }.infer-layout { grid-template-columns:1fr!important;grid-template-rows:auto!important;min-height:0!important; }.infer-layout .progress-card,.infer-layout .activity-card,.infer-layout > .stat-cards-container { grid-column:1!important;grid-row:auto!important; }.infer-layout .activity-card { min-height:320px; } }
  @media(max-width:719px) { .neosis-topbar { height:96px;grid-template-columns:1fr auto;grid-template-rows:48px 32px;gap:0 10px;padding:6px 16px; }.neosis-brand { grid-column:1;grid-row:1;gap:10px; }.brand-logo { width:136px;max-height:22px; }.brand-divider { height:24px; }.brand-title b { font-size:14px; }.brand-title small { font-size:10px; }.theme-toggle { width:34px;height:34px; }.neosis-steps { grid-column:1/3;grid-row:2;justify-content:center; }.neosis-steps li:not(.current) { display:none; }.neosis-steps li.current b::before { content:'Step '; }.neosis-steps li.current b::after { content:' of 4'; }.neosis-page-head,.neosis-content { padding-left:16px;padding-right:16px; }.neosis-page-head { padding-top:22px; }.neosis-page-head h1 { font-size:25px; }.setup-uploads { grid-template-columns:1fr; }.setup-action { margin:0 -16px;width:calc(100% + 32px)!important;padding:12px 16px;flex-direction:column;align-items:stretch; }.setup-action .action-right { align-items:stretch;flex-direction:column-reverse; }.setup-action button { width:100%; }.readiness-chips { display:none; }.stat-cards-container { display:grid!important;grid-template-columns:1fr 1fr!important; }.browser-grid { grid-template-columns:repeat(2,minmax(0,1fr)) !important;gap:10px!important; }.browser-toolbar { top:96px;gap:8px; }.sort-segment { max-width:100%; }.sort-segment button { padding:7px 6px;font-size:10px; }.image-count { margin-left:auto; }.class-dist-head { align-items:flex-start;flex-direction:column; }.class-dist-head input { width:100%;max-width:none; }.class-rows > div { font-size:12px!important; } .viewer-header { padding:6px 10px!important; }.viewer-controls { max-width:calc(100vw - 20px);gap:5px;bottom:10px; }.viewer-controls input[type=range] { width:80px; }.viewer-sidebar { display:none!important; } }
  .setup-action { position:fixed;left:0;right:0;bottom:0;z-index:200;margin:0;padding:12px max(32px,calc((100vw - 1616px)/2));width:100vw!important;max-width:none!important;background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(12px);border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:16px; }
  .setup-action small { position:static; }
  .setup-layout { padding-bottom:86px; }
  .histogram-bars { background-image:linear-gradient(to bottom,var(--border) 1px,transparent 1px);background-size:100% 25%; }
  .class-rows { display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:36px!important;row-gap:2px!important; }
  .class-rows > div { gap:8px!important; }
  .class-rows > div > span:nth-of-type(2) { min-width:100px!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .browser-grid > div > div:first-child > div:last-child { left:6px!important;right:auto!important;border-radius:999px!important; }
  @media(max-width:979px) { .class-rows { grid-template-columns:1fr; }.neosis-content .responsive-grid { grid-template-columns:1fr!important; }.infer-layout { grid-template-columns:1fr!important;grid-template-rows:auto!important;min-height:0!important; }.infer-layout .progress-card,.infer-layout .activity-card,.infer-layout > .stat-cards-container { grid-column:1!important;grid-row:auto!important; } }
  @media(max-width:719px) { .setup-settings-grid { grid-template-columns:1fr; }.setup-action { margin:0;width:100vw!important;padding:12px 16px;flex-direction:column;align-items:stretch; }.setup-action .action-right { align-items:stretch;flex-direction:column-reverse; }.readiness-chips { display:none; }.neosis-steps li+li::before { display:none; }.neosis-steps li.current>span { display:none; }.neosis-steps li.current .step-label { display:none; }.neosis-steps li.current b::before,.neosis-steps li.current b::after { content:none!important; }.neosis-steps li.current .step-mobile { display:block;white-space:nowrap; } }
  .browser-toolbar { margin-bottom:18px!important; }
  .browser-grid { margin-top:16px!important; }
  .setup-uploads { align-items:stretch; }
  .setup-uploads > .upload-zone { min-height:320px;display:flex;flex-direction:column; }
  .setup-uploads > .upload-zone .upload-drop { flex:1;min-height:210px; }
  .class-dist-card { min-height:360px; }
  .class-rows { row-gap:10px!important; }
  .class-rows > div { min-height:32px; }
  .histogram-bars { height:190px!important; }
  .neosis-content .responsive-grid > div > .clay-card { min-height:300px; }
  @media(max-width:719px) { .setup-uploads > .upload-zone { min-height:280px; }.setup-uploads > .upload-zone .upload-drop { min-height:180px; }.class-dist-card { min-height:300px; }.neosis-content .responsive-grid > div > .clay-card { min-height:260px; }.browser-grid { margin-top:12px!important; } }
`;

const mono = { fontFamily: "'Plus Jakarta Sans', sans-serif" };
const lbl = (T) => ({ fontSize: 13, textTransform: "none", letterSpacing: "normal", color: T.textSub, display: "block", marginBottom: 8, fontWeight: 600 });

const APP_NAV_ITEMS = [
  { title:"Dashboard", icon:"dashboard", route:"#/" },
  { title:"Pseudo Labelling", icon:"label", route:"#/labeler" },
  { title:"Image Extraction", icon:"extract", route:"#/extract" },
  { title:"Testing Images", icon:"testing", route:"#/testing-images" },
  { title:"Packshots", icon:"packshots", route:"#/packshots" },
  { title:"Model Dashboard", icon:"dashboard", route:"#/model-dashboard" },
  { title:"Accuracy Report", icon:"accuracy", route:"#/accuracy-report" },
];
const NEOSIS_BRAND_NAME = window.NEOSIS_BRAND_NAME || "Neosis";

function StrokeIcon({ name, size=18 }) {
  const paths={menu:<path d="M4 6h16M4 12h16M4 18h16"/>,close:<path d="m6 6 12 12M18 6 6 18"/>,sun:<><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,moon:<path d="M20.9 13A8.9 8.9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>,arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,check:<path d="m5 12 4 4L19 6"/>,home:<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11z"/>,label:<><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8m-8 4h5"/></>,extract:<><path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/></>,testing:<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/></>,packshots:<><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v10l9 5 9-5V8M12 13v10"/></>,dashboard:<><path d="M4 19V5m0 14h16M8 15l3-4 3 2 5-7"/></>,accuracy:<><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5m-9 5 2 2 4-4"/></>};
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.label}</svg>;
}

const IR_DESIGN_CSS = `
  :root { --bg:#F8FAFC;--surface:#FFFFFF;--surface-2:#F8FAFC;--surface-3:#F1F5F9;--border:#E2E8F0;--border-strong:#CBD5E1;--text:#0F172A;--text-2:#475569;--text-3:#64748B;--primary:#5545F5;--primary-hover:#4338CA;--primary-soft:#EEEDFF;--on-primary:#FFFFFF;--success:#12805C;--success-soft:#E3F5EE;--warn:#B45309;--warn-soft:#FEF3E2;--warn-line:#F1D9A8;--danger:#C62828;--danger-soft:#FDE9E9;--shadow:0 1px 2px rgba(15,23,42,.05),0 4px 14px rgba(15,23,42,.04);--focus:0 0 0 3px rgba(85,69,245,.35); }
  :root[data-theme="dark"] { --bg:#0F172A;--surface:#172033;--surface-2:#1B2640;--surface-3:#222F4D;--border:#27344F;--border-strong:#3A4A6C;--text:#F1F5F9;--text-2:#CBD5E1;--text-3:#94A3B8;--primary:#8F85FF;--primary-hover:#A8A0FF;--primary-soft:#27235F;--on-primary:#12104A;--success:#4CD6A0;--success-soft:#0F3329;--warn:#F5B454;--warn-soft:#3A2A10;--warn-line:#5A4318;--danger:#FF8A8A;--danger-soft:#3A1818;--shadow:none;--focus:0 0 0 3px rgba(143,133,255,.5); }
  *,*::before,*::after { box-sizing:border-box; }
  body,button,input,select,textarea { font-family:'Plus Jakarta Sans',system-ui,sans-serif!important; }
  body { margin:0;color:var(--text)!important;font-size:14px;font-variant-numeric:tabular-nums;background:var(--bg)!important; }
  .neosis-shell { min-height:100vh;background:var(--bg)!important;color:var(--text)!important; }
  .neosis-topbar { position:sticky;top:0;z-index:300;height:62px!important;padding:0 20px!important;display:grid!important;grid-template-columns:minmax(200px,1fr) minmax(0,720px) minmax(200px,1fr)!important;align-items:center;gap:16px!important;background:var(--surface)!important;border-bottom:1px solid var(--border)!important;box-shadow:none!important; }
  .app-nav-left,.app-nav-right,.app-brand-link { display:flex;align-items:center; }
  .app-nav-left { gap:10px;min-width:0; }.app-nav-right { position:relative;justify-self:end;gap:8px; }
  .app-brand-link { gap:10px;text-decoration:none;color:var(--primary);font-weight:800;font-size:21px;letter-spacing:-.01em;white-space:nowrap; }
  .app-brand-mark { width:30px;height:30px; }.app-hamburger,.app-icon-btn { width:38px;height:38px;border:1px solid transparent;border-radius:10px;display:grid;place-items:center;background:transparent;color:var(--text-2);cursor:pointer;font-size:18px;transition:background .15s,border-color .15s; }
  .app-hamburger:hover,.app-icon-btn:hover { background:var(--surface-3);border-color:var(--border); }.app-icon-btn:focus-visible,.app-hamburger:focus-visible,.app-avatar:focus-visible,.app-search:focus-visible { outline:none;box-shadow:var(--focus); }
  .app-search-wrap { position:relative;width:100%;height:42px;padding:0 14px;display:flex;align-items:center;gap:10px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);color:var(--text-3); }.app-search-wrap:focus-within { border-color:var(--primary);background:var(--surface); }.app-search { width:100%;height:100%;min-width:0;padding:0;border:0!important;outline:0!important;box-shadow:none!important;background:transparent!important;color:var(--text);font-size:14px; }.app-search-icon { position:static;display:grid;place-items:center;color:var(--text-3);pointer-events:none;flex:none; }.app-search-icon svg { width:18px;height:18px; }
  .app-search-menu,.app-account-menu { position:absolute;top:calc(100% + 6px);right:0;z-index:500;padding:6px;border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:var(--shadow); }.app-search-menu { left:0;right:0;width:auto;max-height:340px;overflow:auto; }.app-account-menu { top:calc(100% + 10px);width:260px; }.app-menu-label { padding:8px 10px;color:var(--text-3);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em; }.app-menu-item { width:100%;min-height:40px;padding:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;border:0;border-radius:8px;background:transparent;color:var(--text);text-align:left;font:600 13.5px 'Plus Jakarta Sans',sans-serif;cursor:pointer; }.app-menu-item:hover,.app-menu-item[aria-current="page"] { background:var(--surface-3);color:var(--text); }.app-menu-item:disabled { opacity:.5;cursor:not-allowed; }
  .app-avatar { width:40px;height:40px;min-width:40px;box-sizing:border-box;overflow:hidden;padding:0;border:0;border-radius:50%;display:grid;place-items:center;background:var(--primary);color:var(--on-primary);font-size:14px;font-weight:800;cursor:pointer; }.app-avatar img { display:block;width:100%;height:100%;object-fit:cover;object-position:center;border-radius:50%;margin:0;padding:0;border:0; }.app-account-info { padding:10px 12px 12px;border-bottom:1px solid var(--border);margin-bottom:6px; }.app-account-info strong,.app-account-info span { display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.app-account-info strong { font-size:13.5px; }.app-account-info span { margin-top:4px;color:var(--text-3);font-size:12.5px; }
  .app-drawer-backdrop { position:fixed;inset:0;z-index:6000;background:rgba(15,23,42,.45); }.app-drawer { position:fixed;inset:0 auto 0 0;z-index:6001;width:290px;max-width:86vw;padding:14px;display:flex;flex-direction:column;gap:2px;background:var(--surface);border-right:1px solid var(--border);box-shadow:0 20px 60px rgba(0,0,0,.3);animation:drawer-in .15s ease-out; }.app-drawer-head { padding:0 4px 12px;border-bottom:1px solid var(--border);margin-bottom:4px;display:flex;justify-content:space-between;align-items:center; }.app-drawer-nav { display:grid;gap:4px;padding-top:8px; }.app-drawer-nav .app-menu-item { justify-content:flex-start;padding:10px 12px; }.app-drawer-nav .app-menu-item>span { margin-left:auto;color:var(--text-3);font-size:11px;font-weight:600; }.app-drawer-nav .app-menu-item>svg { color:var(--text-3);flex:none; }.app-drawer-foot { margin-top:auto;padding:12px;border-top:1px solid var(--border);color:var(--text-3);font-size:12.5px; }.app-drawer-foot img { display:block;width:104px;max-height:25px;object-fit:contain;object-position:left;margin-bottom:10px; }
  @keyframes drawer-in { from{transform:translateX(-12px);opacity:.75}to{transform:translateX(0);opacity:1} }
  .workflow-progress { max-width:1360px;margin:18px auto 0;padding:0 40px; }.workflow-progress .neosis-steps { position:static;justify-content:center; }
  .neosis-page-head { max-width:1360px;margin:0 auto;padding:36px 40px 0!important; }.neosis-page-head h1 { margin:0;font:800 28px/1.2 'Plus Jakarta Sans',sans-serif!important;letter-spacing:-.015em; }.neosis-page-head[data-page="Dashboard"] h1 { font-size:32px!important; }.neosis-page-head p { margin:6px 0 0;color:var(--text-2)!important;font-size:14.5px;line-height:1.5;max-width:70ch; }.neosis-content { max-width:1360px!important;margin:0 auto!important;padding:18px 40px 64px!important; }
  .clay-card { border-radius:14px!important;border:1px solid var(--border)!important;background:var(--surface)!important;box-shadow:var(--shadow)!important;transition:transform .15s,border-color .15s,box-shadow .15s!important; }.clay-card-interactive:hover { transform:translateY(-2px)!important;border-color:var(--primary)!important;box-shadow:0 8px 24px rgba(85,69,245,.12)!important; }
  .clay-btn-primary,.clay-btn-secondary { height:40px;padding:0 16px;font:700 13.5px 'Plus Jakarta Sans',sans-serif!important;letter-spacing:0!important; }
  .clay-btn-primary { border:1px solid var(--primary)!important;border-radius:10px!important;background:var(--primary)!important;color:var(--on-primary)!important;box-shadow:none!important;transition:background .15s,border-color .15s,transform .15s!important; }.clay-btn-primary:hover { background:var(--primary-hover)!important;filter:none!important;transform:translateY(-1px)!important;box-shadow:none!important; }.clay-btn-secondary { border:1px solid var(--border-strong)!important;border-radius:10px!important;background:var(--surface)!important;color:var(--text-2)!important;box-shadow:none!important;transition:background .15s,border-color .15s!important; }.clay-btn-secondary:hover { border-color:var(--border-strong)!important;background:var(--surface-3)!important;color:var(--text-2)!important; }
  .clay-btn-primary:focus-visible,.clay-btn-secondary:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible { outline:none;box-shadow:var(--focus)!important; }.clay-btn-primary:disabled,.clay-btn-secondary:disabled { opacity:.55;cursor:not-allowed;transform:none!important; }
  input:not([type=checkbox]):not([type=radio]):not([type=file]):not(.app-search),select,textarea { border-radius:10px!important;color:var(--text)!important;background:var(--surface)!important; }.app-search { border:0!important;border-radius:0!important;background:transparent!important; }.neosis-page-head p { color:var(--text-2)!important; }
  @media(max-width:1100px) { .neosis-topbar { grid-template-columns:auto minmax(0,1fr) auto!important; }.dashboard-core-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.dashboard-utility-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media(max-width:720px) { .neosis-topbar { grid-template-columns:auto minmax(0,1fr) auto!important;height:62px!important;padding:0 10px!important;gap:8px!important; }.app-brand-link>span { display:none; }.app-nav-left { gap:6px; }.app-nav-right { gap:4px; }.workflow-progress,.neosis-page-head,.neosis-content { padding-left:16px!important;padding-right:16px!important; }.workflow-progress { margin-top:12px; }.neosis-page-head { padding-top:22px!important; }.neosis-page-head h1 { font-size:28px!important; }.page-actions { justify-content:flex-start!important; }.dashboard-core-grid,.dashboard-utility-grid { grid-template-columns:1fr; } }
  .neosis-page-title { min-width:0; }.neosis-back-link { display:inline-flex;align-items:center;gap:6px;margin:0 0 8px;padding:0;border:0;background:transparent;color:var(--text-2);font:600 13px 'Plus Jakarta Sans',sans-serif;cursor:pointer; }.neosis-back-link:hover { color:var(--primary); }
  .dashboard-section-title { display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:19px;font-weight:800;color:var(--text); }.dashboard-section-title svg { color:var(--primary);flex:none; }.dashboard-section + .dashboard-section { margin-top:34px; }.dashboard-core-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px; }.dashboard-workflow { min-height:0;padding:20px 22px;display:flex;flex-direction:column;align-items:stretch;gap:10px;text-align:left;color:var(--text);cursor:pointer;text-decoration:none; }.dashboard-workflow-top { display:flex;align-items:center;gap:12px; }.dashboard-icon { width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:var(--primary-soft);color:var(--primary);flex:none; }.dashboard-workflow strong,.dashboard-workflow small { display:block; }.dashboard-workflow strong { font-size:16.5px;font-weight:800; }.dashboard-workflow small { margin-top:0;color:var(--text-2);font-size:14px;line-height:1.5; }.dashboard-utilities { padding:0;border:0;border-radius:0;background:transparent; }.dashboard-utility-panel { padding:10px!important; }.dashboard-utility-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px; }.dashboard-utility { min-height:0;padding:16px;display:flex;align-items:center;gap:14px;border:0;border-radius:10px;background:transparent;color:var(--text);text-align:left; }.dashboard-utility:hover:enabled { background:var(--surface-3); }.dashboard-utility-icon { width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--primary-soft);color:var(--primary);flex:none; }.dashboard-utility-copy { min-width:0; }.dashboard-utility strong { display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800; }.dashboard-utility small { display:block;margin-top:2px;color:var(--text-3);font-size:13px;line-height:1.4; }.dashboard-utility em { padding:4px 10px;border-radius:999px;background:var(--warn-soft);border:1px solid var(--warn-line);color:var(--warn);font-size:11.5px;font-style:normal;font-weight:700;white-space:nowrap; }.dashboard-utility:disabled { opacity:1;cursor:not-allowed; }.dashboard-utility:disabled .dashboard-utility-icon { background:var(--surface-3);color:var(--text-3); }.dashboard-utility:disabled strong { color:var(--text-2); }.dashboard-empty { max-width:560px;margin:12px auto;padding:56px 24px;text-align:center; }.dashboard-empty h2 { margin:0 0 6px;font-size:18px; }.dashboard-empty p { margin:0;color:var(--text-2); }
  .dashboard-utility-grid { gap:24px; }
  .ir-seg { display:inline-flex;overflow:hidden;border:1px solid var(--border-strong);border-radius:10px;background:var(--surface); }.ir-seg button { min-height:34px;padding:8px 14px;border:0;border-right:1px solid var(--border);background:var(--surface);color:var(--text-2);font:700 12.5px 'Plus Jakarta Sans',sans-serif;cursor:pointer; }.ir-seg button:last-child { border-right:0; }.ir-seg button[aria-pressed="true"] { background:var(--primary-soft);color:var(--primary); }.ir-seg button:focus-visible { position:relative;z-index:1;outline:0;box-shadow:inset 0 0 0 2px var(--primary),var(--focus); }
  .neosis-select-trigger { width:100%;height:44px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--border-strong);border-radius:10px;background:var(--surface);color:var(--text);font:500 14px 'Plus Jakarta Sans',sans-serif;text-align:left;cursor:pointer;transition:border-color .15s,box-shadow .15s; }.neosis-select-trigger:hover:not(:disabled),.neosis-select-trigger[aria-expanded=true] { border-color:var(--primary); }.neosis-select-trigger:focus-visible,.neosis-select-option:focus-visible { outline:none;box-shadow:var(--focus); }.neosis-select-chevron { color:var(--text-3);transition:transform .15s; }.neosis-select-chevron.open { transform:rotate(180deg);color:var(--primary); }.neosis-select-menu { padding:6px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);box-shadow:0 12px 36px rgba(15,23,42,.22); }.neosis-select-option { width:100%;min-height:38px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;border:0;border-radius:8px;background:transparent;color:var(--text);font:500 14px 'Plus Jakarta Sans',sans-serif;text-align:left;cursor:pointer; }.neosis-select-option:hover,.neosis-select-option[aria-selected=true] { background:var(--surface-3);color:var(--text); }.neosis-select-option[aria-selected=true] svg,.neosis-select-option.action { color:var(--primary);font-weight:700; }.neosis-select-option:disabled { opacity:.5;cursor:not-allowed; }.neosis-select-separator { height:1px;margin:6px 4px;background:var(--border); }
  .neosis-shell .setup-uploads { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;align-items:stretch; }
  .neosis-shell .setup-uploads > .upload-zone { min-height:0;padding:20px;display:flex;flex-direction:column; }
  .neosis-shell .setup-uploads > .upload-zone .upload-drop { flex:none;height:200px;min-height:0;padding:16px;border:1.5px dashed var(--border-strong);border-radius:12px;background:var(--surface-2); }
  .neosis-shell .upload-drop.filled { border-style:solid;border-color:color-mix(in srgb,var(--success) 40%,var(--border));background:var(--success-soft); }
  .neosis-shell .setup-action { position:sticky;bottom:0;z-index:20;margin:0 calc(50% - 50vw);padding:12px max(40px,calc((100vw - 1280px)/2));width:100vw!important;max-width:none!important;background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(12px);border-top:1px solid var(--border); }
  .neosis-shell .setup-layout { padding-bottom:0; }
  .neosis-shell .neosis-page-head,.neosis-shell .neosis-content { width:100%;max-width:1360px;padding-left:40px!important;padding-right:40px!important; }
  .neosis-shell .neosis-content > div,.neosis-shell .neosis-content > div[style*="max-width"] { width:100%;max-width:100%!important; }
  .neosis-shell .infer-layout { max-width:100%!important;width:100%!important; }
  .neosis-shell .neosis-content .responsive-grid { gap:24px!important; }
  .tool-notice { display:flex;align-items:flex-start;gap:12px;margin:16px 0 20px;padding:14px 16px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);color:var(--text-2);font-size:13px;line-height:1.5; }
  .tool-notice svg { flex:none;margin-top:1px; }.tool-notice.error { border-color:color-mix(in srgb,var(--danger) 35%,var(--border));background:var(--danger-soft); }.tool-notice.error svg { color:var(--danger); }.tool-notice.success { border-color:color-mix(in srgb,var(--success) 40%,var(--border));background:var(--success-soft); }.tool-notice.success svg { color:var(--success); }
  .brand-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px; }
  .brand-card { width:100%;min-height:96px;padding:18px 20px!important;display:flex;align-items:center;gap:14px;text-align:left;color:var(--text)!important;font:inherit;cursor:pointer;transition:transform .15s,border-color .15s,box-shadow .15s,background .15s!important; }
  .brand-card:hover { transform:translateY(-2px)!important;border-color:var(--primary)!important;box-shadow:0 8px 24px rgba(85,69,245,.12)!important; }.brand-card:active { transform:none!important;background:var(--primary-soft)!important; }.brand-card:focus-visible { outline:none;box-shadow:var(--focus)!important; }.brand-card[aria-current="true"] { outline:2px solid var(--primary);outline-offset:1px; }
  .brand-mark { width:48px;height:48px;display:grid;place-items:center;flex:none;border:1px solid transparent;border-radius:12px;background:var(--primary-soft);color:var(--primary);font-size:15px;font-weight:800; }.brand-mark-empty { background:var(--surface-3);color:var(--text-3); }.brand-mark-logo { overflow:hidden;padding:6px;border-color:var(--border);background:var(--surface); }.brand-mark-logo img { display:block;width:100%;height:100%;object-fit:contain; }.brand-card-copy { min-width:0;flex:1; }.brand-card-copy b,.brand-card-copy small { display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.brand-card-copy b { font-size:16px;font-weight:800; }.brand-card-copy small { margin-top:3px;color:var(--text-3);font-size:13px; }.brand-card-arrow { width:28px;height:28px;display:grid;place-items:center;flex:none;border:1px solid var(--border-strong);border-radius:50%;color:var(--text-3);transition:background .15s,color .15s,border-color .15s; }.brand-card:hover .brand-card-arrow,.brand-card:focus-visible .brand-card-arrow { border-color:var(--primary);background:var(--primary);color:var(--on-primary); }
  .toolkit-brand-title { display:inline-flex;align-items:center;gap:10px; }.toolkit-brand-title img { width:32px;height:32px;object-fit:contain;border:1px solid var(--border);border-radius:8px;padding:3px;background:var(--surface); }
  .toolkit-logo-picker { min-height:60px;padding:10px 12px;display:flex;align-items:center;gap:12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);color:var(--text-2); }.toolkit-logo-picker img { width:42px;height:42px;object-fit:contain;padding:3px;border:1px solid var(--border);border-radius:8px;background:var(--surface); }.toolkit-logo-picker span { min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .app-menu-item:disabled { opacity:1;cursor:not-allowed;color:var(--text-2); }
  .upcoming-pill { padding:3px 9px;border-radius:999px;background:var(--primary-soft);color:var(--primary);font-size:11.5px;font-style:normal;font-weight:700;white-space:nowrap; }.dashboard-workflow-upcoming { position:relative;cursor:default;background:linear-gradient(135deg,color-mix(in srgb,var(--surface) 88%,var(--primary)),var(--surface) 72%)!important;border-color:color-mix(in srgb,var(--border) 72%,var(--primary))!important;box-shadow:var(--shadow),inset 0 1px 0 color-mix(in srgb,var(--surface) 84%,white)!important; }.dashboard-workflow-upcoming:hover { transform:none!important;border-color:color-mix(in srgb,var(--border) 72%,var(--primary))!important; }.dashboard-workflow-upcoming .dashboard-icon { background:var(--primary-soft);color:var(--primary); }.dashboard-workflow-upcoming .dashboard-workflow-top>strong { display:flex;align-items:center;gap:8px; }
  .toolkit-skeleton { min-height:170px;border-radius:14px;background:linear-gradient(100deg,var(--surface-2) 25%,var(--surface-3) 45%,var(--surface-2) 65%);background-size:200% 100%;animation:toolkit-shimmer 1.3s linear infinite; }.toolkit-skeleton-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px; }.toolkit-skeleton.packshot-skeleton { min-height:220px; }
  @keyframes toolkit-shimmer { to { background-position-x:-200%; } }
  @media(max-width:720px) { .brand-grid { grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); } }
  @media(max-width:559px) { .brand-grid { grid-template-columns:1fr; } }
  .toolkit-toolbar { position:sticky;top:72px;z-index:20;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:18px;padding:10px 12px;border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:var(--shadow); }.toolkit-toolbar-spacer { flex:1 1 auto; }.toolkit-toolbar-actions { display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap; }.toolkit-toolbar .toolbar-sm { height:34px;padding:0 12px;font-size:12.5px; }
  .toolkit-toolbar-filters { min-width:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap; }.toolkit-meta { margin-left:auto;color:var(--text-2);font-size:12.5px;font-weight:600;white-space:nowrap; }
  .filter-chip { min-height:36px;max-width:100%;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:7px 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-2);font-size:12.5px;font-weight:700;cursor:pointer;white-space:normal;overflow-wrap:anywhere; }.filter-chip:hover { background:var(--surface-3); }.filter-chip[aria-pressed=true] { border-color:var(--primary);background:var(--primary-soft);color:var(--primary); }
  .gallery-toolbar { position:static;align-items:start; }.testing-gallery-toolbar { display:flex;align-items:center;flex-wrap:nowrap;gap:8px; }.testing-gallery-toolbar .toolkit-toolbar-actions { flex:0 0 auto;flex-wrap:nowrap;gap:6px; }.testing-gallery-toolbar .toolkit-meta { margin:0;padding:0 2px;color:var(--text-2);font-size:12.5px;white-space:nowrap; }.asset-filter-control { position:relative;min-width:0;display:flex;align-items:center;flex:0 1 auto; }.asset-filter-button { min-width:0;max-width:min(240px,calc(100vw - 210px));height:36px!important;padding:0 12px!important;display:inline-flex!important;align-items:center;justify-content:flex-start;gap:8px;white-space:nowrap; }.asset-filter-button svg { width:16px;height:16px;flex:none; }.asset-filter-button.active { padding-right:34px!important;border-color:var(--primary)!important;background:var(--primary-soft)!important;color:var(--primary)!important; }.asset-filter-label { min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.asset-filter-clear { width:24px;height:24px;margin-left:-34px;z-index:1;display:grid;place-items:center;flex:none;padding:0;border:0;border-radius:50%;background:transparent;color:var(--primary);font-size:17px;line-height:1;cursor:pointer; }.packshot-toolbar { align-items:center;min-height:58px; }.packshot-toolbar .toolkit-meta { padding-top:0; }
  .toolkit-toolbar-actions { min-width:0; }.gallery-toolbar .toolkit-toolbar-spacer { min-width:12px; }.gallery-toolbar-actions .toolkit-meta { margin:0;padding:8px 4px;align-self:center; }.asset-filter-popover { z-index:8000;display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);box-shadow:var(--shadow); }.asset-filter-search { width:100%;height:38px;box-sizing:border-box;padding:0 11px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);color:var(--text);font:500 13px 'Plus Jakarta Sans',sans-serif; }.asset-filter-all,.asset-filter-option { width:100%;min-width:0;min-height:38px;display:flex;align-items:center;gap:9px;padding:7px 9px;border:0;border-radius:8px;background:transparent;color:var(--text);font:500 13px 'Plus Jakarta Sans',sans-serif;text-align:left;cursor:pointer; }.asset-filter-all { justify-content:space-between;border-bottom:1px solid var(--border);border-radius:0;font-weight:700; }.asset-filter-options { min-height:0;overflow-y:auto;overscroll-behavior:contain; }.asset-filter-option:hover,.asset-filter-option[aria-selected=true],.asset-filter-all:hover { background:var(--surface-3); }.asset-filter-option:focus-visible,.asset-filter-all:focus-visible { outline:0;box-shadow:var(--focus); }.asset-filter-checkbox { width:16px;height:16px;box-sizing:border-box;display:grid;place-items:center;flex:none;border:1px solid var(--border-strong);border-radius:4px;color:white;font-size:12px;line-height:1; }.asset-filter-option[aria-selected=true] .asset-filter-checkbox { border-color:var(--primary);background:var(--primary); }.asset-filter-option-label { min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.asset-filter-count,.asset-filter-all>span { flex:none;color:var(--text-3);font-size:12px;font-variant-numeric:tabular-nums; }.asset-filter-empty { padding:14px 8px;color:var(--text-3);font-size:13px; }
  .clay-btn-danger { height:40px;padding:0 14px;border:1px solid color-mix(in srgb,var(--danger) 32%,var(--border));border-radius:10px;background:var(--danger-soft);color:var(--danger);font:700 13px 'Plus Jakarta Sans',sans-serif;cursor:pointer;transition:background .15s,border-color .15s,transform .15s; }.clay-btn-danger:hover:not(:disabled) { border-color:var(--danger);background:color-mix(in srgb,var(--danger-soft) 78%,var(--danger));transform:translateY(-1px); }.clay-btn-danger:focus-visible { outline:0;box-shadow:var(--focus); }.clay-btn-danger:disabled { opacity:.55;cursor:not-allowed; }.clay-btn-danger.toolbar-sm { height:34px;padding:0 12px;font-size:12.5px; }

  .testing-image-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));align-items:start;gap:14px; }.testing-image-card { position:relative;overflow:hidden; }.testing-image-card.selected { border-color:var(--primary)!important;box-shadow:0 0 0 2px var(--primary)!important; }.testing-image-button { display:block;width:100%;aspect-ratio:4/3;padding:0;border:0;background:var(--surface-2);cursor:zoom-in; }.testing-image-button img { display:block;width:100%;height:100%;object-fit:contain;object-position:center; }.testing-image-caption { display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;color:var(--text-2);font-size:12.5px; }.testing-image-caption a { flex:none;color:var(--primary);font-weight:700;text-decoration:none; }.toolkit-image-select { position:absolute;top:8px;left:8px;z-index:3;width:26px!important;height:26px!important;margin:0!important;accent-color:var(--primary);opacity:0;cursor:pointer; }.testing-image-card:hover .toolkit-image-select,.testing-image-card.selected .toolkit-image-select,.toolkit-image-select:focus-visible { opacity:1; }.toolkit-empty { margin:12px auto;padding:56px 24px;text-align:center; }
  .toolkit-modal-overlay { position:fixed;inset:0;z-index:5000;display:grid;place-items:center;padding:20px;background:rgba(8,13,25,.55); }.toolkit-modal { width:100%;max-width:680px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;overflow:hidden;border-radius:16px!important; }.toolkit-modal-head { display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border); }.toolkit-modal-head h2 { margin:0;font-size:18px;font-weight:800; }.toolkit-modal-body { padding:20px;overflow:auto;display:flex;flex-direction:column;gap:18px; }.toolkit-modal-body>div:first-child { margin-top:0!important; }.toolkit-modal-foot { display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:14px 20px;border-top:1px solid var(--border); }
  .toolkit-field { display:flex;flex-direction:column;gap:7px; }.toolkit-field .ir-label { margin:0; }.toolkit-hidden-file { display:none!important; }.toolkit-drop-zone { min-height:128px;padding:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:1.5px dashed var(--border-strong);border-radius:12px;background:var(--surface-2);color:var(--text-2);text-align:center;cursor:pointer;transition:background .15s,border-color .15s; }.toolkit-drop-zone:hover,.toolkit-drop-zone:focus-visible { border-color:var(--primary);background:var(--primary-soft);outline:none;box-shadow:var(--focus); }.toolkit-drop-compact { min-height:128px; }.toolkit-drop-icon { width:38px;height:38px;display:grid;place-items:center;border:1px solid var(--border);border-radius:50%;background:var(--surface);color:var(--primary); }.toolkit-drop-zone strong { color:var(--text);font-size:14px;overflow-wrap:anywhere; }.toolkit-drop-zone small { color:var(--text-3);font-size:12.5px; }
  .packshot-grid { display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px; }.packshot-tile { position:relative;display:flex;flex-direction:column;overflow:hidden;padding:0!important;cursor:pointer; }.packshot-tile.selected { border-color:var(--primary)!important;box-shadow:0 0 0 2px var(--primary)!important; }.packshot-image-button { display:block;width:100%;aspect-ratio:1/1;padding:10px;border:0;background:var(--surface-2);cursor:zoom-in; }.packshot-image-button img { display:block;width:100%;height:100%;object-fit:contain; }.packshot-label-area { min-width:0;min-height:44px;border-top:1px solid var(--border); }.packshot-label { min-height:44px;width:100%;box-sizing:border-box;padding:8px 9px;display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;line-height:1.35;overflow-wrap:anywhere; }.packshot-label-text { min-width:0;flex:1;white-space:normal;overflow-wrap:anywhere; }.packshot-edit-button,.packshot-edit-actions button { width:25px;height:25px;flex:none;display:grid;place-items:center;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--text-3);cursor:pointer; }.packshot-edit-button { opacity:0; }.packshot-label-area:hover .packshot-edit-button,.packshot-edit-button:focus-visible,.packshot-edit-button:active { opacity:1;border-color:var(--border);background:var(--surface-2);color:var(--primary); }.packshot-label-area:focus-within .packshot-edit-button { opacity:1; }.packshot-label-input { min-width:0;flex:1;width:100%;height:31px;box-sizing:border-box;padding:5px 7px;border:1px solid var(--primary);border-radius:6px;outline:0;background:var(--surface);color:var(--text);font:700 12.5px/1.3 'Plus Jakarta Sans',sans-serif;box-shadow:var(--focus); }.packshot-label-input:disabled { opacity:.7; }.packshot-edit-actions { display:flex;flex:none;gap:2px; }.packshot-edit-actions button:hover:not(:disabled) { border-color:var(--border);background:var(--surface-2);color:var(--primary); }.packshot-edit-actions button:focus-visible,.packshot-edit-button:focus-visible { outline:0;box-shadow:var(--focus); }.packshot-save-spinner { width:12px;height:12px;border:2px solid var(--border-strong);border-top-color:var(--primary);border-radius:50%;animation:packshot-save-spin .7s linear infinite; }.packshot-label-toast { position:fixed;left:50%;bottom:24px;z-index:9200;max-width:calc(100vw - 32px);padding:10px 16px;transform:translateX(-50%);border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--text);box-shadow:var(--shadow);font-size:13px;font-weight:700; }.packshot-label-toast.success { border-color:var(--success); }.packshot-label-toast.warning { border-color:var(--warn); }.packshot-label-toast.error { border-color:var(--danger);color:var(--danger); }@keyframes packshot-save-spin { to { transform:rotate(360deg); } }.packshot-tile input[type=checkbox] { position:absolute;top:8px;left:8px;z-index:2;width:26px!important;height:26px!important;margin:0!important;opacity:0;cursor:pointer; }.packshot-tile:hover input[type=checkbox],.packshot-tile.selected input[type=checkbox],.packshot-tile input[type=checkbox]:focus-visible { opacity:1; }.packshot-tile input[type=checkbox]:checked { accent-color:var(--primary); }
  .toolkit-lightbox { position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;gap:clamp(8px,3vw,32px);padding:20px;background:#080D19;color:#EDF2FC;cursor:default; }.toolkit-lightbox>div { min-width:0;text-align:center; }.toolkit-lightbox>div img { display:block;max-width:min(78vw,1200px);max-height:82vh;object-fit:contain;border-radius:6px;margin:auto; }.toolkit-lightbox strong { display:block;margin-top:12px;color:#EDF2FC;font-weight:700; }.toolkit-lightbox small { display:block;margin-top:5px;color:#b8c1d1; }.toolkit-lightbox>button { flex:none;width:42px;height:42px;border:1px solid #566176;border-radius:50%;background:#172033;color:#fff;font-size:26px;cursor:pointer; }.toolkit-lightbox>button:focus-visible { outline:2px solid #a9a3ff;outline-offset:3px; }
  @media(max-width:1100px) { .neosis-shell .setup-uploads,.dashboard-core-grid,.dashboard-utility-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.packshot-grid { grid-template-columns:repeat(4,minmax(0,1fr)); } }
  @media(max-width:980px) { .packshot-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }.neosis-shell .neosis-page-head { align-items:flex-start; }.page-actions { flex-wrap:wrap;justify-content:flex-end; } }
  @media(max-width:720px) { .neosis-shell .neosis-page-head,.neosis-shell .neosis-content,.workflow-progress { padding-left:16px!important;padding-right:16px!important; }.neosis-shell .setup-uploads,.dashboard-core-grid,.dashboard-utility-grid,.packshot-grid { grid-template-columns:1fr; }.packshot-edit-button { opacity:1;border-color:var(--border);background:var(--surface-2);color:var(--primary); }.neosis-shell .setup-action { flex-direction:column;align-items:stretch; }.neosis-shell[data-workflow="labeler"] .neosis-content { padding-bottom:220px!important; }.neosis-shell[data-workflow="labeler"] .setup-action { position:fixed;left:0;right:0;bottom:0;z-index:200;margin:0;padding:12px 16px;width:100vw!important;max-width:none!important; }.toolkit-toolbar { top:62px;align-items:flex-start; }.testing-gallery-toolbar { align-items:center; }.toolkit-meta { margin-left:auto; }.testing-image-grid { grid-template-columns:repeat(2,minmax(0,1fr));gap:10px; }.toolkit-modal-overlay { padding:20px 12px; }.toolkit-modal-body { padding:16px; }.toolkit-modal-head,.toolkit-modal-foot { padding:14px 16px; } }
  @media(max-width:520px) { .testing-gallery-toolbar { display:flex;flex-wrap:nowrap; }.testing-gallery-toolbar .asset-filter-button { max-width:calc(100vw - 220px); }.testing-gallery-toolbar .toolkit-meta { padding:0 2px; }.packshot-toolbar { display:flex;align-items:flex-start; }.packshot-toolbar .toolkit-toolbar-actions { justify-content:flex-start; } }
  @media(max-width:720px) { .toolkit-image-select { opacity:1; } }
  @media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important; } }
`;

// ─────────────────────────────────────────────────────────────────────────────
//  SHELL — FIELDASSIST CLAY NAVBAR & HEADER
// ─────────────────────────────────────────────────────────────────────────────
function Shell({ children, stepLabel, title, titleContent, subtitle, backLink, actions, onToggleTheme, showSteps = true }) {
  const T = useT();
  const currentPage = useContext(PageCtx);
  const stepNames = ["Upload", "Inference", "Results", "Browse"];
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [avatarPictureFailed, setAvatarPictureFailed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const navRef = useRef(null);
  const user = window.IR_USER || {};
  const visibleItems = APP_NAV_ITEMS.filter(item => item.title.toLowerCase().includes(searchText.trim().toLowerCase()));
  const initials = (user.name || user.email || "U").split(/[\s@._-]+/).filter(Boolean).slice(0,2).map(part=>part[0].toUpperCase()).join("");
  useEffect(() => { setAvatarPictureFailed(false); }, [user.picture]);
  useEffect(() => {
    const closeMenus = event => {
      if (event.type === "keydown" && event.key === "Escape") { setDrawerOpen(false); setAccountOpen(false); setSearchOpen(false); }
      if (event.type === "pointerdown" && navRef.current && !navRef.current.contains(event.target)) { setDrawerOpen(false); setAccountOpen(false); setSearchOpen(false); }
    };
    document.addEventListener("pointerdown", closeMenus);
    document.addEventListener("keydown", closeMenus);
    return () => { document.removeEventListener("pointerdown", closeMenus); document.removeEventListener("keydown", closeMenus); };
  }, []);
  const goTo = route => { window.location.hash = route; setDrawerOpen(false); setSearchOpen(false); setSearchText(""); window.dispatchEvent(new CustomEvent("ir-search",{detail:""})); };
  async function signOut() {
    try { await fetch("/auth/logout", { method:"POST", credentials:"same-origin" }); }
    finally { window.location.assign("/login?signed_out=1"); }
  }
  return <div className="neosis-shell" data-workflow={showSteps?"labeler":"tool"} style={{ minHeight:"100vh", background:T.bg, color:T.text }}>
    <div className="app-nav-area" ref={navRef}>
      <nav className="neosis-topbar" aria-label="Main navigation">
        <div className="app-nav-left">
          <button className="app-hamburger" type="button" aria-label="Open navigation menu" aria-expanded={drawerOpen} onClick={()=>setDrawerOpen(value=>!value)}><StrokeIcon name="menu"/></button>
          <a href="#/" className="app-brand-link" aria-label={NEOSIS_BRAND_NAME + " dashboard"}><img className="app-brand-mark" src="/logo/neosis-mark.svg" alt="" /><span>{NEOSIS_BRAND_NAME}</span></a>
        </div>
        <div className="app-search-wrap">
          <span className="app-search-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></span>
          <input className="app-search" type="search" value={searchText} aria-label="Search tools and workflows" aria-expanded={searchOpen} placeholder="Search tools and workflows…" onFocus={()=>setSearchOpen(true)} onChange={event=>{setSearchText(event.target.value);setSearchOpen(true);window.dispatchEvent(new CustomEvent("ir-search",{detail:event.target.value}));}} onKeyDown={event=>{if(event.key==="Enter"&&visibleItems.length&&!visibleItems[0].soon)goTo(visibleItems[0].route);}} />
          {searchOpen && <div className="app-search-menu" role="listbox" aria-label="Search results"><div className="app-menu-label">{searchText?"Matching workflows":"Tools and workflows"}</div>{visibleItems.length?visibleItems.map(item=><button className="app-menu-item" type="button" role="option" key={item.title} disabled={item.soon} onClick={()=>item.route&&!item.soon&&goTo(item.route)}>{item.title}<span aria-hidden="true">{item.soon?<em className="upcoming-pill">Upcoming</em>:<StrokeIcon name="arrow" size={14}/>}</span></button>):<div className="app-menu-label">No matching workflows</div>}</div>}
        </div>
        <div className="app-nav-right">
          <button className="app-icon-btn" type="button" onClick={onToggleTheme} aria-label={T.mode==="dark"?"Switch to light theme":"Switch to dark theme"} title={T.mode==="dark"?"Light theme":"Dark theme"}><StrokeIcon name={T.mode==="dark"?"sun":"moon"}/></button>
          <button className="app-avatar" type="button" aria-label="Open account menu" aria-expanded={accountOpen} onClick={()=>setAccountOpen(value=>!value)}>{user.picture&&!avatarPictureFailed?<img key={user.picture} src={user.picture} alt="" referrerPolicy="no-referrer" onError={()=>setAvatarPictureFailed(true)}/>:initials}</button>
          {accountOpen&&<div className="app-account-menu" role="menu"><div className="app-account-info"><strong>{user.name||"Signed in"}</strong><span>{user.email||""}</span></div><button className="app-menu-item" role="menuitem" type="button" onClick={signOut}>Sign out</button></div>}
        </div>
      </nav>
      {showSteps&&<div className="workflow-progress"><ol className="neosis-steps" aria-label="Pseudo Labelling progress">{stepNames.map((name,i)=><li key={name} className={currentPage===i+1?"current":currentPage>i+1?"done":""} aria-current={currentPage===i+1?"step":undefined}><span>{currentPage>i+1?String.fromCharCode(10003):i+1}</span><b><span className="step-label">{name}</span><small className="step-mobile">Step {i+1} of 4 {"\u00b7"} {name}</small></b></li>)}</ol></div>}
      {drawerOpen&&<><div className="app-drawer-backdrop" aria-hidden="true" onClick={()=>setDrawerOpen(false)}></div><aside className="app-drawer" aria-label="Tool navigation"><div className="app-drawer-head"><a href="#/" className="app-brand-link" onClick={()=>goTo("#/")}><img className="app-brand-mark" src="/logo/neosis-mark.svg" alt=""/><span>{NEOSIS_BRAND_NAME}</span></a><button type="button" className="app-icon-btn" aria-label="Close navigation menu" onClick={()=>setDrawerOpen(false)}><StrokeIcon name="close"/></button></div><nav className="app-drawer-nav">{APP_NAV_ITEMS.map(item=><button type="button" key={item.title} disabled={item.soon} className="app-menu-item" aria-current={window.location.hash===item.route?"page":undefined} onClick={()=>item.route&&!item.soon&&goTo(item.route)}><StrokeIcon name={item.icon} size={18}/>{item.title}<span aria-hidden="true">{item.soon?<em className="upcoming-pill">Upcoming</em>:<StrokeIcon name="arrow" size={14}/>}</span></button>)}</nav><div className="app-drawer-foot"><img src="/logo/FieldAssistLogoColoured.svg" alt="FieldAssist"/>Internal tools</div></aside></>}
    </div>
    {title && <header className="neosis-page-head" data-page={title}><div className="neosis-page-title">{backLink}<h1>{titleContent||title}</h1>{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="page-actions">{actions}</div>}</header>}
    <main className="neosis-content page-enter">{children}</main>
  </div>;
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

function UploadZone({ label, accept, hint, icon, value, onChange, isFolder = false, subText, warnText, helpText = "", optional = false }) {
  const T = useT();
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  const openPicker = () => { if (ref.current) ref.current.value = ""; ref.current?.click(); };
  const done = value && (Array.isArray(value) || value instanceof FileList ? value.length > 0 : value.name);
  const displayValue = done ? (isFolder ? `${value.length} images accepted` : value.name) : "";
  return <section className={`upload-zone ${done ? "is-filled" : ""}`}>
    <div className="upload-heading"><div><h3>{label}</h3><p>{helpText}</p></div><span className={`upload-badge ${optional ? "optional" : ""}`}>{optional ? "Optional" : "Required"}</span></div>
    <div className={`upload-drop ${done ? "filled" : ""} ${drag ? "dragging" : ""}`}
      onClick={openPicker}
      onKeyDown={e => { if(e.key === "Enter" || e.key === " "){e.preventDefault();openPicker();}}}
      onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={async e => { e.preventDefault();setDrag(false);if(!isFolder){onChange(e.dataTransfer.files[0]||null);return;}const transfer=e.dataTransfer;const items=Array.from(transfer.items||[]);const hasEntryApi=items.some(item=>typeof item.webkitGetAsEntry==="function");if(hasEntryApi){const entries=items.map(item=>item.webkitGetAsEntry?.()).filter(Boolean);const nestedFiles=(await Promise.all(entries.map(collectEntryFiles))).flat();onChange(nestedFiles.length?nestedFiles:transfer.files);}else onChange(transfer.files);}}
      role="button" tabIndex={0} aria-label={`${label}: ${done ? displayValue : hint}`}>
      <span className="upload-icon">{done ? "✓" : icon}</span>
      {done ? <><strong className="upload-filename">{isFolder ? (value[0]?.webkitRelativePath?.split("/")[0] || "Images folder selected") : value.name}</strong><span className="upload-meta">{subText || (isFolder ? displayValue : `${(value.size/1024/1024).toFixed(2)} MB`)}</span>{warnText && <span className="upload-meta skipped">{warnText}</span>}<button type="button" className="replace-file" onClick={e=>{e.stopPropagation();openPicker();}}>Replace</button></> : <><span className="upload-instruction">{hint}</span>{isFolder && value !== null && value.length === 0 && <span className="upload-error">No PNG, JPG, JPEG or BMP images found</span>}<button type="button" className="choose-file" onClick={e=>{e.stopPropagation();openPicker();}}>{isFolder?"Choose folder":"Choose file"}</button></>}
      <input ref={ref} type="file" accept={accept} {...(isFolder?{webkitdirectory:"",directory:"",multiple:true}:{})} onChange={e=>onChange(isFolder?e.target.files:(e.target.files[0]||null))} />
    </div>
  </section>;
}
// ─────────────────────────────────────────────────────────────────────────────
//  CLAY SLIDER & TOGGLE SWITCH
// ─────────────────────────────────────────────────────────────────────────────
function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, scaleLeft = "0 · more boxes", scaleRight = "1 · fewer, surer boxes" }) {
  const T = useT();
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <label style={lbl(T)}>{label}</label>
        <span className="field-value">{value.toFixed(2)}</span>
      </div>
      <div style={{ position: "relative", height: 8, marginBottom: 6 }}>
        <div style={{ position: "absolute", inset: 0, background: T.wellBg, borderRadius: 10, boxShadow: `inset 2px 2px 4px ${T.shadowDark}, inset -2px -2px 4px ${T.shadowLight}` }} />
        {label.toLowerCase().includes("confidence") && <div style={{ position:"absolute",left:"60%",width:"10%",top:0,bottom:0,background:"rgba(18,128,92,.22)",borderRadius:10 }} />}
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
        <span className="range-caption">{scaleLeft}</span>
        <span className="range-caption">{scaleRight}</span>
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
      <div role="switch" aria-checked={value} tabIndex={0} aria-label={label}
        onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onChange(!value);}}}
        onClick={() => onChange(!value)}
        className={`switch-control ${value?"is-on":""}`}
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
  const shownValue = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div className="clay-card stat-card" style={{ flex: 1, minWidth: 150, padding: "18px 20px" }}>
      <span className={`stat-icon ${accent ? "success" : ""}`}>{label.toLowerCase().includes("image") ? "▧" : label.toLowerCase().includes("confidence") ? "◎" : label.toLowerCase().includes("remaining") ? "◷" : "▦"}</span>
      <div className="stat-copy"><span className="stat-label">{label}</span>
      <p className="stat-value" style={{ color: accent || T.text }}>{shownValue}</p>
      {sub && <p className="stat-sub">{sub}</p>}</div>
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
  const [uploadProgress, setUploadProgress] = useState("");
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
    setUploadProgress("");
    setErrorMsg("");
    try {
      // 1. Create Session
      const sesRes = await fetch(`${API_BASE_URL}`, { method: 'POST' });
      if(!sesRes.ok) throw new Error("Failed to create session");
      const { session_id } = await sesRes.json();

      // 2. Upload Images in sequential batches (up to 40 files or about 40 MB)
      const imageBatches = [];
      let currentBatch = [];
      let currentBatchBytes = 0;
      const maxBatchFiles = 40;
      const maxBatchBytes = 40 * 1024 * 1024;
      for (const image of files.images) {
        if (currentBatch.length > 0 && (currentBatch.length >= maxBatchFiles || currentBatchBytes + image.size > maxBatchBytes)) {
          imageBatches.push(currentBatch);
          currentBatch = [];
          currentBatchBytes = 0;
        }
        currentBatch.push(image);
        currentBatchBytes += image.size;
      }
      if (currentBatch.length > 0) imageBatches.push(currentBatch);

      let uploadedImages = 0;
      setUploadProgress(`Uploading images 0 / ${files.images.length}...`);
      for (let batchIndex = 0; batchIndex < imageBatches.length; batchIndex++) {
        const batch = imageBatches[batchIndex];
        let uploaded = false;
        for (let attempt = 0; attempt < 2 && !uploaded; attempt++) {
          const imgData = new FormData();
          for (const image of batch) imgData.append("files", image);
          try {
            const imgRes = await fetch(`${API_BASE_URL}/${session_id}/upload/images`, { method: "POST", body: imgData });
            uploaded = imgRes.ok;
          } catch (err) {
            uploaded = false;
          }
        }
        if (!uploaded) throw new Error(`Image upload failed at batch ${batchIndex + 1}`);
        uploadedImages += batch.length;
        setUploadProgress(`Uploading images ${uploadedImages} / ${files.images.length}...`);
      }

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
      setUploadProgress("");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Shell stepLabel="Step 01 — Setup" title="Set up a run" subtitle="Choose your images and model, adjust the detection settings, then start inference." onToggleTheme={onToggleTheme}>
      <div className="setup-layout">
        <div className="setup-uploads">
          <UploadZone label="Images folder" accept=".png,.jpg,.jpeg,.bmp" isFolder={true} hint="Drop a folder here, or choose one" helpText="PNG, JPG, JPEG or BMP · subfolders included" icon="▧" value={files.images} onChange={setImages}
            subText={files.images !== null ? `${files.images.length} images accepted` : null}
            warnText={files.ignoredImages > 0 ? `${files.ignoredImages} other files skipped` : null} />
          <UploadZone label="YOLOv11 weights" accept=".pt" hint="Drop your .pt file here, or choose a file" helpText="A single .pt file" icon="⚡" value={files.weights} onChange={set("weights")} />
          <UploadZone label="Darknet labels" accept="" hint="Drop the labels file here, or choose a file" helpText="_darknet.labels · added to the export" icon="▤" value={files.darknetLabels} onChange={set("darknetLabels")} optional />
        </div>
        <section className="clay-card setup-settings">
          <div className="settings-heading"><h2>Detection settings</h2><span className="engine-chip">● YOLOv11 · Ultralytics</span></div>
          <div className="setup-settings-grid">
            <div className="setting-cell"><Slider label="Confidence threshold" value={conf} onChange={setConf} /><p className="setting-help">Boxes scoring below this are dropped. Green band: 0.60–0.70 works well for shelf SKUs.</p></div>
            <div className="setting-cell"><Slider label="IoU threshold" value={iou} onChange={setIou} scaleLeft="0 · merge more" scaleRight="1 · merge less" /><p className="setting-help">Boxes overlapping more than this are treated as duplicates and merged.</p></div>
            <div className="setting-cell"><ToggleSwitch label="Class-agnostic NMS" hint="Merges overlapping boxes even when they have different classes, so one product gets one label." value={agnosticNms} onChange={setAgnosticNms} /></div>
          </div>
        </section>
        {errorMsg && <div className="upload-error-banner" role="alert"><strong>Image upload failed</strong><span>{errorMsg || "The server did not accept the images. Check your connection and try again. Your selections are kept."}</span></div>}
        <div className="setup-action"><div className="readiness-chips"><span className={files.images?.length?"ready":"missing"}>{files.images?.length?`✓ ${files.images.length} images`:"Images needed"}</span><span className={files.weights?"ready":"missing"}>{files.weights?`✓ ${files.weights.name}`:"Model needed"}</span><span className="optional-chip">{files.darknetLabels?`✓ ${files.darknetLabels.name}`:"Labels file · optional"}</span></div><div className="action-right"><span>{ready?"Uploads your files, then starts detection.":files.images?.length?"Add a .pt model to continue.":"Add your images and a model to continue."}</span><button disabled={!ready||uploading} className="clay-btn-primary" onClick={handleStart}>{uploading?"Uploading…":errorMsg?"Try again":"Start inference →"}</button>{uploadProgress&&<small>{uploadProgress}</small>}</div></div>
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
  const activityLogRef = useRef(null);
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
  const loadingModel = progress === 0 && !done;

  useEffect(() => { if (activityLogRef.current) activityLogRef.current.scrollTop = activityLogRef.current.scrollHeight; }, [log]);

  return (
    <Shell stepLabel="Step 02 — Processing" title={inferenceError || "Running inference"} subtitle={inferenceError ? "The run stopped before it finished." : undefined} onToggleTheme={onToggleTheme}>
      {inferenceError ? (
        <div className="clay-card" style={{ maxWidth: 720, width: "100%", padding: 28, textAlign: "center" }}>
          <p style={{ ...mono, color: T.textSub, marginBottom: 18 }}>Processing stopped after {progress} of {total} images. Nothing was saved to your computer. Go back to set up and start the run again.</p>
          <button className="clay-btn-secondary" onClick={onBack}>Back to setup</button>
        </div>
      ) : (
      <div className="infer-layout" style={{ maxWidth: 720, width: "100%" }}>
        {/* Progress Card */}
        <div className="clay-card progress-card" style={{ textAlign: "center", padding: "40px 36px 32px", marginBottom: 20 }}>
          <div className="phase-tracker"><span className="phase-done">1&nbsp; Files uploaded</span><i/><span className={!loadingModel?"phase-done":"phase-now"}>2&nbsp; Model loaded</span><i/><span className={progress>0?"phase-now":"phase-upcoming"}>3&nbsp; Detecting objects</span></div>
          {loadingModel && <div className="loading-copy"><h2>Loading your model</h2><p>Detection starts as soon as the model is ready. This can take a minute or two the first time.</p></div>}
          <div className="inference-count"><p style={{ ...mono, fontSize: 80, fontWeight: 700, color: T.accent, letterSpacing: "-0.04em", lineHeight: 1 }}>{progress}<span style={{ fontSize: 32, color: T.textMuted }}>/{total}</span></p><span className="progress-percent">{pct.toFixed(0)}%</span></div>
          <p style={{ ...mono, fontSize: 13, color: T.textMuted, marginTop: 8, marginBottom: 28, fontWeight: 500 }}>
            images processed
          </p>
          <div className={`clay-well progress-track ${loadingModel?"indeterminate":""}`} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={total} aria-label="Inference progress" style={{ position: "relative", height: 12, overflow: "hidden", borderRadius: 10 }}>
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
            <span style={{ ...mono, fontSize: 12, color: T.textMuted }}>{loadingModel?`0 of ${total} images processed`:`${Math.max(0,total-progress)} images remaining`}</span>
            <span style={{ ...mono, fontSize: 12, color: done ? T.success : T.accent, fontWeight: 600 }}>{done ? "✓ Complete" : loadingModel ? "Preparing…" : "Keep this tab open"}</span>
          </div>
        </div>

        {/* Detection Log Card */}
        <div className="clay-card activity-card" style={{ padding: 20, marginBottom: 20 }}>
          <div onClick={() => setLogOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none", marginBottom: logOpen ? 12 : 0 }}>
            <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: "0.06em", textTransform: "uppercase" }}>📋 Live Inference Log</span>
            <span style={{ ...mono, fontSize: 13, color: T.textMuted, transition: "transform 0.2s", transform: logOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
          </div>
          {logOpen && (
            <div ref={activityLogRef} className="clay-well activity-log" style={{ padding: "12px 16px", maxHeight: 150, overflowY: "auto" }}>
              {log.map((line, i) => (
                <p key={i} className={line.includes("total detections")?"log-live":line.includes("✓")?"log-success":line.includes("Error")||line.includes("Connection to the inference")?"log-error":"log-line"} style={{ ...mono, fontSize: 12, color: line.includes("✓") ? T.success : (line.includes("Error")||line.includes("Connection to the inference") ? T.danger : T.textSub), margin: "3px 0" }}>
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
  const [classOpen, setClassOpen] = useState(true);
  const [classQuery, setClassQuery] = useState("");
  const [classShowAll, setClassShowAll] = useState(false);
  const [data, setData] = useState(null);
  const [imageStats, setImageStats] = useState(null);
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

  useEffect(() => {
    fetch(`${API_BASE_URL}/${sessionId}/images`).then(r=>r.json()).then(images=>setImageStats({noDetections:images.filter(img=>img.detections===0).length})).catch(()=>setImageStats(null));
  }, [sessionId]);

  if(loadError) return <Shell stepLabel="Step 03 — Review" title="Run complete" onToggleTheme={onToggleTheme}>
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
    <Shell stepLabel="Step 03 — Review" title="Run complete" subtitle={`${summary.total_images} images processed. Download the dataset, or browse the images to check the detections.`} actions={<><button className="clay-btn-secondary" onClick={onRerun}>↻ Run again</button><button className="clay-btn-secondary" onClick={() => window.open(`${API_BASE_URL}/${sessionId}/export`, "_blank")}>↓ Download ZIP</button><button className="clay-btn-primary" onClick={()=>onViewImages("all")}>Browse images →</button></>} onToggleTheme={onToggleTheme}>
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
              <div className="histogram-bars" style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 130, paddingTop: 16 }}>
                {histogram.map((d, i) => {
                  const mx = Math.max(...histogram.map(x => x.count), 1);
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <span style={{ ...mono, fontSize: 11, color: T.textMuted, fontWeight: 600 }}>{d.count}</span>
                      <div className="clay-well" style={{ width: "100%", height: `${(d.count / mx) * 90}px`, position: "relative", overflow: "hidden", borderRadius: "8px 8px 0 0" }}>
                        <div style={{ position: "absolute", inset: 0, background: i < 2 ? "var(--warn-bar)" : T.accent, opacity: 0.9 }} />
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
              <h2>Where to look first</h2>
              <div className="review-list">
                <div className="review-row"><strong>{histogram.slice(0,2).reduce((n,b)=>n+b.count,0).toLocaleString()}</strong><div><b>Low-confidence boxes</b><span>{summary.total_detections ? `${(histogram.slice(0,2).reduce((n,b)=>n+b.count,0)/summary.total_detections*100).toFixed(1)}% of detections score below 0.4.` : "Scored below 0.4 across the run."}</span></div><button className="clay-btn-secondary" onClick={()=>onViewImages("low")}>Review</button></div>
                {imageStats && <div className="review-row"><strong>{imageStats.noDetections.toLocaleString()}</strong><div><b>Images with no detections</b><span>No .txt label is needed for these</span></div><button className="clay-btn-secondary" onClick={()=>onViewImages("none")}>Review</button></div>}
              </div>            </div>
          </div>
        </div>

        {classOpen && (
          <div className="clay-card page-enter class-dist-card" style={{ padding: 24, marginTop: 16 }}>
            <div className="class-dist-head"><div><h2>Class distribution</h2><span>{class_counts.length} classes, sorted by detections</span></div><input aria-label="Search classes" placeholder="Search classes" value={classQuery} onChange={e=>setClassQuery(e.target.value)} /></div>
            <div className="class-rows" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              {class_counts.filter(c=>c.name.toLowerCase().includes(classQuery.toLowerCase())).slice(0,classShowAll?class_counts.length:12).map((c, i) => (
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
            {class_counts.length>12 && <div className="show-all-classes"><button className="clay-btn-secondary" onClick={()=>setClassShowAll(v=>!v)}>{classShowAll?"Show fewer":`Show all ${class_counts.length} classes`}</button></div>}
          </div>
        )}
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAGE 4 — INFERENCED IMAGE VIEWER & DATASET BROWSER
// ─────────────────────────────────────────────────────────────────────────────
function Page4({ onBack, onToggleTheme, sessionId, analyticsData, initialQuickFilter = "all" }) {
  const T = useT();
  const [sort, setSort] = useState("high");
  const [quickFilter, setQuickFilter] = useState(initialQuickFilter);
  const [images, setImages] = useState([]);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [showLabels, setShowLabels] = useState(true);
  const [scale, setScale] = useState(1);
  const [imgDims, setImgDims] = useState({});
  const viewerRef = useRef(null);

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
    (selectedClasses.length === 0 || selectedClasses.some(c => (img.classes || []).includes(c))) &&
    (quickFilter === "all" || (quickFilter === "low" && img.detections > 0 && img.avgConf < 0.6) || (quickFilter === "none" && img.detections === 0))
  );

  const sorted = [...filtered].sort((a, b) =>
    sort === "high" ? b.detections - a.detections :
    sort === "low"  ? a.detections - b.detections : a.id - b.id
  );

  const activeModalImg = selectedIndex !== null ? sorted[selectedIndex] : null;

  useEffect(() => {
    if (!filterOpen) return;
    const handleOutside = e => {
      if (dropdownRef.current?.contains(e.target) || filterBtnRef.current?.contains(e.target)) return;
      setFilterOpen(false);
    };
    const handleKey = e => { if (e.key === "Escape") setFilterOpen(false); };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("mousedown", handleOutside); document.removeEventListener("keydown", handleKey); };
  }, [filterOpen]);

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

  useEffect(() => { setVisibleCount(12); }, [sorted.length, sort, selectedClasses.length, quickFilter]);

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

  useEffect(() => {
    if (selectedIndex === null || !viewerRef.current) return;
    const dialog = viewerRef.current;
    const previous = document.activeElement;
    const getFocusable = () => Array.from(dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),[tabindex="0"]'));
    getFocusable()[0]?.focus();
    const trapFocus = e => {
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    dialog.addEventListener("keydown", trapFocus);
    return () => { dialog.removeEventListener("keydown", trapFocus); previous?.focus?.(); };
  }, [selectedIndex]);

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

          <div className="browser-toolbar clay-card">
            <button className="clay-btn-secondary" onClick={onBack}>← Summary</button>
            <span className="toolbar-label">Sort</span>
            <div className="sort-segment" role="group" aria-label="Sort images">{[["high","Most detections"],["low","Fewest"],["orig","Original order"]].map(([value,label])=><button key={value} aria-pressed={sort===value} onClick={()=>setSort(value)}>{label}</button>)}</div>
            <div className="quick-filters" role="group" aria-label="Quick filters">{[["all","All images"],["low","Low confidence"],["none","No detections"]].map(([key,label])=><button key={key} className="filter-chip" aria-pressed={quickFilter===key} onClick={()=>setQuickFilter(key)}>{label}</button>)}</div>
            <span className="toolbar-spacer" />
            <button ref={filterBtnRef} className="clay-btn-secondary" onClick={()=>setFilterOpen(f=>!f)} aria-expanded={filterOpen}>Classes{selectedClasses.length?` (${selectedClasses.length})`:""}</button>
            <span className="image-count">{sorted.length} of {images.length} images</span>
          </div>
          {/* Filter Dropdown */}
          {analyticsData && analyticsData.class_counts && filterOpen && (
            <div ref={dropdownRef} className="clay-card page-enter class-popover" style={{
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
                      <div key={c.name} role="checkbox" aria-checked={active} tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggleClass(c.name);}}} onClick={() => toggleClass(c.name)} style={{
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
              <div className="class-popover-actions"><button className="link-button" onClick={()=>setSelectedClasses([])}>Clear</button><button className="clay-btn-primary" onClick={()=>setFilterOpen(false)}>Done</button></div>
            </div>
          )}

          {/* Clay Image Grid */}
          {sorted.length ? <div className="browser-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
            {visibleImages.map((img) => (
              <div key={img.id} className="clay-card clay-card-interactive" role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelectedIndex(sorted.indexOf(img));}}} onClick={() => setSelectedIndex(sorted.indexOf(img))}
                style={{ padding: 10, cursor: "pointer", overflow: "hidden" }}>
                <div style={{ aspectRatio: "4/3", background: T.wellBg, borderRadius: 12, position: "relative", overflow: "hidden" }}>
                  <img
                    src={`${API_BASE_URL}/${sessionId}/preview/${img.name}`}
                    onLoad={(e) => setImgDims(prev => ({ ...prev, [img.id]: { w: e.target.naturalWidth, h: e.target.naturalHeight } }))}
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                  />
                  {imgDims[img.id] && (
                    <svg viewBox={`0 0 ${imgDims[img.id].w} ${imgDims[img.id].h}`} preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                      {img.bboxes && img.bboxes.map((b, j) => {
                        const [x1, y1, x2, y2] = b.bbox;
                        const color = classColors[b.class_name] || T.accent;
                        const fZ = Math.max(8, imgDims[img.id].h * 0.012);
                        const label = `${b.class_name} ${b.confidence.toFixed(2)}`;
                        return (
                          <g key={j}>
                            <rect x={x1} y={y1} width={x2-x1} height={y2-y1} fill="none" stroke={color} strokeWidth={2} />
                            <rect x={x1} y={y1 - fZ - 3} width={(label.length * fZ * 0.6) + 4} height={fZ + 3} fill={color} opacity="0.9" />
                            <text x={x1 + 2} y={y1 - 3} fill="#FFFFFF" fontSize={fZ} fontFamily="'Plus Jakarta Sans', sans-serif" fontWeight="600">{label}</text>
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
                  <span title={img.name} style={{ ...mono, fontSize: 11, color: T.textSub, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.name}</span>
                  <span style={{ ...mono, fontSize: 11, color: img.avgConf >= 0.8 ? T.success : img.avgConf >= 0.6 ? T.warning : T.danger, fontWeight: 700 }}>{img.detections ? `${(img.avgConf * 100).toFixed(0)}%` : "—"}</span>
                </div>
              </div>
            ))}
          </div> : <div className="empty-browser clay-card"><h2>No images match these filters</h2><p>Clear a filter to see more images.</p><button className="clay-btn-secondary" onClick={()=>{setSelectedClasses([]);setQuickFilter("all");}}>Clear filters</button></div>}

          {visibleCount < sorted.length && <div ref={sentinelRef} style={{ height: 1 }} />}
        </div>
      </Shell>

      {/* FULLSCREEN INFERENCED IMAGE VIEWER MODAL */}
      {activeModalImg && ReactDOM.createPortal(
        <div ref={viewerRef} className="viewer-overlay" role="dialog" aria-modal="true" aria-label={`Image viewer: ${activeModalImg.name}`} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15,23,42,0.96)", backdropFilter: "blur(12px)", zIndex: 99999, display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div className="viewer-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${T.cardBorder}`, background: T.clayBg }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button className="clay-btn-secondary" aria-label="Close viewer (Esc)" onClick={() => { setSelectedIndex(null); setScale(1); }} style={{ padding: "6px 14px", fontSize: 12 }}>✕ Close</button>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button className="clay-btn-secondary" aria-label="Previous image" onClick={() => { setSelectedIndex(p => p <= 0 ? sorted.length - 1 : p - 1); setScale(1); }} style={{ padding: "4px 10px", fontSize: 13 }} title="Previous Image (←)">◀</button>
                <button className="clay-btn-secondary" aria-label="Next image" onClick={() => { setSelectedIndex(p => p >= sorted.length - 1 ? 0 : p + 1); setScale(1); }} style={{ padding: "4px 10px", fontSize: 13 }} title="Next Image (→)">▶</button>
              </div>
              <span style={{ ...mono, fontSize: 14, color: "#fff", fontWeight: 700 }}>{activeModalImg.name}</span>
              <span style={{ ...mono, fontSize: 12, color: T.textMuted }}>{selectedIndex + 1} / {sorted.length}</span>
            </div>

            <div className="viewer-controls" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="clay-btn-secondary" role="switch" aria-checked={showLabels} aria-label="Show boxes" onClick={() => setShowLabels(!showLabels)} style={{ padding: "6px 14px", fontSize: 12 }}>
                {showLabels ? "Hide Bboxes" : "Show Bboxes"}
              </button>
              <button className="clay-btn-secondary" aria-label="Zoom out" onClick={() => setScale(s => Math.max(0.5, s - 0.25))} style={{ padding: "4px 10px", fontSize: 16 }}>-</button>
              <input aria-label="Zoom" type="range" min="50" max="400" step="10" value={Math.round(scale*100)} onChange={e=>setScale(+e.target.value/100)} />
              <span style={{ ...mono, fontSize: 12, color: T.textMuted }}>{Math.round(scale * 100)}%</span>
              <button className="clay-btn-secondary" aria-label="Zoom in" onClick={() => setScale(s => Math.min(4, s + 0.25))} style={{ padding: "4px 10px", fontSize: 14 }}>+</button>
              <button className="clay-btn-secondary" onClick={()=>setScale(1)}>Fit</button>
            </div>
          </div>

          {/* Canvas & Detections Sidebar */}
          <div className="viewer-content" style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* Canvas */}
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <div className="viewer-image-stage" style={{ "--viewer-zoom": `${Math.max(scale,1)*100}%`, position: "absolute", inset: 0, transform: `scale(${scale})`, transformOrigin: "center center", transition: "transform 0.2s ease-out" }}>
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
                          <text x={x1 + 3} y={Math.max(fZ, y1 - 3)} fill="#FFFFFF" fontSize={fZ} fontFamily="'Plus Jakarta Sans', sans-serif" fontWeight="600">{label}</text>
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>
            </div>

            {/* Right Side Detections Summary Panel */}
            <div className="viewer-sidebar" style={{ width: 300, background: T.clayBg, borderLeft: `1px solid ${T.cardBorder}`, display: "flex", flexDirection: "column", zIndex: 30 }}>
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
function ImageExtractionPage({ onToggleTheme, onBack }) {
  const T = useT();
  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [columnIndex, setColumnIndex] = useState("");
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ progress:0, total:0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const selectFile = async (nextFile) => {
    setFile(nextFile); setColumns([]); setColumnIndex(""); setResult(null); setError("");
    if (!nextFile) return;
    setLoadingColumns(true);
    try {
      const body = new FormData(); body.append("file", nextFile);
      const response = await fetch(`${API_ROOT}/api/extract/columns`, { method:"POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not read spreadsheet");
      setColumns(data.columns || []);
      if (!data.columns?.length) throw new Error("No columns were found in the first row");
    } catch (err) { setError(err.message || "Could not read spreadsheet"); }
    finally { setLoadingColumns(false); }
  };

  const startDownload = async () => {
    if (!file || columnIndex === "") return;
    setRunning(true); setResult(null); setError(""); setProgress({ progress:0, total:0 });
    try {
      const body = new FormData(); body.append("file", file); body.append("column_index", columnIndex);
      const response = await fetch(`${API_ROOT}/api/extract/run`, { method:"POST", body });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.detail || "Image extraction could not start"); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream:!done });
        const events = buffer.split("\n\n"); buffer = events.pop() || "";
        for (const event of events) {
          const line = event.split("\n").find(part => part.startsWith("data: "));
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          if (data.error) throw new Error(data.error);
          if (data.progress !== undefined) setProgress({ progress:data.progress, total:data.total });
          if (data.done) { setResult(data); finished = true; }
        }
        if (done) finished = true;
      }
    } catch (err) { setError(err.message || "Image extraction failed"); }
    finally { setRunning(false); }
  };

  return <Shell title="Image Extraction" subtitle="Choose a spreadsheet column containing public image links, then download the images as a ZIP." onToggleTheme={onToggleTheme} showSteps={false} actions={<button className="clay-btn-secondary" onClick={onBack}>← Back to Labeler</button>}>
    <section className="clay-card" style={{ maxWidth:900, margin:"0 auto", padding:28 }}>
      <div style={{ marginBottom:24 }}>
        <label style={lbl(T)} htmlFor="extract-sheet">1. Choose an Excel or CSV file</label>
        <input id="extract-sheet" type="file" accept=".xlsx,.csv" onChange={e=>selectFile(e.target.files?.[0] || null)} style={{ display:"block", width:"100%", padding:14, border:`1px dashed ${T.accentBorder}`, borderRadius:12, background:T.wellBg, color:T.text }} />
        {file && <p style={{ marginTop:8, color:T.textSub, fontSize:13 }}>{file.name}</p>}
      </div>
      {loadingColumns && <p style={{ color:T.textSub, marginBottom:20 }}>Reading spreadsheet headers…</p>}
      {columns.length > 0 && <div style={{ marginBottom:24 }}>
        <label style={lbl(T)} htmlFor="extract-column">2. Select the column that contains image links</label>
        <window.NeosisToolkit.Select ariaLabel="Choose the spreadsheet column containing image links" value={columnIndex} onChange={value=>{setColumnIndex(value);setResult(null);setError("");}} placeholder="Choose a column…" options={columns.map(col=>({value:String(col.index),label:col.name}))} style={{width:"100%"}} />
      </div>}
      {error && <div role="alert" className="upload-error-banner" style={{ marginBottom:18 }}><strong>Could not complete extraction</strong><span>{error}</span></div>}
      {running && <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:13, color:T.textSub }}><span>Downloading images…</span><span>{progress.progress} / {progress.total}</span></div>
        <progress value={progress.progress} max={Math.max(progress.total,1)} style={{ width:"100%", height:12, accentColor:T.accent }} />
      </div>}
      {result && <div style={{ borderRadius:12, padding:16, marginBottom:20, background:T.wellBg, color:T.text }}>
        <strong>Extraction complete</strong>
        <p style={{ marginTop:8, color:T.textSub }}>{result.saved} downloaded · {result.failed?.length || 0} failed</p>
        <a className="clay-btn-primary" style={{ display:"inline-block", marginTop:12, textDecoration:"none" }} href={`${API_ROOT}${result.download_url}`} download={result.filename}>Download {result.filename}</a>
        {!!result.failed?.length && <details style={{ marginTop:16 }}><summary style={{ cursor:"pointer", fontWeight:700 }}>Failed links ({result.failed.length})</summary><div style={{ maxHeight:280, overflow:"auto", marginTop:10 }}>{result.failed.map((item,i)=><p key={i} style={{ padding:"8px 0", borderTop:`1px solid ${T.cardBorder}`, fontSize:12, overflowWrap:"anywhere" }}>Excel row {item.row}{item.link ? `, link ${item.link}` : ""}: {item.error} <span style={{ color:T.textMuted }}>{item.url}</span></p>)}</div></details>}
      </div>}
      <button className="clay-btn-primary" onClick={startDownload} disabled={!file || columnIndex === "" || running || loadingColumns}>{running ? "Downloading…" : "Download images as ZIP"}</button>
      <p style={{ marginTop:14, fontSize:12, lineHeight:1.6, color:T.textMuted }}>Links must be public direct image URLs. The selected column is read from the spreadsheet’s first row of headers.</p>
    </section>
  </Shell>;
}

function App() {
  const routePage = (hash=window.location.hash) => {
    if (hash === "#/labeler") return 1;
    if (hash === "#/extract") return 5;
    if (hash === "#/testing-images" || hash.startsWith("#/testing-images/")) return 6;
    if (hash === "#/packshots" || hash.startsWith("#/packshots/")) return 7;
    if (hash === "#/model-dashboard") return 11;
    if (hash === "#/accuracy-report") return 12;
    if (hash === "#/control-panel") return 10;
    return 8;
  };
  const routeBrandSlug = (hash, route) => {
    if (!hash.startsWith(route + "/")) return "";
    try { return decodeURIComponent(hash.slice(route.length + 1)); } catch (_) { return ""; }
  };
  const [routeHash, setRouteHash] = useState(() => window.location.hash || "#/");
  const [page,       setPage]     = useState(() => routePage(window.location.hash));
  const [browseInitialFilter, setBrowseInitialFilter] = useState("all");
  const [isDark,     setDark]     = useState(() => {
    let selected;
    try { const stored = localStorage.getItem("neosis-theme"); if (stored) selected = stored === "dark"; } catch (_) {}
    if (selected === undefined) selected = false;
    document.documentElement.dataset.theme = selected ? "dark" : "light";
    return selected;
  });
  const [sessionId,  setSessionId]= useState(null);
  const [conf,       setConf]     = useState(0.25);
  const [iou,        setIou]      = useState(0.45);
  const [agnosticNms, setAgnosticNms] = useState(true);
  const [advData,    setAdvData]  = useState(null);

  const theme = isDark ? DARK : LIGHT;

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    try { localStorage.setItem("neosis-theme", isDark ? "dark" : "light"); } catch (_) {}
  }, [isDark]);

  useEffect(() => { injectFonts(); }, []);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash || "#/";
      setRouteHash(hash);
      setPage(routePage(hash));
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  return (
    <PageCtx.Provider value={page}>
      <ThemeCtx.Provider value={theme}>
        <>
        <style>{buildCSS(theme)}</style>
        <style id="neosis-design">{IR_DESIGN_CSS}</style>
        {page === 1 && <Page1 onNext={() => setPage(2)} onToggleTheme={() => setDark(d => !d)} setSessionArgs={(id, c, i, nms) => { setSessionId(id); setConf(c); setIou(i); setAgnosticNms(nms); }} />}
        {page === 2 && <Page2 onNext={() => setPage(3)} onBack={() => setPage(1)} onToggleTheme={() => setDark(d => !d)} sessionId={sessionId} conf={conf} iou={iou} agnosticNms={agnosticNms} />}
        {page === 3 && <Page3 onViewImages={(filter="all") => { setBrowseInitialFilter(filter); setPage(4); }} onRerun={() => setPage(1)} onToggleTheme={() => setDark(d => !d)} sessionId={sessionId} setAnalyticsData={setAdvData} />}
        {page === 4 && <Page4 onBack={() => setPage(3)} onToggleTheme={() => setDark(d => !d)} sessionId={sessionId} analyticsData={advData} initialQuickFilter={browseInitialFilter} />}
        {page === 5 && <ImageExtractionPage onBack={() => { window.location.hash = "#/labeler"; }} onToggleTheme={() => setDark(d => !d)} />}
        {page === 6 && <window.NeosisToolkit.TestingImagesPage Shell={Shell} onToggleTheme={() => setDark(d => !d)} selectedSlug={routeBrandSlug(routeHash,"#/testing-images")} />}
        {page === 7 && <window.NeosisToolkit.PackshotsPage Shell={Shell} onToggleTheme={() => setDark(d => !d)} selectedSlug={routeBrandSlug(routeHash,"#/packshots")} />}
        {page === 8 && <window.NeosisToolkit.HomePage Shell={Shell} onToggleTheme={() => setDark(d => !d)} />}
        {page === 9 && <window.NeosisToolkit.ComingSoonPage Shell={Shell} onToggleTheme={() => setDark(d => !d)} title={routeHash==="#/model-dashboard"?"Model Dashboard":routeHash==="#/accuracy-report"?"Accuracy Report":"Control Panel"} />}
        {page === 10 && <window.NeosisToolkit.ControlPanelPage Shell={Shell} onToggleTheme={() => setDark(d => !d)} />}
        {page === 11 && <window.NeosisToolkit.ModelDashboardPage Shell={Shell} onToggleTheme={() => setDark(d => !d)} />}
        {page === 12 && <window.NeosisToolkit.AccuracyReportPage Shell={Shell} onToggleTheme={() => setDark(d => !d)} />}
        </>
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
