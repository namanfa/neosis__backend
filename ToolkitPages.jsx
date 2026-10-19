const TOOL_API = (window.NOESIS_API_URL || "http://localhost:7860/api/sessions").replace(/\/api\/sessions\/?$/, "") + "/api/tools";
const TOOL_IMAGE_TYPES = new Set(["jpg", "jpeg", "png", "webp"]);
const TOOL_BATCH_SIZE = 20;

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
  return <ToolPageShell Shell={Shell} title="IR Data Tool" subtitle="Choose a task to get started." onToggleTheme={onToggleTheme}>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:18, maxWidth:1180 }}>
      {TOOL_CARDS.map(card => <button key={card.title} disabled={card.soon} onClick={() => { if (!card.soon) window.location.hash = card.route; }} className="clay-card clay-card-interactive" style={{ textAlign:"left", padding:22, minHeight:160, cursor:card.soon?"not-allowed":"pointer", opacity:card.soon ? 0.58 : 1, color:"var(--text)" }}>
        <span style={{ display:"inline-grid", placeItems:"center", width:42, height:42, borderRadius:12, background:"var(--primary-soft)", color:"var(--primary)", fontSize:23 }}>{card.icon}</span>
        <h2 style={{ marginTop:17, fontSize:17 }}>{card.title}</h2><p style={{ marginTop:7, color:"var(--text-2)", lineHeight:1.55 }}>{card.description}</p>
      {card.soon && <span style={{ display:"inline-block", marginTop:12, padding:"4px 8px", borderRadius:99, background:"var(--surface-3)", color:"var(--text-3)", fontSize:11, fontWeight:700 }}>Coming soon</span>}
      </button>)}
    </div>
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
      {newBrand ? <input value={newBrandName} onChange={e=>setNewBrandName(e.target.value)} placeholder="Brand name" style={{ width:"100%", marginTop:12, padding:12, borderRadius:9, border:"1px solid var(--border-strong)", background:"var(--surface-2)", color:"var(--text)" }} /> : <select value={brandSlug} onChange={e=>setBrandSlug(e.target.value)} style={{ width:"100%", marginTop:12, padding:12, borderRadius:9, border:"1px solid var(--border-strong)", background:"var(--surface-2)", color:"var(--text)" }}><option value="">Choose a brand</option>{usableBrands.map(brand=><option key={brand.slug} value={brand.slug}>{brand.name}</option>)}</select>}
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
    {images.length ? <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:14 }}>{images.map(image=><article key={image.key} className="clay-card" style={{ overflow:"hidden" }}><button onClick={()=>setLightbox(image)} style={{ width:"100%", border:0, padding:0, background:"transparent", cursor:"zoom-in" }}><img src={`${TOOL_API.replace("/api/tools", "")}${image.url}`} loading="lazy" alt={image.asset==="general"?"Testing image":image.asset} style={{ display:"block", width:"100%", aspectRatio:"1/1", objectFit:"contain", background:"var(--surface-2)" }} /></button><div style={{ padding:"9px 12px", color:"var(--text-2)", fontSize:12 }}>{image.asset==="general"?"General":image.asset.replace(/-/g," ")}<a href={`${TOOL_API.replace("/api/tools", "")}${image.url}`} download style={{ float:"right", color:"var(--primary)", fontWeight:700, textDecoration:"none" }}>Download</a></div></article>)}</div> : <div className="clay-card" style={{ padding:24 }}>No images in this view yet.</div>}
    {lightbox && <div onClick={()=>setLightbox(null)} role="dialog" aria-modal="true" style={{ position:"fixed", inset:0, zIndex:600, background:"rgba(0,0,0,.84)", display:"grid", placeItems:"center", padding:24, cursor:"zoom-out" }}><img src={`${TOOL_API.replace("/api/tools", "")}${lightbox.url}`} alt="Expanded testing image" style={{ maxWidth:"95vw", maxHeight:"92vh", objectFit:"contain" }} /></div>}
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
  const imageUrl=image=>`${TOOL_API.replace("/api/tools", "")}${image.url}`;
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

window.NeosisToolkit = { HomePage, TestingImagesPage, PackshotsPage };
