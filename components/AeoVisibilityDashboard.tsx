"use client";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, Globe2, MessageSquare, Plus, Sparkles } from "lucide-react";
import { AEO_ENGINES, aeoMetrics, containsBrand, defaultAeoConfig, isOwnedCitation, siteHost, type AeoConfig, type AeoObservation, type AeoPrompt, type Identification } from "@/lib/aeo-monitor";
import "./aeo-visibility.css";
import { AeoCollectionPanel, AeoModelComparison } from "./AeoCollectionPanel";
import type { AeoApiModel } from "@/lib/aeo-collection";

type Product={id:number;name:string;url?:string;websiteUrl?:string};
type PageAudit={checkedAt:string;url:string;checks:{id:string;label:string;passed:boolean;evidence:string;recommendation:string}[]};
type Tab="overview" | "prompts" | "history" | "improve";
type Scope="manual" | "api";
const tabs:[Tab,string][]=[["overview","Visibility overview"],["prompts","Prompts & checks"],["history","Answers & citations"],["improve","Improve source pages"]];
const identificationLabels:Record<Identification,string>={unreviewed:"Needs review",correct:"Correct identity",confused:"Wrong / confused",unknown:"Does not know"};
function newPrompt():AeoPrompt {return {id:`prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,text:"",intent:"discovery",language:"English",country:""};}
function displayDate(value:string) {return new Date(value).toLocaleString();}

export function AeoVisibilityDashboard({product,onOpenSeo,onOpenSettings,children}:{product:Product;onOpenSeo:()=>void;onOpenSettings:()=>void;children:ReactNode}) {
  const website=product.websiteUrl || product.url || "";
  const endpoint=`/api/products/${product.id}/answers/visibility`;
  const [config,setConfig]=useState<AeoConfig>(()=>defaultAeoConfig(product.name,website));
  const [rows,setRows]=useState<AeoObservation[]>([]);
  const [apiModels,setApiModels]=useState<AeoApiModel[]>([]);
  const [audit,setAudit]=useState<PageAudit | null>(null);
  const [tab,setTab]=useState<Tab>("overview");
  const [scope,setScope]=useState<Scope>("manual");
  const [engine,setEngine]=useState("all");
  const [days,setDays]=useState(30);
  const [intent,setIntent]=useState("all");
  const [promptFilter,setPromptFilter]=useState("all");
  const [loading,setLoading]=useState(true);
  const [asOf]=useState(()=>Date.now());
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [record,setRecord]=useState(false);
  const [draft,setDraft]=useState({promptId:"",prompt:"",engine:"ChatGPT",model:"",answer:"",citations:"",evidenceUrl:"",identification:"unreviewed",date:new Date().toISOString().slice(0,10),language:"English",country:"",notes:""});
  useEffect(()=>{
    const controller=new AbortController();
    async function load() {
      try {
        const response=await fetch(endpoint,{signal:controller.signal,cache:"no-store"});
        const data=await response.json() as {config:AeoConfig;observations:AeoObservation[];apiModels?:AeoApiModel[];error?:string};
        if (!response.ok) throw new Error(data.error || "Could not load visibility.");
        setConfig(data.config);setRows(data.observations);setApiModels(data.apiModels || []);
        const page=await fetch(`/api/products/${product.id}/seo`,{signal:controller.signal});
        const checked=await page.json() as {audit?:PageAudit};
        if (page.ok && Array.isArray(checked.audit?.checks)) setAudit(checked.audit!);
      } catch(e) {if(!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load visibility.");}
      finally {if(!controller.signal.aborted) setLoading(false);}
    }
    void load();return ()=>controller.abort();
  },[endpoint,product.id]);

  async function send(method:string,body:unknown) {
    const response=await fetch(endpoint,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(130000)});
    const data=await response.json() as {config?:AeoConfig;observation?:AeoObservation;error?:string};
    if (!response.ok) throw new Error(data.error || "The action could not be completed.");
    return data;
  }
  async function saveConfig() {
    setBusy("save");setError("");setMessage("");
    try {const result=await send("PUT",config);if(result.config)setConfig(result.config);setMessage("Monitoring plan saved. Existing answer history is retained.");}
    catch(e){setError(e instanceof Error?e.message:"Could not save plan.");}finally{setBusy("");}
  }
  async function run(promptId:string,selectedModels?:string[]) {
    setBusy(promptId);setError("");setMessage("");
    try {
      await send("PUT",config);
      const requested=selectedModels?.length?selectedModels:[undefined];
      const failures:string[]=[];
      let completed=0;
      for (const [index,model] of requested.entries()) {
        setMessage(`Collecting answer ${index+1} of ${requested.length}${model?` · ${model}`:""}…`);
        try {
          const result=await send("POST",{action:"probe",promptId,...(model?{model}:{})});
          if(!result.observation)throw new Error("No answer was returned.");
          setRows(current=>[result.observation!,...current]);completed++;
        } catch(e) {failures.push(`${model || "Shared AI"}: ${e instanceof Error?e.message:"Check failed."}`);}
      }
      if(!completed)throw new Error(failures.join(" "));
      setScope("api");setEngine("all");setTab("history");setIntent("all");setPromptFilter(promptId);
      setMessage(`${completed} API answer${completed===1?"":"s"} saved with actual model names. Review product identity for each answer.`);
      if(failures.length)setError(`${failures.length} model check${failures.length===1?"":"s"} failed; successful answers were retained. ${failures.join(" ")}`);
    }catch(e){setError(e instanceof Error?e.message:"Could not run check.");}finally{setBusy("");}
  }
  async function recordAnswer() {
    setBusy("record");setError("");setMessage("");
    try {
      const selected=config.prompts.find(p=>p.id===draft.promptId);
      const result=await send("POST",{action:"record",observation:{...draft,prompt:selected?.text || draft.prompt,source:"manual",observedAt:new Date(`${draft.date}T00:00:00Z`).toISOString(),citations:draft.citations.split(/\n/).map(s=>s.trim()).filter(Boolean)}});
      if(result.observation)setRows(current=>[result.observation!,...current]);
      setRecord(false);setScope("manual");setEngine("all");setIntent("all");setPromptFilter("all");setTab("history");setMessage("Captured answer saved with its engine, date, and evidence.");
      setDraft(value=>({...value,answer:"",citations:"",evidenceUrl:"",notes:""}));
    }catch(e){setError(e instanceof Error?e.message:"Could not record answer.");}finally{setBusy("");}
  }
  async function assess(id:number,identification:Identification) {
    setError("");
    try {const result=await send("PATCH",{id,identification});if(result.observation)setRows(current=>current.map(r=>r.id===id?result.observation!:r));}
    catch(e){setError(e instanceof Error?e.message:"Could not save assessment.");}
  }
  async function inspect() {
    setBusy("inspect");setError("");
    try {const response=await fetch(`/api/products/${product.id}/seo`,{method:"POST"});const data=await response.json() as {audit?:PageAudit;error?:string};if(!response.ok)throw new Error(data.error || "Page check failed.");if(data.audit)setAudit(data.audit);setMessage("Public page checks updated. These are page observations, not engine visibility measurements.");}
    catch(e){setError(e instanceof Error?e.message:"Could not inspect page.");}finally{setBusy("");}
  }
  function choosePrompt(id:string) {const prompt=config.prompts.find(p=>p.id===id);setDraft(d=>({...d,promptId:id,prompt:prompt?.text || "",language:prompt?.language || d.language,country:prompt?.country || d.country}));}
  function updatePrompt(id:string,patch:Partial<AeoPrompt>) {setConfig(value=>({...value,prompts:value.prompts.map(p=>p.id===id?{...p,...patch}:p)}));}

  const cutoff=asOf-days*86400000;
  const filtered=rows.filter(r=>r.source===scope && new Date(r.observedAt).getTime()>=cutoff && (engine==="all" || r.engine===engine) && (promptFilter==="all" || r.promptId===promptFilter) && (intent==="all" || config.prompts.find(p=>p.id===r.promptId)?.intent===intent));
  const stats=aeoMetrics(filtered,product.name,website);
  const ownedPages=new Map<string,number>();
  filtered.forEach(r=>r.citations.filter(url=>isOwnedCitation(url,website)).forEach(url=>ownedPages.set(url,(ownedPages.get(url)||0)+1)));
  const timeline=[...new Set(filtered.map(r=>r.observedAt.slice(0,10)))].sort().map(date=>({date,...aeoMetrics(filtered.filter(r=>r.observedAt.startsWith(date)),product.name,website)}));
  const competitorCounts=config.competitors.map(name=>({name,count:filtered.filter(r=>containsBrand(r.answer,name,"")).length})).sort((a,b)=>b.count-a.count);
  const lastWeek=filtered.filter(r=>new Date(r.observedAt).getTime()>=asOf-7*86400000);
  const previousWeek=filtered.filter(r=>{const age=asOf-new Date(r.observedAt).getTime();return age>=7*86400000 && age<14*86400000;});
  const change=lastWeek.length && previousWeek.length ? aeoMetrics(lastWeek,product.name,website).mentionRate!-aeoMetrics(previousWeek,product.name,website).mentionRate! : null;
  const pct=(value:number|null)=>value===null?"—":`${value}%`;
  const firstPrompt=config.prompts.find(p=>p.intent==="brand" && p.text.trim());

  return <section className="aeo-dashboard"><header className="aeo-hero"><div><p className="eyebrow">Website · AEO / GEO</p><h2>How AI sees {product.name}</h2><p>Understand your brand’s story, follow citations, and turn missed answers into better public pages.</p><button type="button" className="aeo-domain" onClick={onOpenSettings}><Globe2 size={16}/>{siteHost(website)||"Set product website"}<ArrowUpRight size={14}/></button></div><div className="aeo-hero-actions"><button type="button" className="secondary-button" disabled={loading||Boolean(busy)} onClick={()=>{setRecord(true);setTab("prompts");}}>Record engine answer</button><button type="button" className="primary-button" disabled={loading||Boolean(busy)||!firstPrompt} onClick={()=>firstPrompt&&void run(firstPrompt.id)}><Sparkles size={16}/>{busy&&config.prompts.some(p=>p.id===busy)?"Checking shared AI…":"Run API brand check"}</button></div></header>
    <nav className="aeo-tabs" aria-label="AI visibility sections">{tabs.map(([id,label])=><button type="button" key={id} aria-current={tab===id?"page":undefined} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {error&&<p role="alert" className="error-banner">{error}</p>}{message&&<p role="status" className="notice">{message}</p>}
    {tab!=="improve"&&<><div className="aeo-filters"><div className="aeo-segment"><button type="button" aria-pressed={scope==="manual"} onClick={()=>{setScope("manual");setEngine("all");}}>Captured engine answers</button><button type="button" aria-pressed={scope==="api"} onClick={()=>{setScope("api");setEngine("all");}}>Configured API checks</button></div><label>Period<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option></select></label><label>Engine<select value={engine} onChange={e=>setEngine(e.target.value)}><option value="all">All in this source</option>{(scope==="api"?["Configured API"]:AEO_ENGINES.filter(e=>e!=="Configured API")).map(e=><option key={e}>{e}</option>)}</select></label><label>Intent<select value={intent} onChange={e=>setIntent(e.target.value)}><option value="all">All intents</option><option value="brand">Brand</option><option value="discovery">Discovery</option><option value="comparison">Comparison</option></select></label></div><p className="aeo-method">{scope==="manual"?"Results below come from answers you captured from the named engines. Source links and citations are supplied evidence, not independently verified by Sorted.":"These are knowledge probes from Sorted’s configured API model, without a web-browsing tool or a supplied product brief. They do not measure ChatGPT, Gemini, Claude, Perplexity, or AI Overviews search visibility."} Metrics describe this sample of answers, not market-wide visibility. Brand prompts already name the brand; use discovery prompts to test unprompted inclusion.</p></>}
    {tab!=="improve"&&<label className="aeo-prompt-filter">Compare the same prompt<select value={promptFilter} onChange={e=>setPromptFilter(e.target.value)}><option value="all">All prompts</option>{config.prompts.map((p,i)=><option key={p.id} value={p.id}>{p.text||`Prompt ${i+1}`}</option>)}</select></label>}
    {loading&&tab!=="improve"?<p role="status">Loading AI visibility…</p>:null}
    {!loading&&tab==="prompts"&&<AeoCollectionPanel prompts={config.prompts} models={apiModels} busy={Boolean(busy)} onCompare={(id,models)=>void run(id,models)} onCapture={(id,engine)=>{choosePrompt(id);setDraft(value=>({...value,engine}));setRecord(true);}}/>}
    {!loading&&tab==="history"&&scope==="api"&&<AeoModelComparison rows={filtered}/>}
    {!loading&&tab==="overview"&&<>
      <div className="aeo-metrics">{[[pct(stats.mentionRate),"Brand mentioned",`${stats.mentioned} of ${stats.total} captured answers`],[pct(stats.recognitionRate),"Correctly identified",`${stats.correct} of ${stats.reviewed} assessed answers`],[pct(stats.citationRate),"Website cited",`${stats.cited} answers link to this site`],[String(stats.total),"Answers in sample",change===null?"Weekly comparison needs both weeks":`${change>=0?"+":""}${change} percentage points vs prior week`]].map(([value,label,detail])=><article key={label}><strong>{value}</strong><span>{label}</span><small>{detail}</small></article>)}</div>
      {!stats.total&&<div className="aeo-empty"><MessageSquare size={28}/><div><h3>Your visibility baseline starts here</h3><p>Capture the same prompt across the engines you use, or run a separate check with the shared API. Empty results mean there is no recorded evidence yet.</p></div><button type="button" className="secondary-button" onClick={()=>setTab("prompts")}>Set up the first check →</button></div>}
      <section className="aeo-panel"><div className="aeo-panel-heading"><div><p className="eyebrow">Brand narrative</p><h3>What each engine says</h3><p>Latest captured answer for each engine within your filters. Read the full answer before assessing identity.</p></div><button type="button" className="text-button" onClick={()=>setTab("history")}>All answers →</button></div><div className="aeo-engine-grid">{(scope==="api"?["Configured API"]:AEO_ENGINES.filter(e=>e!=="Configured API"&&e!=="Other")).map(name=>{const row=filtered.find(r=>r.engine===name);return <article key={name}><div><strong>{name}</strong><span className={`aeo-status ${row?.identification||"empty"}`}>{row?identificationLabels[row.identification]:"No observation"}</span></div>{row?<><p>{row.answer.slice(0,300)}{row.answer.length>300?"…":""}</p><small>{displayDate(row.observedAt)}{row.model?` · ${row.model}`:""}</small><button type="button" className="text-button" onClick={()=>{setEngine(name);setTab("history");}}>Read & assess →</button></>:<p>Capture an answer from this engine to start its history.</p>}</article>;})}</div></section>
      <div className="aeo-two-col"><section className="aeo-panel"><h3>Visibility over time</h3><p>Daily mention rate in this sample · {filtered.length} answers. Changes can reflect prompt, model, and sample differences.</p>{timeline.length?<div className="aeo-timeline">{timeline.map(day=><div key={day.date}><span>{day.date}</span><div><i style={{width:`${day.mentionRate||0}%`}}/></div><b>{pct(day.mentionRate)}</b><small>{day.total} answers</small></div>)}</div>:<p className="aeo-empty-inline">History builds as you capture answers. No backfilled historical data is assumed.</p>}</section><section className="aeo-panel"><h3>Competitor mentions</h3><p>Answers mentioning each tracked competitor; counts can overlap.</p>{competitorCounts.length?competitorCounts.map(c=><div className="aeo-competitor" key={c.name}><span>{c.name}</span><strong>{c.count} / {stats.total}</strong></div>):<p className="aeo-empty-inline">Add competitors in Prompts & checks to compare the same captured answers.</p>}<button type="button" className="text-button" onClick={()=>setTab("prompts")}>Manage tracked competitors →</button></section></div>
      <div className="aeo-two-col"><section className="aeo-panel"><h3>Pages cited in answers</h3><p>Owned URLs supplied with captured answers in the selected period.</p>{ownedPages.size?[...ownedPages].sort((a,b)=>b[1]-a[1]).map(([url,count])=><div className="aeo-citation" key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a><strong>{count}</strong></div>):<p className="aeo-empty-inline">No citations have been recorded for this site in this sample.</p>}<button type="button" className="text-button" onClick={()=>setTab("history")}>Inspect answers and sources →</button></section><section className="aeo-panel"><div className="aeo-panel-heading"><h3>Public page checks</h3><button type="button" className="secondary-button" disabled={Boolean(busy)||!website} onClick={()=>void inspect()}>{busy==="inspect"?"Checking…":audit?"Recheck page":"Inspect page"}</button></div>{audit?<><div className="aeo-readiness"><strong>{audit.checks.filter(c=>c.passed).length}<small> / {audit.checks.length}</small></strong><span>Page checks passing<br/><small>Checked {displayDate(audit.checkedAt)}</small></span></div><p>This reviews the page’s response, metadata, headings and indexing tag. It does not certify crawler access or guarantee citations.</p>{audit.checks.filter(c=>!c.passed).slice(0,3).map(c=><p key={c.id}>○ {c.label}</p>)}</>:<p className="aeo-empty-inline">Inspect the saved public page for observed issues. Readiness is separate from actual AI mentions and citations.</p>}<button type="button" className="text-button" onClick={onOpenSeo}>Open website SEO findings →</button></section></div>
      <section className="aeo-panel"><p className="eyebrow">Recommended next actions</p><h3>Improve the evidence behind the answer</h3><div className="aeo-action-list">{[{title:stats.confused?`Resolve ${stats.confused} confused identity assessment${stats.confused===1?"":"s"}`:"Publish one clear product identity",detail:"Use the same product name, canonical website, audience, and factual explanation across your public pages.",action:()=>setTab("improve"),label:"Improve source pages"},{title:stats.total?"Repeat your discovery prompts consistently":"Capture a cross-engine baseline",detail:"Use the same prompt, language, and country context. Record the full answer and its visible sources before comparing results.",action:()=>setTab("prompts"),label:"Open monitoring plan"},{title:stats.cited?"Strengthen the pages already cited":"Build useful, source-backed answers",detail:"Make important answers visible, specific, current, and linked from relevant pages. Markup should match the visible content.",action:()=>setTab("improve"),label:"Work on answers"}].map((a,i)=><article key={a.title}><b>{i+1}</b><div><strong>{a.title}</strong><p>{a.detail}</p></div><button type="button" className="secondary-button" onClick={a.action}>{a.label} →</button></article>)}</div></section>
    </>}
    {!loading&&tab==="prompts"&&<><section className="aeo-panel"><div className="aeo-panel-heading"><div><h3>Your monitoring plan</h3><p>Use brand prompts for identity and discovery prompts for category inclusion. API checks use the shared provider; capture consumer-engine results separately.</p></div><button type="button" className="secondary-button" disabled={config.prompts.length>=30} onClick={()=>setConfig(c=>({...c,prompts:[...c.prompts,newPrompt()]}))}><Plus size={15}/>Add prompt</button></div><div className="aeo-prompt-list">{config.prompts.map((p,index)=><article key={p.id}><label>Prompt {index+1}<textarea rows={2} value={p.text} maxLength={1000} onChange={e=>updatePrompt(p.id,{text:e.target.value})}/></label><div className="aeo-inline-fields"><label>Intent<select value={p.intent} onChange={e=>updatePrompt(p.id,{intent:e.target.value as AeoPrompt["intent"]})}><option value="brand">Brand identity</option><option value="discovery">Category discovery</option><option value="comparison">Comparison</option></select></label><label>Language<input value={p.language} onChange={e=>updatePrompt(p.id,{language:e.target.value})}/></label><label>Country context<input value={p.country} placeholder="Optional" onChange={e=>updatePrompt(p.id,{country:e.target.value})}/></label></div><div className="aeo-inline-actions"><button type="button" className="primary-button" disabled={Boolean(busy)||!p.text.trim()} onClick={()=>void run(p.id)}><Sparkles size={14}/>{busy===p.id?"Running API check…":"Run API check"}</button><button type="button" className="secondary-button" onClick={()=>{choosePrompt(p.id);setRecord(true);}}>Record engine answer</button><button type="button" className="text-button" onClick={()=>setConfig(c=>({...c,prompts:c.prompts.filter(item=>item.id!==p.id)}))}>Remove from plan</button></div></article>)}</div><label className="aeo-block-label">Competitors · one brand name per line<textarea rows={3} value={config.competitors.join("\n")} onChange={e=>setConfig(c=>({...c,competitors:e.target.value.split("\n")}))} placeholder="Add brands you want to compare"/></label><button type="button" className="primary-button" disabled={Boolean(busy)} onClick={()=>void saveConfig()}>{busy==="save"?"Saving…":"Save monitoring plan"}</button><p>Removing a prompt from the plan preserves its captured answer history. Country is recorded context; API probes are not geolocated searches.</p></section><button type="button" className="secondary-button" onClick={()=>setRecord(true)}>＋ Record an engine answer</button></>}
    {record&&tab!=="improve"&&<section className="aeo-panel aeo-record"><div className="aeo-panel-heading"><div><h3>Record an actual engine answer</h3><p>Run a prompt in your chosen engine, then paste its full answer and visible citation URLs. Keep the model and search mode in the notes.</p></div><button type="button" className="text-button" onClick={()=>setRecord(false)}>Close</button></div><div className="aeo-inline-fields"><label>Saved prompt<select value={draft.promptId} onChange={e=>choosePrompt(e.target.value)}><option value="">Custom prompt</option>{config.prompts.map((p,i)=><option key={p.id} value={p.id}>{p.text.slice(0,75)||`Prompt ${i+1}`}</option>)}</select></label><label>Engine<select value={draft.engine} onChange={e=>setDraft(d=>({...d,engine:e.target.value}))}>{AEO_ENGINES.filter(e=>e!=="Configured API").map(e=><option key={e}>{e}</option>)}</select></label><label>Observed on<input type="date" max={new Date().toISOString().slice(0,10)} value={draft.date} onChange={e=>setDraft(d=>({...d,date:e.target.value}))}/></label></div><label className="aeo-block-label">Exact prompt<textarea rows={2} value={config.prompts.find(p=>p.id===draft.promptId)?.text || draft.prompt} disabled={Boolean(draft.promptId)} onChange={e=>setDraft(d=>({...d,prompt:e.target.value}))}/></label><div className="aeo-inline-fields"><label>Model / search mode<input value={draft.model} placeholder="As shown in the engine" onChange={e=>setDraft(d=>({...d,model:e.target.value}))}/></label><label>Language<input value={draft.language} onChange={e=>setDraft(d=>({...d,language:e.target.value}))}/></label><label>Country context<input value={draft.country} onChange={e=>setDraft(d=>({...d,country:e.target.value}))}/></label></div><label className="aeo-block-label">Full answer<textarea rows={7} maxLength={30000} value={draft.answer} onChange={e=>setDraft(d=>({...d,answer:e.target.value}))}/></label><div className="aeo-two-col"><label className="aeo-block-label">Visible citation URLs · one per line<textarea rows={3} value={draft.citations} onChange={e=>setDraft(d=>({...d,citations:e.target.value}))}/></label><div><label className="aeo-block-label">Shared answer / evidence URL<input type="url" value={draft.evidenceUrl} placeholder="Optional share link" onChange={e=>setDraft(d=>({...d,evidenceUrl:e.target.value}))}/></label><label className="aeo-block-label">Product identity assessment<select value={draft.identification} onChange={e=>setDraft(d=>({...d,identification:e.target.value}))}>{Object.entries(identificationLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label></div></div><label className="aeo-block-label">Notes<input value={draft.notes} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))}/></label><button type="button" className="primary-button" disabled={Boolean(busy)||!draft.answer.trim()||!(draft.promptId||draft.prompt.trim())||!draft.date} onClick={()=>void recordAnswer()}>{busy==="record"?"Saving…":"Save captured answer"}</button></section>}
    {!loading&&tab==="history"&&<section className="aeo-panel"><div className="aeo-panel-heading"><div><h3>Answers, identity & sources</h3><p>{filtered.length} answers in this view. Review identity separately from literal name mentions.</p></div><button type="button" className="secondary-button" onClick={()=>setRecord(true)}>Record engine answer</button></div>{filtered.length?filtered.map(row=><article className="aeo-answer-card" key={row.id}><div className="aeo-panel-heading"><div><strong>{row.engine}</strong><small>{row.model?` · ${row.model}`:""} · {displayDate(row.observedAt)} · {row.language}{row.country?` / ${row.country}`:""}</small></div><label>Identity<select value={row.identification} onChange={e=>row.id&&void assess(row.id,e.target.value as Identification)}>{Object.entries(identificationLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label></div><blockquote>{row.prompt}</blockquote><div className="aeo-answer-text">{row.answer}</div><div className="aeo-answer-flags"><span>{containsBrand(row.answer,product.name,website)?"Brand mentioned":"No literal brand mention"}</span><span>{row.citations.some(url=>isOwnedCitation(url,website))?"Owned page cited":"No owned citation recorded"}</span><span>{row.source==="api"?"API knowledge probe":"Captured engine answer"}</span></div>{row.citations.length>0&&<div className="aeo-source-links"><strong>Recorded citations</strong>{row.citations.map(url=><a key={url} href={url} target="_blank" rel="noreferrer">{url}</a>)}</div>}{row.evidenceUrl&&<a href={row.evidenceUrl} target="_blank" rel="noreferrer">Open original answer / evidence ↗</a>}{row.notes&&<p className="aeo-method">{row.notes}</p>}</article>):<div className="aeo-empty-inline">No answers match these filters. Record an engine answer or run an API check to begin.</div>}</section>}
    <div hidden={tab!=="improve"}>{children}</div>
    <footer className="aeo-footer"><Check size={14}/> History is product-specific and starts with your first captured answer. This view uses up to the latest 200 observations. <a href="https://developers.google.com/search/docs/appearance/ai-features" target="_blank" rel="noreferrer">Google’s guidance for AI features ↗</a></footer>
  </section>;
}
