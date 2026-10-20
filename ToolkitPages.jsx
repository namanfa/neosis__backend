const TOOL_API = (window.NOESIS_API_URL || "http://localhost:7860/api/sessions").replace(/\/api\/sessions\/?$/, "") + "/api/tools";
const TOOL_IMAGE_TYPES = new Set(["jpg", "jpeg", "png", "webp"]);
const TOOL_BATCH_SIZE = 20;

function ToolkitIcon({ name="label", size=22 }) {
  const paths={label:<><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8m-8 4h5"/></>,extract:<><path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/></>,testing:<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/></>,packshots:<><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v10l9 5 9-5V8M12 13v10"/></>,dashboard:<><path d="M4 19V5m0 14h16M8 15l3-4 3 2 5-7"/></>,accuracy:<><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5m-9 5 2 2 4-4"/></>};
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
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
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
  function openMenu(){const r=triggerRef.current.getBoundingClientRect(),h=Math.min(280,window.innerHeight-24),menuH=Math.min(h,options.length*42+12),top=window.innerHeight-r.bottom>=menuH+8?r.bottom+6:Math.max(12,r.top-menuH-6);setPosition({left:Math.max(12,Math.min(r.left,window.innerWidth-r.width-12)),top,width:r.width,maxHeight:h});setActive(Math.max(0,usable.findIndex(o=>String(o.value)===String(value))));setOpen(true);}
  React.useEffect(()=>{if(open)optionRefs.current[active]?.focus();},[open,active]);
  React.useEffect(()=>{if(!open)return;const update=()=>{const r=triggerRef.current?.getBoundingClientRect();if(r)setPosition(p=>p?{...p,left:Math.max(12,Math.min(r.left,window.innerWidth-r.width-12)),top:r.bottom+6,width:r.width}:p);};const outside=e=>{if(!triggerRef.current?.contains(e.target)&&!menuRef.current?.contains(e.target))close();};window.addEventListener("resize",update);window.addEventListener("scroll",update,true);document.addEventListener("pointerdown",outside);return()=>{window.removeEventListener("resize",update);window.removeEventListener("scroll",update,true);document.removeEventListener("pointerdown",outside);};},[open]);
  function keyDown(e,index=-1){if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close(true);return;}if(e.key==="Tab"){close();return;}if(["ArrowDown","ArrowUp","Home","End"].includes(e.key)){e.preventDefault();if(!open)openMenu();else if(e.key==="Home")setActive(0);else if(e.key==="End")setActive(Math.max(0,usable.length-1));else setActive((index+(e.key==="ArrowDown"?1:usable.length-1))%usable.length);}if((e.key==="Enter"||e.key===" ")&&index>=0){e.preventDefault();const option=usable[index];if(option){onChange(option.value);close(true);}}}
  return <><button ref={triggerRef} type="button" className="neosis-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={()=>open?close():openMenu()} onKeyDown={e=>keyDown(e,-1)} style={style}><span>{selected?.label||placeholder}</span><span className={`neosis-select-chevron${open?" open":""}`} aria-hidden="true">⌄</span></button>{open&&position&&ReactDOM.createPortal(<div ref={menuRef} className="neosis-select-menu" role="listbox" aria-label={ariaLabel} style={{position:"fixed",left:position.left,top:position.top,width:position.width,maxHeight:position.maxHeight,overflowY:"auto",zIndex:10000}}>{options.map(option=>{const index=usable.indexOf(option);return <button key={String(option.value)} ref={node=>{if(index>=0)optionRefs.current[index]=node;}} type="button" role="option" aria-selected={String(option.value)===String(value)} disabled={option.disabled} className={`neosis-select-option${option.action?" action":""}`} onMouseEnter={()=>index>=0&&setActive(index)} onClick={()=>{if(!option.disabled){onChange(option.value);close(true);}}} onKeyDown={e=>keyDown(e,index)}>{option.label}</button>;})}</div>,document.body)}</>;
}

function ToolNotice({ error, success }) {
  if (error) return <div role="alert" style={{ margin:"16px 0", padding:14, borderRadius:10, background:"var(--danger-soft)", color:"var(--danger)" }}>{error}</div>;
  if (success) return <div role="status" style={{ margin:"16px 0", padding:14, borderRadius:10, background:"var(--success-soft)", color:"var(--success)" }}>{success}</div>;
  return null;
}

function ToolPageShell({ Shell, title, subtitle, children, onToggleTheme, onBack, actions }) {
  return <Shell title={title} subtitle={subtitle} actions={actions || (onBack && <button className="clay-btn-secondary" onClick={onBack}>← Back to tools</button>)} onToggleTheme={onToggleTheme} showSteps={false}>{children}</Shell>;
}

const TOOL_CARDS = [
  { title:"Pseudo Labelling", description:"Run a YOLO model on images and export a labelled dataset.", icon:"✦", route:"#/labeler" },
  { title:"Image Extraction", description:"Download linked images from an Excel or CSV sheet.", icon:"↓", route:"#/extract" },
  { title:"Testing Images", description:"Browse and upload good-quality test images by brand and asset.", icon:"▧", route:"#/testing-images" },
  { title:"Packshots", description:"View and download each brand’s packshots with SKU labels.", icon:"◫", route:"#/packshots" },
  { title:"Model Dashboard", description:"Track model versions and accuracy over time.", icon:"⌁", soon:true },
  { title:"Accuracy Doc", description:"Evaluate a model on your images and export an accuracy report.", icon:"≋", soon:true },
];

function HomePage({ Shell, onToggleTheme }) {
  const core=TOOL_CARDS.filter(card=>!card.soon), utilities=TOOL_CARDS.filter(card=>card.soon);
  const firstName=(window.IR_USER?.name||"team").split(" ")[0];
  return <ToolPageShell Shell={Shell} title="Dashboard" subtitle={`Welcome back, ${firstName}. Choose a workflow to get started.`} onToggleTheme={onToggleTheme}>
    <section aria-labelledby="core-workflows-title"><h2 id="core-workflows-title" className="dashboard-section-title">Core workflows</h2><div className="dashboard-core-grid">
      {core.map(card=><button key={card.title} onClick={()=>{window.location.hash=card.route;}} className="clay-card clay-card-interactive dashboard-workflow" type="button"><span className="dashboard-icon" aria-hidden="true">{card.icon}</span><span><strong>{card.title}</strong><small>{card.description}</small></span><span className="dashboard-arrow" aria-hidden="true">?</span></button>)}
    </div></section>
    <section className="dashboard-utilities" aria-labelledby="utilities-title"><div><h2 id="utilities-title" className="dashboard-section-title">Utilities</h2><p>Additional workflows</p></div><div className="dashboard-utility-grid">{utilities.map(card=><button key={card.title} disabled className="dashboard-utility" type="button"><span aria-hidden="true">{card.icon}</span><strong>{card.title}</strong><small>{card.description}</small><em>Coming soon</em></button>)}</div></section>
  </ToolPageShell>;
}
function BrandPicker({ brands, countKey, onPick, emptyText }) {
  const available = brands.filter(brand => brand[countKey] > 0);
  if (!available.length) return <div className="clay-card" style={{ padding:26, color:"var(--text-2)" }}>{emptyText}</div>;
  return <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:16 }}>
    {available.map(brand => <button key={brand.slug} onClick={() => onPick(brand)} className="clay-card clay-card-interactive" style={{ textAlign:"left", padding:20, color:"var(--text)", cursor:"pointer" }}>
      <div style={{ fontSize:17, fontWeight:800 }}>{brand.name}</div><div style={{ marginTop:8, fontSize:13, color:"var(--text-2)" }}>{brand[countKey]} images</div>
    </button>)}
  </div>;
}

function UploadDialog({ mode, brands, onClose, onComplete }) {
  const [brandSlug, setBrandSlug] = React.useState("");
  const [newBrandName, setNewBrandName] = React.useState("");
  const [newBrand, setNewBrand] = React.useState(false);
  const [files, setFiles] = React.useState([]);
  const [mapping, setMapping] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState("");
  const [summary, setSummary] = React.useState(null);
  const folderRef = React.useRef(null);
  const mappingRef = React.useRef(null);

  async function handleUpload() {
    setError(""); setSummary(null);
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) { setError("Choose a folder first."); return; }
    if (mode === "packshots" && !mapping) { setError("Choose the mapping sheet for these packshots."); return; }
    setBusy(true); setProgress(0);
    try {
      let slug = brandSlug;
      if (newBrand) {
        const created = await toolJson(`${TOOL_API}/brands`, { method:"POST", body:new URLSearchParams({ name:newBrandName }) });
        slug = created.slug;
      }
      if (!slug) throw new Error("Choose an existing brand or add a new one.");
      let ignored = 0, added = 0, failed = 0;
      const failures = [];
      const sheetRows = mode === "packshots" ? mapping.rows : null;
      const rowNames = new Set(Object.keys(sheetRows || {}));
      const foundNames = new Set();
      for (let start = 0; start < selectedFiles.length; start += TOOL_BATCH_SIZE) {
        const batch = selectedFiles.slice(start, start + TOOL_BATCH_SIZE);
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
        setProgress(Math.min(100, Math.round(((start + batch.length) / selectedFiles.length) * 100)));
      }
      const missingRows = mode === "packshots" ? [...rowNames].filter(name => !foundNames.has(name)).map(name => sheetRows[name].image_name || name) : [];
      const result = { added, ignored, failed, failures, missingRows };
      setSummary(result);
      await onComplete(slug, result);
    } catch (err) { setError(err.message || "Upload failed."); }
    finally { setBusy(false); }
  }

  const usableBrands = brands;
  return <div role="dialog" aria-modal="true" aria-label={mode === "testing" ? "Upload testing images" : "Upload packshots"} style={{ position:"fixed", inset:0, zIndex:500, background:"rgba(4,12,27,.65)", display:"grid", placeItems:"center", padding:18 }}>
    <section className="clay-card" style={{ width:"min(760px,100%)", maxHeight:"92vh", overflow:"auto", padding:24 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}><h2>{mode === "testing" ? "Upload testing images" : "Upload packshots"}</h2><button className="clay-btn-secondary" onClick={onClose} disabled={busy}>Close</button></div>
      <div style={{ marginTop:20, display:"flex", alignItems:"center", gap:10 }}>
        <label style={{ display:"flex", alignItems:"center", gap:7 }}><input type="radio" checked={!newBrand} onChange={() => setNewBrand(false)} /> Existing brand</label>
        <label style={{ display:"flex", alignItems:"center", gap:7 }}><input type="radio" checked={newBrand} onChange={() => setNewBrand(true)} /> Add new brand</label>
      </div>
      {newBrand ? <input value={newBrandName} onChange={e=>setNewBrandName(e.target.value)} placeholder="Brand name" style={{ width:"100%", marginTop:12, padding:12, borderRadius:9, border:"1px solid var(--border-strong)", background:"var(--surface-2)", color:"var(--text)" }} /> : <AppSelect ariaLabel="Choose a brand" value={brandSlug} onChange={setBrandSlug} placeholder="Choose a brand" options={usableBrands.map(brand=>({value:brand.slug,label:brand.name}))} style={{width:"100%",marginTop:12}} />}
      {newBrand && <p style={{ marginTop:6, color:"var(--text-3)", fontSize:12 }}>Brand names that match an existing brand after case and space normalization are rejected.</p>}
      <label style={{ display:"block", marginTop:20, marginBottom:8, fontWeight:700 }}>Image folder</label>
      <input ref={folderRef} type="file" webkitdirectory="" directory="" multiple onChange={e=>setFiles(e.target.files || [])} />
      {!!files.length && <p style={{ marginTop:8, color:"var(--text-2)" }}>{files.length} files selected</p>}
      {mode === "packshots" && <><label style={{ display:"block", marginTop:20, marginBottom:8, fontWeight:700 }}>SKU mapping sheet (.xlsx or .csv)</label><input ref={mappingRef} type="file" accept=".xlsx,.csv" onChange={async e=>{const file=e.target.files?.[0];if(!file){setMapping(null);return;}setError("");try{const form=new FormData();form.append("mapping",file);setMapping(await toolJson(`${TOOL_API}/packshots/prepare`,{method:"POST",body:form}));}catch(err){setMapping(null);setError(err.message);}}} />{mapping && <p style={{ marginTop:8, color:"var(--success)" }}>{Object.keys(mapping.rows).length} mapping rows loaded</p>}</>}
      <ToolNotice error={error} />
      {busy && <div style={{ marginTop:18 }}><div style={{ height:8, borderRadius:9, background:"var(--surface-3)", overflow:"hidden" }}><div style={{ height:"100%", width:`${progress}%`, background:"var(--primary)", transition:"width .2s" }} /></div><p style={{ marginTop:7, color:"var(--text-2)" }}>Uploading {progress}% · batches contain up to 20 files</p></div>}
      {summary && <div style={{ marginTop:18, padding:14, borderRadius:10, background:"var(--success-soft)", color:"var(--text)" }}><b>Upload complete:</b> {summary.added} added · {summary.ignored} ignored · {summary.failed} failed{summary.missingRows.length ? <details style={{ marginTop:8 }}><summary>{summary.missingRows.length} mapping rows had no image</summary><div style={{ maxHeight:120, overflow:"auto" }}>{summary.missingRows.map(name=><div key={name}>{name}</div>)}</div></details> : null}{summary.failures.length>0 && <details style={{ marginTop:8 }}><summary>Upload errors ({summary.failures.length})</summary>{summary.failures.map((item,i)=><div key={i}>{item.file}: {item.reason}</div>)}</details>}</div>}
      <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:22 }}><button className="clay-btn-primary" onClick={handleUpload} disabled={busy || !!summary}>{busy?"Uploading…":summary?"Uploaded":"Upload"}</button></div>
    </section>
  </div>;
}

function TestingImagesPage({ Shell, onToggleTheme }) {
  const [brands, setBrands] = React.useState([]);
  const [brand, setBrand] = React.useState(null);
  const [images, setImages] = React.useState([]);
  const [assets, setAssets] = React.useState([]);
  const [asset, setAsset] = React.useState("all");
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [pendingBrand, setPendingBrand] = React.useState(null);
  const [error, setError] = React.useState("");
  const [lightbox, setLightbox] = React.useState(null);

  async function loadBrands() { const data = await toolJson(`${TOOL_API}/brands`); setBrands(data.brands || []); }
  async function loadGallery(selected, currentAsset="all") { const data = await toolJson(`${TOOL_API}/testing/${encodeURIComponent(selected.slug)}/images?asset=${encodeURIComponent(currentAsset)}`); setImages(data.images || []); setAssets(data.assets || []); }
  React.useEffect(() => { loadBrands().catch(err=>setError(err.message)); }, []);
  React.useEffect(() => { if (brand) loadGallery(brand, asset).catch(err=>setError(err.message)); }, [brand, asset]);
  async function uploadComplete(slug) { const data=await toolJson(`${TOOL_API}/brands`);setBrands(data.brands||[]);const selected=(data.brands||[]).find(item=>item.slug===slug);if(selected){if(brand)setBrand(selected);else setPendingBrand(selected);} }
  function closeUpload() { setUploadOpen(false); if(pendingBrand){setBrand(pendingBrand);setAsset("all");setPendingBrand(null);} }

  if (!brand) return <ToolPageShell Shell={Shell} title="Testing Images" subtitle="Browse test images by brand and asset." onToggleTheme={onToggleTheme} actions={<button className="clay-btn-primary" onClick={()=>setUploadOpen(true)}>Upload images</button>}>
    <ToolNotice error={error} /><BrandPicker brands={brands} countKey="testing_count" onPick={selected=>setBrand(selected)} emptyText="No testing images yet. Upload a folder to create your first brand gallery." />
    {uploadOpen && <UploadDialog mode="testing" brands={brands} onClose={closeUpload} onComplete={uploadComplete} />}
  </ToolPageShell>;

  return <ToolPageShell Shell={Shell} title={brand.name} subtitle="Testing images" onToggleTheme={onToggleTheme} actions={<><button className="clay-btn-secondary" onClick={()=>{setBrand(null);setAsset("all");}}>All brands</button><button className="clay-btn-primary" onClick={()=>setUploadOpen(true)}>Upload images</button></>}>
    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:18 }}><button className="clay-btn-secondary" onClick={()=>setFilterOpen(value=>!value)} aria-expanded={filterOpen}>⌕ Filter assets</button><button className="clay-btn-secondary" onClick={()=>setAsset("all")} style={{ borderColor:asset==="all"?"var(--primary)":undefined }}>All</button>{assets.map(item=><button key={item} className="clay-btn-secondary" onClick={()=>setAsset(asset===item?"all":item)} style={{ borderColor:asset===item?"var(--primary)":undefined }}>{item.replace(/-/g," ")}</button>)}<span style={{ marginLeft:"auto", color:"var(--text-2)" }}>{images.length} images</span></div>
    {filterOpen && <div className="clay-card" style={{ padding:14, marginBottom:16, display:"flex", gap:8, flexWrap:"wrap" }}><b style={{ alignSelf:"center", marginRight:6 }}>Show asset</b>{assets.map(item=><button key={item} className="clay-btn-secondary" onClick={()=>{setAsset(item);setFilterOpen(false);}}>{item.replace(/-/g," ")}</button>)}</div>}
    <ToolNotice error={error} />
    {images.length ? <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:14 }}>{images.map(image=><article key={image.key} className="clay-card" style={{ overflow:"hidden" }}><button onClick={()=>setLightbox(image)} style={{ width:"100%", border:0, padding:0, background:"transparent", cursor:"zoom-in" }}><img src={resolveToolkitImageUrl(image.url)} loading="lazy" alt={image.asset==="general"?"Testing image":image.asset} style={{ display:"block", width:"100%", aspectRatio:"1/1", objectFit:"contain", background:"var(--surface-2)" }} /></button><div style={{ padding:"9px 12px", color:"var(--text-2)", fontSize:12 }}>{image.asset==="general"?"General":image.asset.replace(/-/g," ")}<a href={resolveToolkitImageUrl(image.url)} download style={{ float:"right", color:"var(--primary)", fontWeight:700, textDecoration:"none" }}>Download</a></div></article>)}</div> : <div className="clay-card" style={{ padding:24 }}>No images in this view yet.</div>}
    {lightbox && <div onClick={()=>setLightbox(null)} role="dialog" aria-modal="true" style={{ position:"fixed", inset:0, zIndex:600, background:"rgba(0,0,0,.84)", display:"grid", placeItems:"center", padding:24, cursor:"zoom-out" }}><img src={resolveToolkitImageUrl(lightbox.url)} alt="Expanded testing image" style={{ maxWidth:"95vw", maxHeight:"92vh", objectFit:"contain" }} /></div>}
    {uploadOpen && <UploadDialog mode="testing" brands={brands} onClose={closeUpload} onComplete={uploadComplete} />}
  </ToolPageShell>;
}

function PackshotsPage({ Shell, onToggleTheme }) {
  const [brands, setBrands] = React.useState([]);
  const [brand, setBrand] = React.useState(null);
  const [images, setImages] = React.useState([]);
  const [labelMode, setLabelMode] = React.useState("annotation_name");
  const [selected, setSelected] = React.useState([]);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [pendingBrand, setPendingBrand] = React.useState(null);
  const [error, setError] = React.useState("");
  const [lightbox, setLightbox] = React.useState(null);
  const replaceRef = React.useRef(null);
  async function loadBrands() { const data=await toolJson(`${TOOL_API}/brands`);setBrands(data.brands||[]); }
  async function loadImages(selectedBrand) { const data=await toolJson(`${TOOL_API}/packshots/${encodeURIComponent(selectedBrand.slug)}`);setImages(data.images||[]);setSelected([]); }
  React.useEffect(()=>{loadBrands().catch(err=>setError(err.message));},[]);
  React.useEffect(()=>{if(brand)loadImages(brand).catch(err=>setError(err.message));},[brand]);
  async function uploadComplete(slug) { const data=await toolJson(`${TOOL_API}/brands`);setBrands(data.brands||[]);const selectedBrand=(data.brands||[]).find(item=>item.slug===slug);if(selectedBrand){if(brand)setBrand(selectedBrand);else setPendingBrand(selectedBrand);} }
  function closeUpload() { setUploadOpen(false); if(pendingBrand){setBrand(pendingBrand);setPendingBrand(null);} }
  function downloadZip(names=[]) { const query=names.length?`?selected=${encodeURIComponent(names.join(","))}`:"";window.location.href=`${TOOL_API}/packshots/${encodeURIComponent(brand.slug)}/download${query}`; }
  async function replaceSelected(file) { if(!file||selected.length!==1)return;setError("");try{const form=new FormData();form.append("image",file,file.name);await toolJson(`${TOOL_API}/packshots/${encodeURIComponent(brand.slug)}/${encodeURIComponent(selected[0])}/replace`,{method:"POST",body:form});await loadImages(brand);}catch(err){setError(err.message);} }
  const toggleSelection = name => setSelected(value=>value.includes(name)?value.filter(item=>item!==name):[...value,name]);
  if(!brand)return <ToolPageShell Shell={Shell} title="Packshots" subtitle="Brand product references with SKU labels." onToggleTheme={onToggleTheme} actions={<button className="clay-btn-primary" onClick={()=>setUploadOpen(true)}>Upload packshots</button>}><ToolNotice error={error}/><BrandPicker brands={brands} countKey="packshot_count" onPick={setBrand} emptyText="No packshots yet. Upload an image folder and its mapping sheet."/>{uploadOpen&&<UploadDialog mode="packshots" brands={brands} onClose={closeUpload} onComplete={uploadComplete}/>}</ToolPageShell>;
  const selectedImages=images.filter(image=>selected.includes(image.file));
  const imageUrl=image=>resolveToolkitImageUrl(image.url);
  return <ToolPageShell Shell={Shell} title={brand.name} subtitle={`${images.length} packshots`} onToggleTheme={onToggleTheme} actions={<><button className="clay-btn-secondary" onClick={()=>setBrand(null)}>All brands</button><button className="clay-btn-primary" onClick={()=>setUploadOpen(true)}>Upload packshots</button></>}>
    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:18 }}><div role="group" aria-label="Packshot label" style={{ display:"inline-flex", border:"1px solid var(--border-strong)", borderRadius:10, padding:3 }}>{[["annotation_name","Annotation"],["name","Name"],["id","ID"]].map(([key,label])=><button key={key} onClick={()=>setLabelMode(key)} style={{ border:0, borderRadius:7, padding:"8px 12px", background:labelMode===key?"var(--primary)":"transparent", color:labelMode===key?"var(--on-primary)":"var(--text-2)", cursor:"pointer", fontWeight:700 }}>{label}</button>)}</div>
      {selected.length>0&&<><button className="clay-btn-secondary" onClick={()=>setSelected(images.map(image=>image.file))}>Select all</button><button className="clay-btn-secondary" onClick={()=>setSelected([])}>Deselect all</button>{selected.length===1?<><button className="clay-btn-secondary" onClick={()=>replaceRef.current?.click()}>Replace image</button><button className="clay-btn-primary" onClick={()=>{const item=selectedImages[0];if(item){const anchor=document.createElement("a");anchor.href=imageUrl(item);anchor.download=item.file;anchor.click();}}}>Download</button></>:<button className="clay-btn-primary" onClick={()=>downloadZip(selected)}>Download selected ({selected.length})</button>}<input ref={replaceRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{display:"none"}} onChange={e=>replaceSelected(e.target.files?.[0])}/></>}
      {selected.length===0&&<button className="clay-btn-primary" onClick={()=>downloadZip([])}>Download all as ZIP</button>}
    </div>
    <ToolNotice error={error}/>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(5,minmax(0,1fr))", gap:14 }} className="packshot-grid">{images.map(image=><article key={image.file} className="clay-card" style={{ position:"relative", padding:10, cursor:"pointer" }} onClick={event=>{if(event.target.type!=="checkbox")setLightbox(image);}}><input type="checkbox" aria-label={`Select ${image.file}`} checked={selected.includes(image.file)} onClick={e=>e.stopPropagation()} onChange={()=>toggleSelection(image.file)} style={{ position:"absolute", top:14, left:14, zIndex:2, width:20, height:20 }}/><img src={imageUrl(image)} loading="lazy" alt={image.name||image.file} style={{ display:"block", width:"100%", aspectRatio:"1/1", objectFit:"contain", background:"var(--surface-2)", borderRadius:8 }}/><div title={image[labelMode]||"—"} style={{ padding:"10px 2px 2px", fontSize:13, fontWeight:700, overflowWrap:"anywhere", minHeight:42 }}>{image[labelMode]||"—"}</div></article>)}</div>
    <style>{`@media(max-width:1100px){.packshot-grid{grid-template-columns:repeat(4,minmax(0,1fr))!important}}@media(max-width:800px){.packshot-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}@media(max-width:560px){.packshot-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}`}</style>
    {lightbox&&<div onClick={()=>setLightbox(null)} role="dialog" aria-modal="true" style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,.84)",display:"grid",placeItems:"center",padding:24,cursor:"zoom-out"}}><div style={{textAlign:"center"}}><img src={imageUrl(lightbox)} alt={lightbox.name||lightbox.file} style={{maxWidth:"95vw",maxHeight:"82vh",objectFit:"contain"}}/><div style={{color:"white",marginTop:12,fontWeight:700}}>{lightbox[labelMode]||"—"}</div></div></div>}
    {uploadOpen&&<UploadDialog mode="packshots" brands={brands} onClose={closeUpload} onComplete={uploadComplete}/>}
  </ToolPageShell>;
}

window.NeosisToolkit = { HomePage, TestingImagesPage, PackshotsPage, Select:AppSelect, Icon:ToolkitIcon };
