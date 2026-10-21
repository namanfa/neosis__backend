const TOOL_API = (window.NOESIS_API_URL || "http://localhost:7860/api/sessions").replace(/\/api\/sessions\/?$/, "") + "/api/tools";
const TOOL_IMAGE_TYPES = new Set(["jpg", "jpeg", "png", "webp"]);
const TOOL_BATCH_SIZE = 16;
const TOOL_BATCH_BYTE_LIMIT = 60 * 1024 * 1024;
const TOOL_DATA_CACHE = new Map();
const TOOL_DATA_INFLIGHT = new Map();

function markToolkitMetric(name) {
  if (!window.performance?.mark) return;
  requestAnimationFrame(() => {
    try {
      performance.mark(name);
      if (!performance.getEntriesByName("neosis-app-start", "mark").length) performance.mark("neosis-app-start");
      performance.measure(`${name}-from-app-start`, "neosis-app-start", name);
    } catch (_) {}
  });
}

function ToolkitIcon({ name="label", size=22 }) {
  const paths={label:<><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8m-8 4h5"/></>,extract:<><path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/></>,upload:<><path d="M12 16V4m-5 5 5-5 5 5"/><path d="M5 14v6h14v-6"/></>,testing:<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/></>,packshots:<><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v10l9 5 9-5V8M12 13v10"/></>,dashboard:<><path d="M4 19V5m0 14h16M8 15l3-4 3 2 5-7"/></>,accuracy:<><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5m-9 5 2 2 4-4"/></>,check:<path d="m5 12 4 4L19 6"/>,edit:<><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/></>,arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,folder:<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></>,box:<><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9"/></>,chip:<><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 9h6v6H9zM9 2v4m6-4v4m-6 12v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/></>,download:<><path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 20h14"/></>,file:<><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></>,close:<path d="m6 6 12 12M18 6 6 18"/>};
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.label}</svg>;
}

function resolveToolkitImageUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const apiOrigin = TOOL_API.replace(/\/api\/tools\/?$/, "");
  return new URL(url, `${apiOrigin}/`).toString();
}

async function toolJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error=new Error(data.detail || `Request failed (${response.status})`);error.status=response.status;throw error; }
  return data;
}

function invalidateToolCache(brandSlug) {
  for (const key of TOOL_DATA_CACHE.keys()) {
    if (key.endsWith("/brands") || !brandSlug || key.includes(`/testing/${encodeURIComponent(brandSlug)}/images`) || key.includes(`/packshots/${encodeURIComponent(brandSlug)}`)) TOOL_DATA_CACHE.delete(key);
  }
}

async function refreshToolCache(url, cached) {
  if (TOOL_DATA_INFLIGHT.has(url)) return TOOL_DATA_INFLIGHT.get(url);
  const request = (async () => {
    const headers = new Headers();
    if (cached?.etag) headers.set("If-None-Match", cached.etag);
    const response = await fetch(url, { headers });
    if (response.status === 304 && cached) return cached.data;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
    TOOL_DATA_CACHE.set(url, { data, etag: response.headers.get("ETag") || "" });
    return data;
  })().finally(() => TOOL_DATA_INFLIGHT.delete(url));
  TOOL_DATA_INFLIGHT.set(url, request);
  return request;
}

async function cachedToolJson(url, onUpdate) {
  const cached = TOOL_DATA_CACHE.get(url);
  if (cached) {
    refreshToolCache(url, cached).then(data => onUpdate?.(data)).catch(() => {});
    return cached.data;
  }
  return refreshToolCache(url, null);
}

function uploadBatches(files) {
  const result = [];
  let batch = [], bytes = 0;
  for (const file of files) {
    if (batch.length && (batch.length >= TOOL_BATCH_SIZE || bytes + file.size > TOOL_BATCH_BYTE_LIMIT)) {
      result.push(batch); batch = []; bytes = 0;
    }
    batch.push(file); bytes += file.size;
  }
  if (batch.length) result.push(batch);
  return result;
}

function imageFiles(files) {
  return Array.from(files || []).filter(file => TOOL_IMAGE_TYPES.has(file.name.split(".").pop().toLowerCase()));
}

function cleanFolderPath(file) {
  const path = file.webkitRelativePath || file.name;
  const parts = path.split("/");
  return (parts.length > 1 ? parts.slice(1) : parts).join("/");
}

function normalizeImageName(value) {
  return String(value || "").replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/, "").trim().toLowerCase();
}

function AppSelect({ value, onChange, options, placeholder="Choose an option", ariaLabel="Choose an option", style={} }) {
  const [open,setOpen]=React.useState(false), [active,setActive]=React.useState(0), [position,setPosition]=React.useState(null);
  const triggerRef=React.useRef(null), menuRef=React.useRef(null), optionRefs=React.useRef([]);
  const selected=options.find(option=>String(option.value)===String(value));
  const usable=options.filter(option=>!option.disabled);
  function close(restore=false){setOpen(false);if(restore)triggerRef.current?.focus();}
  function openMenu(){const r=triggerRef.current.getBoundingClientRect(),h=Math.min(280,window.innerHeight-24),menuH=Math.min(h,options.length*42+12),below=window.innerHeight-r.bottom>=menuH+8,top=below?r.bottom+6:Math.max(12,r.top-menuH-6);setPosition({left:Math.max(12,Math.min(r.left,window.innerWidth-r.width-12)),top:below?top:undefined,bottom:below?undefined:window.innerHeight-r.top+6,width:r.width,maxHeight:h});setActive(Math.max(0,usable.findIndex(o=>String(o.value)===String(value))));setOpen(true);}
  React.useEffect(()=>{if(open)optionRefs.current[active]?.focus();},[open,active]);
  React.useEffect(()=>{if(!open)return;const update=()=>{const r=triggerRef.current?.getBoundingClientRect();if(r)setPosition(p=>p?{...p,left:Math.max(12,Math.min(r.left,window.innerWidth-r.width-12)),top:p.bottom===undefined?r.bottom+6:undefined,bottom:p.bottom===undefined?undefined:window.innerHeight-r.top+6,width:r.width}:p);};const outside=e=>{if(!triggerRef.current?.contains(e.target)&&!menuRef.current?.contains(e.target))close();};window.addEventListener("resize",update);window.addEventListener("scroll",update,true);document.addEventListener("pointerdown",outside);return()=>{window.removeEventListener("resize",update);window.removeEventListener("scroll",update,true);document.removeEventListener("pointerdown",outside);};},[open]);
  function keyDown(e,index=-1){if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close(true);return;}if(e.key==="Tab"){close();return;}if(["ArrowDown","ArrowUp","Home","End"].includes(e.key)){e.preventDefault();if(!open)openMenu();else if(e.key==="Home")setActive(0);else if(e.key==="End")setActive(Math.max(0,usable.length-1));else setActive((index+(e.key==="ArrowDown"?1:usable.length-1))%usable.length);}if((e.key==="Enter"||e.key===" ")&&index>=0){e.preventDefault();const option=usable[index];if(option){onChange(option.value);close(true);}}}
  const firstAction=options.findIndex(option=>option.action);
  return <><button ref={triggerRef} type="button" className="neosis-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={()=>open?close():openMenu()} onKeyDown={e=>keyDown(e,-1)} style={style}><span>{selected?.label||placeholder}</span><span className={`neosis-select-chevron${open?" open":""}`} aria-hidden="true">⌄</span></button>{open&&position&&ReactDOM.createPortal(<div ref={menuRef} className="neosis-select-menu" role="listbox" aria-label={ariaLabel} style={{position:"fixed",left:position.left,top:position.top,bottom:position.bottom,width:position.width,maxHeight:position.maxHeight,overflowY:"auto",zIndex:8000}}>{options.map((option,optionIndex)=>{const index=usable.indexOf(option),isSelected=String(option.value)===String(value);return <React.Fragment key={String(option.value)}>{optionIndex===firstAction&&optionIndex>0&&<div className="neosis-select-separator" role="separator"/>}<button ref={node=>{if(index>=0)optionRefs.current[index]=node;}} type="button" role="option" aria-selected={isSelected} disabled={option.disabled} className={`neosis-select-option${option.action?" action":""}`} onMouseEnter={()=>index>=0&&setActive(index)} onClick={()=>{if(!option.disabled){onChange(option.value);close(true);}}} onKeyDown={e=>keyDown(e,index)}><span>{option.label}</span>{isSelected&&<ToolkitIcon name="check" size={16}/>}</button></React.Fragment>;})}</div>,document.body)}</>;
}

function ToolNotice({ error, success }) {
  if (error) return <div className="tool-notice error" role="alert"><ToolkitIcon name="accuracy" size={18}/><span>{error}</span></div>;
  if (success) return <div className="tool-notice success" role="status"><ToolkitIcon name="check" size={18}/><span>{success}</span></div>;
  return null;
}

function ToolPageShell({ Shell, title, titleContent, subtitle, children, onToggleTheme, onBack, backLink, actions }) {
  return <Shell title={title} titleContent={titleContent} subtitle={subtitle} backLink={backLink || (onBack && <button className="neosis-back-link" onClick={onBack}>← Back to tools</button>)} actions={actions} onToggleTheme={onToggleTheme} showSteps={false}>{children}</Shell>;
}

const TOOL_CARDS = [
  { title:"Pseudo Labelling", description:"Run a model over a folder of images and review the predicted labels, class by class.", icon:"label", route:"#/labeler" },
  { title:"Image Extraction", description:"Turn a column of image links in an Excel or CSV file into a ZIP of downloaded images.", icon:"extract", route:"#/extract", utility:true },
  { title:"Testing Images", description:"Browse test images by brand, filter by asset, and add new images for the team.", icon:"testing", route:"#/testing-images", utility:true },
  { title:"Packshots", description:"Reference packshots for each brand, with annotation names, names and IDs.", icon:"packshots", route:"#/packshots", utility:true },
  { title:"Model Dashboard", description:"Track model versions and accuracy for every brand in one place.", icon:"dashboard", soon:true },
  { title:"Accuracy Doc", description:"Generate an accuracy report for a model against the standard image set.", icon:"accuracy", soon:true },
];

function HomePage({ Shell, onToggleTheme }) {
  const [query,setQuery]=React.useState("");
  React.useEffect(()=>{const update=event=>setQuery(event.detail||"");window.addEventListener("ir-search",update);return()=>window.removeEventListener("ir-search",update);},[]);
  const matches=card=>!query.trim()||`${card.title} ${card.description}`.toLowerCase().includes(query.trim().toLowerCase());
  const core=TOOL_CARDS.filter(card=>!card.utility&&matches(card)), utilities=TOOL_CARDS.filter(card=>card.utility&&matches(card));
  const firstName=(window.IR_USER?.name||"").trim().split(/\s+/)[0];
  const welcomeCopy=`Welcome to Neosis${firstName?", "+firstName:""}. Choose a workflow to get started.`;
  return <ToolPageShell Shell={Shell} title="Dashboard" subtitle={welcomeCopy} onToggleTheme={onToggleTheme}>
    {core.length>0&&<section className="dashboard-section" aria-labelledby="core-workflows-title"><h2 id="core-workflows-title" className="dashboard-section-title"><ToolkitIcon name="box" size={20}/>Core Workflows</h2><div className="dashboard-core-grid">
      {core.map(card=>card.soon?<div key={card.title} aria-disabled="true" className="clay-card dashboard-workflow dashboard-workflow-upcoming"><span className="dashboard-workflow-top"><span className="dashboard-icon" aria-hidden="true"><ToolkitIcon name={card.icon} size={20}/></span><strong>{card.title}<em className="upcoming-pill">Upcoming</em></strong></span><small>{card.description}</small></div>:<button key={card.title} onClick={()=>{window.location.hash=card.route;}} className="clay-card clay-card-interactive dashboard-workflow" type="button"><span className="dashboard-workflow-top"><span className="dashboard-icon" aria-hidden="true"><ToolkitIcon name={card.icon} size={20}/></span><strong>{card.title}</strong></span><small>{card.description}</small></button>)}
    </div></section>}
    {utilities.length>0&&<section className="dashboard-section dashboard-utilities" aria-labelledby="utilities-title"><h2 id="utilities-title" className="dashboard-section-title"><ToolkitIcon name="chip" size={20}/>Utilities</h2><div className="dashboard-core-grid dashboard-utility-grid">{utilities.map(card=>card.soon?<div key={card.title} aria-disabled="true" className="clay-card dashboard-workflow dashboard-workflow-upcoming"><span className="dashboard-workflow-top"><span className="dashboard-icon" aria-hidden="true"><ToolkitIcon name={card.icon} size={20}/></span><strong>{card.title}<em className="upcoming-pill">Upcoming</em></strong></span><small>{card.description}</small></div>:<button key={card.title} onClick={()=>card.route&&(window.location.hash=card.route)} className="clay-card clay-card-interactive dashboard-workflow" type="button"><span className="dashboard-workflow-top"><span className="dashboard-icon" aria-hidden="true"><ToolkitIcon name={card.icon} size={20}/></span><strong>{card.title}</strong></span><small>{card.description}</small></button>)}</div></section>}
    {!core.length&&!utilities.length&&<div className="clay-card dashboard-empty"><h2>No tools match “{query}”</h2><p>Try another search term.</p></div>}
  </ToolPageShell>;
}
function BrandPicker({ brands, countKey, countLabel, assetCountKey, onPick, selectedSlug, emptyText }) {
  const visibleBrands=brands.filter(brand=>Number(brand[countKey])>0);
  if (!visibleBrands.length) return <div className="clay-card" style={{ padding:26, color:"var(--text-2)" }}>{emptyText}</div>;
  return <div className="brand-grid">
    {visibleBrands.map(brand => { const count=Number(brand[countKey])||0; const meta=`${count} ${countLabel}${count===1?"":"s"}${assetCountKey?` · ${brand[assetCountKey]?.length||0} assets`:""}`; return <button key={brand.slug} onClick={() => onPick(brand)} className="clay-card clay-card-interactive brand-card" aria-current={selectedSlug===brand.slug?"true":undefined}>
      {brand.logo_url?<span className="brand-mark brand-mark-logo"><img src={resolveToolkitImageUrl(brand.logo_url)} alt="" loading="lazy"/></span>:<span className={`brand-mark${count?"":" brand-mark-empty"}`} aria-hidden="true">{brand.name.slice(0,2).toUpperCase()}</span>}<span className="brand-card-copy"><b title={brand.name}>{brand.name}</b><small>{meta}</small></span><span className="brand-card-arrow"><ToolkitIcon name="arrow" size={16}/></span>
    </button>;})}
  </div>;
}

function UploadDialog({ mode, brands, onClose, onComplete, onAssetNamesUpdated }) {
  const [brandSlug, setBrandSlug] = React.useState("");
  const [newBrandName, setNewBrandName] = React.useState("");
  const [newBrand, setNewBrand] = React.useState(false);
  const [files, setFiles] = React.useState([]);
  const [mapping, setMapping] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState("");
  const [assetNameSuccess, setAssetNameSuccess] = React.useState("");
  const [logoWarning, setLogoWarning] = React.useState("");
  const [summary, setSummary] = React.useState(null);
  const folderRef = React.useRef(null);
  const mappingRef = React.useRef(null);
  const logoRef = React.useRef(null);
  const [logoFile, setLogoFile] = React.useState(null);
  const logoPreview = React.useMemo(() => logoFile ? URL.createObjectURL(logoFile) : "", [logoFile]);
  const dialogRef = React.useRef(null);
  const closeButtonRef = React.useRef(null);
  const onCloseRef = React.useRef(onClose);
  const busyRef = React.useRef(busy);
  onCloseRef.current = onClose;
  busyRef.current = busy;

  React.useEffect(() => {
    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();
    const handleKeys = event => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeys);
    return () => { document.removeEventListener("keydown", handleKeys); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  React.useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); }, [logoPreview]);

  async function updateExistingAssetNames() {
    if (mode !== "testing" || newBrand || !brandSlug) { setError("Choose an existing brand first."); return; }
    const paths = imageFiles(files).map(cleanFolderPath);
    if (!paths.some(path => path.includes("/"))) { setError("Choose the original folder that contains the asset folders."); return; }
    setBusy(true); setError(""); setAssetNameSuccess("");
    try {
      const result = await toolJson(`${TOOL_API}/testing/${encodeURIComponent(brandSlug)}/asset-names`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(paths) });
      invalidateToolCache(brandSlug);
      await onAssetNamesUpdated?.(brandSlug);
      setAssetNameSuccess(`Updated ${result.updated} existing asset name${result.updated===1?"":"s"}. No images were uploaded.`);
    } catch (err) { setError(err.message || "Could not update asset names."); }
    finally { setBusy(false); }
  }

  async function handleUpload() {
    setError(""); setLogoWarning(""); setSummary(null);
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) { setError("Choose a folder first."); return; }
    if (mode === "packshots" && !mapping) { setError("Choose the mapping sheet for these packshots."); return; }
    setBusy(true); setProgress(0);
    try {
      let slug = brandSlug;
      let logoUploadWarning = "";
      if (newBrand) {
        const created = await toolJson(`${TOOL_API}/brands`, { method:"POST", body:new URLSearchParams({ name:newBrandName }) });
        slug = created.slug;
        if (logoFile) {
          try { const logoForm=new FormData();logoForm.append("logo",logoFile,logoFile.name);const saved=await toolJson(`${TOOL_API}/brands/${encodeURIComponent(slug)}/logo`,{method:"POST",body:logoForm});if(saved.logo_warning)throw new Error(saved.logo_warning); }
          catch(err) { logoUploadWarning=`Brand created; its logo could not be saved. ${err.message||"You can add it later."}`;setLogoWarning(logoUploadWarning); }
        }
      }
      if (!slug) throw new Error("Choose an existing brand or add a new one.");
      let ignored = 0, added = 0, failed = 0;
      const failures = [];
      const sheetRows = mode === "packshots" ? mapping.rows : null;
      const rowNames = new Set(Object.keys(sheetRows || {}));
      const foundNames = new Set();
      const batches = uploadBatches(selectedFiles);
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const form = new FormData();
        if (mode === "testing") {
          const paths = [];
          batch.forEach(file => { form.append("files", file, file.name); paths.push(cleanFolderPath(file)); });
          form.append("relative_paths", JSON.stringify(paths));
        } else {
          const rows = [];
          batch.forEach(file => {
            form.append("files", file, file.name);
            const stem = normalizeImageName(file.name);
            if (TOOL_IMAGE_TYPES.has(file.name.split(".").pop().toLowerCase())) foundNames.add(stem);
            const row = sheetRows[stem];
            rows.push(row ? { annotation_name:row.annotation_name, name:row.name, id:row.id } : null);
          });
          form.append("mapping_rows", JSON.stringify(rows));
        }
        const result = await toolJson(`${TOOL_API}/${mode}/${encodeURIComponent(slug)}/upload`, { method:"POST", body:form });
        added += result.added; ignored += result.ignored; failed += result.failed; failures.push(...(result.failures || []));
        setProgress(Math.min(100, Math.round(((batchIndex + 1) / batches.length) * 100)));
      }
      const missingRows = mode === "packshots" ? [...rowNames].filter(name => !foundNames.has(name)).map(name => sheetRows[name].image_name || name) : [];
      const result = { added, ignored, failed, failures, missingRows, logoWarning:logoUploadWarning };
      invalidateToolCache(slug);
      setSummary(result);
      await onComplete(slug, result);
    } catch (err) { setError(err.message || "Upload failed."); }
    finally { setBusy(false); }
  }

  async function prepareMapping(file) {
    if(!file){setMapping(null);return;}
    setError("");
    try { const form=new FormData();form.append("mapping",file);setMapping(await toolJson(`${TOOL_API}/packshots/prepare`,{method:"POST",body:form})); }
    catch(err) { setMapping(null);setError(err.message); }
  }

  const usableBrands = brands;
  return <div className="toolkit-modal-overlay" role="dialog" aria-modal="true" aria-label={mode === "testing" ? "Upload testing images" : "Upload packshots"}>
    <section ref={dialogRef} className="clay-card toolkit-modal">
      <header className="toolkit-modal-head"><h2>{mode === "testing" ? "Upload testing images" : "Upload packshots"}</h2><button ref={closeButtonRef} type="button" className="app-icon-btn" aria-label="Close upload dialog" onClick={onClose} disabled={busy}><ToolkitIcon name="close" size={18}/></button></header>
      <div className="toolkit-modal-body">
      <div style={{ marginTop:20, display:"flex", alignItems:"center", gap:10 }}>
        <label style={{ display:"flex", alignItems:"center", gap:7 }}><input type="radio" checked={!newBrand} onChange={() => setNewBrand(false)} /> Existing brand</label>
        <label style={{ display:"flex", alignItems:"center", gap:7 }}><input type="radio" checked={newBrand} onChange={() => setNewBrand(true)} /> Add new brand</label>
      </div>
      {newBrand ? <input value={newBrandName} onChange={e=>setNewBrandName(e.target.value)} placeholder="Brand name" style={{ width:"100%", marginTop:12, padding:12, borderRadius:9, border:"1px solid var(--border-strong)", background:"var(--surface-2)", color:"var(--text)" }} /> : <AppSelect ariaLabel="Choose a brand" value={brandSlug} onChange={setBrandSlug} placeholder="Choose a brand" options={usableBrands.map(brand=>({value:brand.slug,label:brand.name}))} style={{width:"100%",marginTop:12}} />}
      {newBrand && <p style={{ marginTop:6, color:"var(--text-3)", fontSize:12 }}>Brand names that match an existing brand after case and space normalization are rejected.</p>}
      {newBrand && <div className="toolkit-field"><label className="ir-label">Brand logo (optional)</label><div className="toolkit-logo-picker"><input ref={logoRef} className="toolkit-hidden-file" type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" onChange={event=>setLogoFile(event.target.files?.[0]||null)}/>{logoPreview&&<img src={logoPreview} alt="Logo preview"/>}<span>{logoFile?.name||"Choose a logo"}</span><button type="button" className="clay-btn-secondary toolbar-sm" onClick={()=>logoRef.current?.click()}>Choose logo</button></div><small>PNG, JPG, WebP or SVG. Maximum 1 MB.</small></div>}
      <div className="toolkit-field"><label className="ir-label">Image folder</label><div className="toolkit-drop-zone" role="button" tabIndex={0} onClick={()=>folderRef.current?.click()} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();folderRef.current?.click();}}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();setFiles(e.dataTransfer.files||[]);}}><span className="toolkit-drop-icon"><ToolkitIcon name="folder" size={20}/></span><strong>{files.length?`${files.length} files selected`:"Drop a folder here, or choose one"}</strong><small>Image files and subfolders are included</small><input onClick={e=>e.stopPropagation()} ref={folderRef} className="toolkit-hidden-file" type="file" webkitdirectory="" directory="" multiple onChange={e=>setFiles(e.target.files || [])} /></div></div>
      {mode === "packshots" && <div className="toolkit-field"><label className="ir-label">SKU mapping sheet (.xlsx or .csv)</label><div className="toolkit-drop-zone toolkit-drop-compact" role="button" tabIndex={0} onClick={()=>mappingRef.current?.click()} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();mappingRef.current?.click();}}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();prepareMapping(e.dataTransfer.files?.[0]);}}><span className="toolkit-drop-icon"><ToolkitIcon name="file" size={20}/></span><strong>{mapping?.filename||"Choose or drop the mapping sheet"}</strong><small>{mapping?`${Object.keys(mapping.rows).length} mapping rows loaded`:"Accepted formats: XLSX or CSV"}</small><input onClick={e=>e.stopPropagation()} ref={mappingRef} className="toolkit-hidden-file" type="file" accept=".xlsx,.csv" onChange={e=>prepareMapping(e.target.files?.[0])} /></div><small>Rows in the sheet replace edited labels.</small></div>}
      <ToolNotice error={error} success={assetNameSuccess} />{logoWarning&&<div className="tool-notice error" role="status">{logoWarning}</div>}
      {busy && <div style={{ marginTop:18 }}><div style={{ height:8, borderRadius:9, background:"var(--surface-3)", overflow:"hidden" }}><div style={{ height:"100%", width:`${progress}%`, background:"var(--primary)", transition:"width .2s" }} /></div><p style={{ marginTop:7, color:"var(--text-2)" }}>Uploading {progress}% · batches contain up to 16 files</p></div>}
      {summary && <div style={{ marginTop:18, padding:14, borderRadius:10, background:"var(--success-soft)", color:"var(--text)" }}><b>Upload complete:</b> {summary.added} added · {summary.ignored} ignored · {summary.failed} failed{summary.missingRows.length ? <details style={{ marginTop:8 }}><summary>{summary.missingRows.length} mapping rows had no image</summary><div style={{ maxHeight:120, overflow:"auto" }}>{summary.missingRows.map(name=><div key={name}>{name}</div>)}</div></details> : null}{summary.failures.length>0 && <details style={{ marginTop:8 }}><summary>Upload errors ({summary.failures.length})</summary>{summary.failures.map((item,i)=><div key={i}>{item.file}: {item.reason}</div>)}</details>}</div>}
      </div>
      <footer className="toolkit-modal-foot">{mode==="testing"&&!newBrand&&brandSlug&&files.length>0&&<button className="clay-btn-secondary toolbar-sm" onClick={updateExistingAssetNames} disabled={busy}>Update existing folder names</button>}<button className="clay-btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="clay-btn-primary" onClick={handleUpload} disabled={busy || !!summary}>{busy?"Uploading":summary?"Uploaded":"Upload"}</button></footer>
    </section>
  </div>;
}

function TestingImagesPage({ Shell, onToggleTheme, selectedSlug="" }) {
  const [brands,setBrands]=React.useState([]),[brand,setBrand]=React.useState(null),[images,setImages]=React.useState([]),[assets,setAssets]=React.useState([]),[assetNames,setAssetNames]=React.useState({}),[selected,setSelected]=React.useState([]),[deleting,setDeleting]=React.useState(false);
  const [asset,setAsset]=React.useState("all"),[filterOpen,setFilterOpen]=React.useState(false),[uploadOpen,setUploadOpen]=React.useState(false),[pendingBrand,setPendingBrand]=React.useState(null);
  const [error,setError]=React.useState(""),[success,setSuccess]=React.useState(""),[lightbox,setLightbox]=React.useState(null),[loading,setLoading]=React.useState(false),[lastVisited,setLastVisited]=React.useState("");
  const [logoBusy,setLogoBusy]=React.useState(false),logoInput=React.useRef(null),sentinel=React.useRef(null),[renderCount,setRenderCount]=React.useState(150),loadedVisible=React.useRef(new Set());
  const galleryUrl=brand?`${TOOL_API}/testing/${encodeURIComponent(brand.slug)}/images?asset=${encodeURIComponent(asset)}`:"";
  async function loadBrands(){const data=await cachedToolJson(`${TOOL_API}/brands`,fresh=>setBrands(fresh.brands||[]));setBrands(data.brands||[]);markToolkitMetric("neosis-company-list-usable");}
  async function loadGallery(selected,currentAsset="all"){setLoading(true);const url=`${TOOL_API}/testing/${encodeURIComponent(selected.slug)}/images?asset=${encodeURIComponent(currentAsset)}`;try{const data=await cachedToolJson(url,fresh=>{setImages(fresh.images||[]);setAssets(fresh.assets||[]);setAssetNames(fresh.asset_names||{});setLoading(false);});setImages(data.images||[]);setAssets(data.assets||[]);setAssetNames(data.asset_names||{});setRenderCount(150);setLoading(false);}catch(err){setLoading(false);throw err;}}
  async function deleteSelectedImages(){if(!brand||!selected.length||deleting)return;if(!window.confirm(`Permanently delete ${selected.length} selected testing image${selected.length===1?"":"s"} from ${brand.name}? Packshots for this brand will not be affected.`))return;setDeleting(true);setError("");setSuccess("");try{const result=await toolJson(`${TOOL_API}/testing/${encodeURIComponent(brand.slug)}/images`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify(selected)});invalidateToolCache(brand.slug);await loadGallery(brand,asset);await loadBrands();setSelected([]);setSuccess(`Deleted ${result.deleted} testing image${result.deleted===1?"":"s"}.`);}catch(err){setError(err.message);}finally{setDeleting(false);}}
  async function deleteBrandTestingImages(){if(!brand||deleting)return;const total=Number(brand.testing_count??images.length);if(!window.confirm(`Permanently delete all ${total} Testing Images for ${brand.name}? This will not affect Packshots for this brand.`))return;setDeleting(true);setError("");try{await toolJson(`${TOOL_API}/testing/${encodeURIComponent(brand.slug)}`,{method:"DELETE"});invalidateToolCache(brand.slug);await loadBrands();setSelected([]);setBrand(null);setAsset("all");window.location.hash="#/testing-images";}catch(err){setError(err.message);}finally{setDeleting(false);}}
  React.useEffect(()=>{loadBrands().catch(err=>setError(err.message));},[]);
  React.useEffect(()=>{if(!selectedSlug){setBrand(null);return;}if(brands.length)setBrand(brands.find(item=>item.slug===selectedSlug)||null);},[selectedSlug,brands]);
  React.useEffect(()=>{if(!brand)return;setSelected([]);markToolkitMetric("neosis-gallery-shell-visible");loadGallery(brand,asset).catch(err=>setError(err.message));},[brand?.slug,asset]);
  React.useEffect(()=>{if(!images.length)return;loadedVisible.current.clear();requestAnimationFrame(()=>{const nodes=Array.from(document.querySelectorAll(".testing-image-grid img[data-initial-visible='true']"));Promise.all(nodes.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener("load",resolve,{once:true});img.addEventListener("error",resolve,{once:true});}))).then(()=>markToolkitMetric("neosis-visible-images-complete"));});},[images,brand?.slug,asset]);
  React.useEffect(()=>{if(images.length<=150||!sentinel.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(item=>item.isIntersecting))setRenderCount(value=>Math.min(images.length,value+100));},{rootMargin:"500px"});observer.observe(sentinel.current);return()=>observer.disconnect();},[images.length,renderCount]);
  async function uploadComplete(slug){invalidateToolCache(slug);const data=await cachedToolJson(`${TOOL_API}/brands`);setBrands(data.brands||[]);const found=(data.brands||[]).find(item=>item.slug===slug);if(found){if(brand)setBrand(found);else setPendingBrand(found);}}
  function closeUpload(){setUploadOpen(false);if(pendingBrand){setBrand(pendingBrand);setAsset("all");window.location.hash="#/testing-images/"+encodeURIComponent(pendingBrand.slug);setPendingBrand(null);}}
  async function changeLogo(file){if(!file||!brand)return;setError("");setSuccess("");setLogoBusy(true);try{const form=new FormData();form.append("logo",file,file.name);await toolJson(`${TOOL_API}/brands/${encodeURIComponent(brand.slug)}/logo`,{method:"POST",body:form});invalidateToolCache(brand.slug);const data=await cachedToolJson(`${TOOL_API}/brands`);setBrands(data.brands||[]);setBrand((data.brands||[]).find(item=>item.slug===brand.slug)||brand);setSuccess("Brand logo updated.");}catch(err){setError(err.message);}finally{setLogoBusy(false);if(logoInput.current)logoInput.current.value="";}}
  const displayAsset=item=>item==="general"?"General":assetNames[item]||item.replace(/-/g," ");
  const galleryShell=<>{brand&&<div className="toolkit-toolbar gallery-toolbar"><div className="toolkit-toolbar-filters"><button className="clay-btn-secondary asset-filter-button" onClick={()=>setFilterOpen(value=>!value)} aria-expanded={filterOpen}><ToolkitIcon name="testing" size={16}/>Filter by asset</button><button className="filter-chip" aria-pressed={asset==="all"} onClick={()=>setAsset("all")}>All</button>{assets.map(item=><button key={item} className="filter-chip" aria-pressed={asset===item} onClick={()=>setAsset(asset===item?"all":item)}>{displayAsset(item)}</button>)}</div><div className="toolkit-toolbar-actions gallery-toolbar-actions"><span className="toolkit-meta">{images.length} images</span><button className="clay-btn-secondary toolbar-sm" onClick={()=>setSelected(images.map(image=>image.key))} disabled={!images.length||deleting}>Select all</button>{selected.length>0&&<button className="clay-btn-danger toolbar-sm" onClick={deleteSelectedImages} disabled={deleting}>{deleting?"Deleting…":`Delete selected (${selected.length})`}</button>}</div></div>}{filterOpen&&<div className="clay-card toolkit-filter-popover"><b>Show asset</b>{assets.map(item=><button key={item} className="filter-chip" aria-pressed={asset===item} onClick={()=>{setAsset(item);setFilterOpen(false);}}>{displayAsset(item)}</button>)}</div>}<ToolNotice error={error} success={success}/>{loading&&!images.length?<div className="toolkit-skeleton-grid" aria-label="Loading images">{Array.from({length:12},(_,i)=><div key={i} className="toolkit-skeleton"/>)}</div>:images.length?<><div className="testing-image-grid">{images.slice(0,Math.min(images.length,renderCount)).map((image,index)=><article key={image.key} className={`clay-card testing-image-card${selected.includes(image.key)?" selected":""}`}><input className="toolkit-image-select" type="checkbox" aria-label={`Select ${image.asset==="general"?image.key.split("/").pop():displayAsset(image.asset)+" image"}`} checked={selected.includes(image.key)} onClick={event=>event.stopPropagation()} onChange={()=>setSelected(value=>value.includes(image.key)?value.filter(key=>key!==image.key):[...value,image.key])}/><button className="testing-image-button" onClick={()=>setLightbox(image)} aria-label={"Open "+(image.asset==="general"?"testing image":displayAsset(image.asset))}><img src={resolveToolkitImageUrl(image.thumb_url||image.url)} width={image.width||undefined} height={image.height||undefined} loading={index<16?"eager":"lazy"} fetchPriority={index<4?"high":"auto"} data-initial-visible={index<16?"true":undefined} decoding="async" alt={image.asset==="general"?"Testing image":displayAsset(image.asset)} onLoad={event=>{if(index===0&&event.currentTarget.getBoundingClientRect().top<innerHeight)markToolkitMetric("neosis-first-thumbnail-visible");}}/></button><div className="testing-image-caption"><span title={displayAsset(image.asset)||"General"}>{displayAsset(image.asset)||"General"}</span><a href={resolveToolkitImageUrl(image.url)} download>Download</a></div></article>)}</div>{images.length>150&&renderCount<images.length&&<div ref={sentinel} className="toolkit-image-sentinel"/>}</>:!loading?<div className="clay-card toolkit-empty">No images in this view yet.</div>:null}{lightbox&&<div className="toolkit-lightbox" onClick={()=>setLightbox(null)} role="dialog" aria-modal="true" aria-label="Expanded testing image"><img src={resolveToolkitImageUrl(lightbox.preview_url||lightbox.url)} alt="Expanded testing image"/></div>}</>;
  if(!brand)return <ToolPageShell Shell={Shell} title="Testing Images" subtitle="Browse test images by brand and asset." onToggleTheme={onToggleTheme} actions={<button className="clay-btn-primary" onClick={()=>setUploadOpen(true)}><ToolkitIcon name="upload" size={16}/>Upload</button>}><ToolNotice error={error}/><BrandPicker brands={brands} countKey="testing_count" countLabel="image" assetCountKey="testing_assets" selectedSlug={lastVisited} onPick={selected=>{setBrand(selected);setLastVisited("");window.location.hash="#/testing-images/"+encodeURIComponent(selected.slug);}} emptyText="No testing images yet. Upload a folder to create your first brand gallery."/>{uploadOpen&&<UploadDialog mode="testing" brands={brands} onClose={closeUpload} onComplete={uploadComplete} onAssetNamesUpdated={async slug=>{invalidateToolCache(slug);await loadBrands();}}/>}</ToolPageShell>;
  const titleContent=<span className="toolkit-brand-title">{brand.logo_url&&<img src={resolveToolkitImageUrl(brand.logo_url)} alt=""/>}{brand.name}</span>;
  return <ToolPageShell Shell={Shell} title={brand.name} titleContent={titleContent} subtitle="Testing images" onToggleTheme={onToggleTheme} backLink={<button className="neosis-back-link" onClick={()=>{setLastVisited(brand.slug);setBrand(null);setAsset("all");window.location.hash="#/testing-images";}}>← All brands</button>} actions={<><button className="clay-btn-danger" onClick={deleteBrandTestingImages} disabled={deleting||(!images.length&&!Number(brand.testing_count))}>{deleting?"Deleting…":"Delete all images"}</button><button className="clay-btn-secondary" onClick={()=>logoInput.current?.click()} disabled={logoBusy}>{logoBusy?"Saving logo…":"Change logo"}</button><input ref={logoInput} type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" style={{display:"none"}} onChange={event=>changeLogo(event.target.files?.[0])}/><button className="clay-btn-primary" onClick={()=>setUploadOpen(true)}><ToolkitIcon name="upload" size={16}/>Upload</button></>}>
    {galleryShell}{uploadOpen&&<UploadDialog mode="testing" brands={brands} onClose={closeUpload} onComplete={uploadComplete} onAssetNamesUpdated={async slug=>{invalidateToolCache(slug);if(brand?.slug===slug)await loadGallery(brand,asset);await loadBrands();}}/>}
  </ToolPageShell>;
}

function PackshotsPage({ Shell, onToggleTheme, selectedSlug="" }) {
  const [brands,setBrands]=React.useState([]),[brand,setBrand]=React.useState(null),[images,setImages]=React.useState([]),[labelMode,setLabelMode]=React.useState("annotation_name"),[selected,setSelected]=React.useState([]);
  const [uploadOpen,setUploadOpen]=React.useState(false),[pendingBrand,setPendingBrand]=React.useState(null),[error,setError]=React.useState(""),[success,setSuccess]=React.useState(""),[lightbox,setLightbox]=React.useState(null),[loading,setLoading]=React.useState(false),[lastVisited,setLastVisited]=React.useState(""),[logoBusy,setLogoBusy]=React.useState(false),[deleting,setDeleting]=React.useState(false);
  const [editing,setEditing]=React.useState(null),[savingLabel,setSavingLabel]=React.useState(false),[labelToast,setLabelToast]=React.useState(null);
  const [renderCount,setRenderCount]=React.useState(150);const replaceRef=React.useRef(null),logoInput=React.useRef(null),sentinel=React.useRef(null);
  const labelInputRef=React.useRef(null),toastTimer=React.useRef(null),saveGuard=React.useRef(false);
  React.useEffect(()=>{if(editing){labelInputRef.current?.focus();labelInputRef.current?.select();}},[editing?.file,editing?.field]);
  React.useEffect(()=>()=>clearTimeout(toastTimer.current),[]);
  function showLabelToast(message,kind="success"){setLabelToast({message,kind});clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setLabelToast(null),3600);}
  function editValue(image,field=labelMode){return field==="annotation_name"?(image.annotation_name||image.file.replace(/\.[^.]+$/,"")):(image[field]||"");}
  function startEditing(image){
    if(editing&&editing.file!==image.file){const pending={...editing};setEditing(null);saveLabel(pending).finally(()=>setEditing({file:image.file,field:labelMode,value:editValue(image)}));return;}
    setEditing({file:image.file,field:labelMode,value:editValue(image)});
  }
  function cancelEditing(){setEditing(null);}
  async function saveLabel(draft=editing){
    if(!draft||saveGuard.current)return false;
    const current=images.find(item=>item.file===draft.file);if(!current){setEditing(null);return false;}
    const oldValue=editValue(current,draft.field),nextValue=String(draft.value??"").trim().replace(/\s+/g," ");
    if(nextValue.length>200){showLabelToast("Label must be 200 characters or fewer","error");return false;}
    if(/[\x00-\x1f\x7f-\x9f]/.test(nextValue)){showLabelToast("Label cannot contain control characters","error");return false;}
    const normalized=draft.field==="annotation_name"?(nextValue||current.file.replace(/\.[^.]+$/,"")):nextValue;
    if(normalized===oldValue){setEditing(null);return true;}
    const fieldName=draft.field==="annotation_name"?"annotation":draft.field;
    const url=`${TOOL_API}/packshots/${encodeURIComponent(brand.slug)}/${encodeURIComponent(draft.file)}/labels`;
    saveGuard.current=true;setSavingLabel(true);setImages(items=>items.map(item=>item.file===draft.file?{...item,[draft.field]:normalized}:item));
    try{
      const updated=await toolJson(url,{method:"PATCH",headers:{"Content-Type":"application/json","If-Match":current.label_etag||""},body:JSON.stringify({field:fieldName,value:normalized})});
      setImages(items=>items.map(item=>item.file===draft.file?{...item,...updated}:item));
      TOOL_DATA_CACHE.delete(`${TOOL_API}/packshots/${encodeURIComponent(brand.slug)}`);
      showLabelToast(updated.duplicate_annotation_name?"Another packshot already uses this annotation name":"Saved",updated.duplicate_annotation_name?"warning":"success");setEditing(null);return true;
    }catch(err){
      if(err.status===409){
        try{const fresh=await refreshToolCache(`${TOOL_API}/packshots/${encodeURIComponent(brand.slug)}`,null);setImages(fresh.images||[]);}catch(_){}
        showLabelToast("This label was changed by someone else","error");setEditing(null);return false;
      }
      setImages(items=>items.map(item=>item.file===draft.file?{...item,[draft.field]:oldValue}:item));
      showLabelToast(err.message||"Could not save label","error");setEditing(null);return false;
    }finally{saveGuard.current=false;setSavingLabel(false);}
  }
  function changeLabelMode(key){if(editing)cancelEditing();setLabelMode(key);}
  async function loadBrands(){const data=await cachedToolJson(`${TOOL_API}/brands`,fresh=>setBrands(fresh.brands||[]));setBrands(data.brands||[]);markToolkitMetric("neosis-company-list-usable");}
  async function loadImages(selectedBrand){setLoading(true);const url=`${TOOL_API}/packshots/${encodeURIComponent(selectedBrand.slug)}`;try{const data=await cachedToolJson(url,fresh=>{setImages(fresh.images||[]);setSelected([]);setLoading(false);});setImages(data.images||[]);setSelected([]);setRenderCount(150);setLoading(false);}catch(err){setLoading(false);throw err;}}
  async function deleteSelectedPackshots(){if(!brand||!selected.length||deleting)return;const keys=images.filter(image=>selected.includes(image.file)).map(image=>image.key);if(!keys.length)return;if(!window.confirm(`Permanently delete ${keys.length} selected packshot${keys.length===1?"":"s"} from ${brand.name}? Testing Images for this brand will not be affected.`))return;setDeleting(true);setError("");setSuccess("");try{const result=await toolJson(`${TOOL_API}/packshots/${encodeURIComponent(brand.slug)}/images`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify(keys)});invalidateToolCache(brand.slug);await loadImages(brand);await loadBrands();setSuccess(`Deleted ${result.deleted} packshot${result.deleted===1?"":"s"}.`);}catch(err){setError(err.message);}finally{setDeleting(false);}}
  async function deleteBrandPackshots(){if(!brand||deleting)return;const total=Number(brand.packshot_count??images.length);if(!window.confirm(`Permanently delete all ${total} Packshots for ${brand.name}? This will not affect Testing Images for this brand.`))return;setDeleting(true);setError("");setSuccess("");try{await toolJson(`${TOOL_API}/packshots/${encodeURIComponent(brand.slug)}`,{method:"DELETE"});invalidateToolCache(brand.slug);await loadBrands();setSelected([]);setBrand(null);window.location.hash="#/packshots";}catch(err){setError(err.message);}finally{setDeleting(false);}}
  React.useEffect(()=>{loadBrands().catch(err=>setError(err.message));},[]);
  React.useEffect(()=>{if(!selectedSlug){setBrand(null);return;}if(brands.length)setBrand(brands.find(item=>item.slug===selectedSlug)||null);},[selectedSlug,brands]);
  React.useEffect(()=>{if(!brand)return;markToolkitMetric("neosis-gallery-shell-visible");loadImages(brand).catch(err=>setError(err.message));},[brand?.slug]);
  React.useEffect(()=>{if(!images.length)return;requestAnimationFrame(()=>{const nodes=Array.from(document.querySelectorAll(".packshot-grid img[data-initial-visible='true']"));Promise.all(nodes.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener("load",resolve,{once:true});img.addEventListener("error",resolve,{once:true});}))).then(()=>markToolkitMetric("neosis-visible-images-complete"));});},[images,brand?.slug]);
  React.useEffect(()=>{if(images.length<=150||!sentinel.current)return;const observer=new IntersectionObserver(entries=>{if(entries.some(item=>item.isIntersecting))setRenderCount(value=>Math.min(images.length,value+100));},{rootMargin:"500px"});observer.observe(sentinel.current);return()=>observer.disconnect();},[images.length,renderCount]);
  async function uploadComplete(slug){invalidateToolCache(slug);const data=await cachedToolJson(`${TOOL_API}/brands`);setBrands(data.brands||[]);const found=(data.brands||[]).find(item=>item.slug===slug);if(found){if(brand)setBrand(found);else setPendingBrand(found);}}
  function closeUpload(){setUploadOpen(false);if(pendingBrand){setBrand(pendingBrand);window.location.hash="#/packshots/"+encodeURIComponent(pendingBrand.slug);setPendingBrand(null);}}
  function downloadZip(names=[]){const query=names.length?`?selected=${encodeURIComponent(names.join(","))}`:"";window.location.href=`${TOOL_API}/packshots/${encodeURIComponent(brand.slug)}/download${query}`;}
  async function replaceSelected(file){if(!file||selected.length!==1)return;setError("");try{const form=new FormData();form.append("image",file,file.name);await toolJson(`${TOOL_API}/packshots/${encodeURIComponent(brand.slug)}/${encodeURIComponent(selected[0])}/replace`,{method:"POST",body:form});invalidateToolCache(brand.slug);await loadImages(brand);}catch(err){setError(err.message);}}
  async function changeLogo(file){if(!file||!brand)return;setError("");setSuccess("");setLogoBusy(true);try{const form=new FormData();form.append("logo",file,file.name);await toolJson(`${TOOL_API}/brands/${encodeURIComponent(brand.slug)}/logo`,{method:"POST",body:form});invalidateToolCache(brand.slug);const data=await cachedToolJson(`${TOOL_API}/brands`);setBrands(data.brands||[]);setBrand((data.brands||[]).find(item=>item.slug===brand.slug)||brand);setSuccess("Brand logo updated.");}catch(err){setError(err.message);}finally{setLogoBusy(false);if(logoInput.current)logoInput.current.value="";}}
  const toggleSelection=name=>setSelected(value=>value.includes(name)?value.filter(item=>item!==name):[...value,name]);
  if(!brand)return <ToolPageShell Shell={Shell} title="Packshots" subtitle="Brand product references with SKU labels." onToggleTheme={onToggleTheme} actions={<button className="clay-btn-primary" onClick={()=>setUploadOpen(true)}><ToolkitIcon name="upload" size={16}/>Upload</button>}><ToolNotice error={error}/><BrandPicker brands={brands} countKey="packshot_count" countLabel="packshot" selectedSlug={lastVisited} onPick={chosen=>{setBrand(chosen);setLastVisited("");window.location.hash="#/packshots/"+encodeURIComponent(chosen.slug);}} emptyText="No packshots yet. Upload an image folder and its mapping sheet."/>{uploadOpen&&<UploadDialog mode="packshots" brands={brands} onClose={closeUpload} onComplete={uploadComplete}/>}</ToolPageShell>;
  const selectedImages=images.filter(image=>selected.includes(image.file)),originalUrl=image=>resolveToolkitImageUrl(image.url),previewUrl=image=>resolveToolkitImageUrl(image.preview_url||image.url);
  const displayLabel=image=>labelMode==="annotation_name"?(image.annotation_name||image.file.replace(/\.[^.]+$/,"")):(image[labelMode]||"—");
  const sortedImages=images.slice().sort((a,b)=>(a.name||a.annotation_name||a.file).localeCompare(b.name||b.annotation_name||b.file,undefined,{numeric:true,sensitivity:"base"}));
  const downloadSelected=()=>{if(selected.length===1){const item=selectedImages[0];if(item){const anchor=document.createElement("a");anchor.href=originalUrl(item);anchor.download=item.file;anchor.click();}}else if(selected.length>1)downloadZip(selected);};
  const titleContent=<span className="toolkit-brand-title">{brand.logo_url&&<img src={resolveToolkitImageUrl(brand.logo_url)} alt=""/>}{brand.name}</span>;
  return <ToolPageShell Shell={Shell} title={brand.name} titleContent={titleContent} subtitle={`${images.length} packshots`} onToggleTheme={onToggleTheme} backLink={<button className="neosis-back-link" onClick={()=>{setLastVisited(brand.slug);setBrand(null);window.location.hash="#/packshots";}}>← All brands</button>} actions={<><button className="clay-btn-danger" onClick={deleteBrandPackshots} disabled={deleting||!Number(brand.packshot_count??images.length)}>{deleting?"Deleting…":"Delete all packshots"}</button><button className="clay-btn-secondary" onClick={()=>logoInput.current?.click()} disabled={logoBusy}>{logoBusy?"Saving logo…":"Change logo"}</button><input ref={logoInput} type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" style={{display:"none"}} onChange={event=>changeLogo(event.target.files?.[0])}/><button className="clay-btn-primary" onClick={()=>setUploadOpen(true)}><ToolkitIcon name="upload" size={16}/>Upload</button></>}>
     <div className="toolkit-toolbar gallery-toolbar packshot-toolbar"><div className="ir-seg" role="group" aria-label="Packshot label">{[["annotation_name","Annotation"],["name","Name"],["id","ID"]].map(([key,label])=><button key={key} aria-pressed={labelMode===key} onClick={()=>changeLabelMode(key)}>{label}</button>)}</div><span className="toolkit-toolbar-spacer"/>{selected.length>0&&<span className="toolkit-meta">{selected.length} selected</span>}<div className="toolkit-toolbar-actions">{selected.length>0&&<><button className="clay-btn-primary toolbar-sm" onClick={downloadSelected}><ToolkitIcon name="download" size={15}/>Download ({selected.length})</button>{selected.length===1&&<button className="clay-btn-secondary toolbar-sm" onClick={()=>replaceRef.current?.click()}>Replace image</button>}<button className="clay-btn-secondary toolbar-sm" onClick={()=>setSelected(sortedImages.map(image=>image.file))}>Select all</button><button className="clay-btn-secondary toolbar-sm" onClick={()=>setSelected([])}>Deselect all</button><button className="clay-btn-danger toolbar-sm" onClick={deleteSelectedPackshots} disabled={deleting}>{deleting?"Deleting…":`Delete (${selected.length})`}</button><input ref={replaceRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{display:"none"}} onChange={event=>replaceSelected(event.target.files?.[0])}/></>}{selected.length===0&&<><button className="clay-btn-secondary toolbar-sm" onClick={()=>setSelected(sortedImages.map(image=>image.file))}>Select all</button><button className="clay-btn-primary toolbar-sm" onClick={()=>downloadZip([])}><ToolkitIcon name="download" size={15}/>Download all as ZIP</button></>}</div></div>
     <ToolNotice error={error} success={success}/>{labelToast&&<div className={`packshot-label-toast ${labelToast.kind}`} role={labelToast.kind==="error"?"alert":"status"}>{labelToast.message}</div>}{loading&&!images.length?<div className="toolkit-skeleton-grid packshot-skeleton-grid">{Array.from({length:12},(_,i)=><div key={i} className="toolkit-skeleton packshot-skeleton"/>)}</div>:<><div className="packshot-grid">{sortedImages.slice(0,Math.min(images.length,renderCount)).map((image,index)=><article key={image.file} className={"clay-card packshot-tile"+(selected.includes(image.file)?" selected":"")} onClick={event=>{if(event.target.type!=="checkbox")setLightbox(image);}}><input type="checkbox" aria-label={"Select "+image.file} checked={selected.includes(image.file)} onClick={event=>event.stopPropagation()} onChange={()=>toggleSelection(image.file)}/><button className="packshot-image-button" aria-label={"Preview "+(image.name||image.file)} onClick={event=>{event.stopPropagation();setLightbox(image);}}><img src={resolveToolkitImageUrl(image.thumb_url||image.url)} width={image.width||undefined} height={image.height||undefined} loading={index<16?"eager":"lazy"} fetchPriority={index<4?"high":"auto"} data-initial-visible={index<16?"true":undefined} decoding="async" alt={image.name||image.file} onLoad={event=>{if(index===0&&event.currentTarget.getBoundingClientRect().top<innerHeight)markToolkitMetric("neosis-first-thumbnail-visible");}}/></button><div className="packshot-label-area" onClick={event=>event.stopPropagation()}><div className="packshot-label" title={displayLabel(image)} onDoubleClick={()=>startEditing(image)}>{editing?.file===image.file&&editing.field===labelMode?<><input ref={labelInputRef} className="packshot-label-input" aria-label={`Edit ${labelMode==="annotation_name"?"annotation name":labelMode==="name"?"name":"ID"}`} value={editing.value} disabled={savingLabel} onChange={event=>setEditing(value=>({...value,value:event.target.value}))} onKeyDown={event=>{event.stopPropagation();if(event.key==="Enter"){event.preventDefault();saveLabel();}else if(event.key==="Escape"){event.preventDefault();cancelEditing();}}} onBlur={event=>{if(!event.relatedTarget?.closest(".packshot-edit-actions,.ir-seg"))saveLabel();}}/><span className="packshot-edit-actions"><button type="button" aria-label="Save label" disabled={savingLabel} onMouseDown={event=>event.preventDefault()} onClick={()=>saveLabel()}>{savingLabel?<span className="packshot-save-spinner"/>:<ToolkitIcon name="check" size={14}/>}</button><button type="button" aria-label="Cancel label edit" disabled={savingLabel} onMouseDown={event=>event.preventDefault()} onClick={cancelEditing}><ToolkitIcon name="close" size={13}/></button></span></>:<><span className="packshot-label-text">{displayLabel(image)}</span><button type="button" className="packshot-edit-button" aria-label={`Edit ${labelMode==="annotation_name"?"annotation name":labelMode==="name"?"name":"ID"}`} title="Edit label" onClick={event=>{event.stopPropagation();startEditing(image);}}><ToolkitIcon name="edit" size={13}/></button></>}</div></div></article>)}</div>{images.length>150&&renderCount<images.length&&<div ref={sentinel} className="toolkit-image-sentinel"/>}</>}
    {lightbox&&<div className="toolkit-lightbox" onClick={()=>setLightbox(null)} role="dialog" aria-modal="true" aria-label="Packshot preview"><div><img src={previewUrl(lightbox)} alt={lightbox.name||lightbox.file}/><strong>{displayLabel(lightbox)}</strong></div></div>}{uploadOpen&&<UploadDialog mode="packshots" brands={brands} onClose={closeUpload} onComplete={uploadComplete}/>}
  </ToolPageShell>;
}

window.NeosisToolkit = { HomePage, TestingImagesPage, PackshotsPage, Select:AppSelect, Icon:ToolkitIcon };
