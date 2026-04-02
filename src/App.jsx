import { useState, useEffect, useCallback } from "react";

// ─── FONTS & GLOBAL STYLES (OocyteAI aesthetic) ──────────────────────────────
const _gs = document.createElement("style");
_gs.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap');
  @keyframes spin { to { transform: rotate(360deg) } }
  * { box-sizing: border-box; font-family: 'Montserrat', system-ui, sans-serif; }
  body { margin: 0; background: var(--color-background-tertiary); }
  input, select, textarea, button { font-family: 'Montserrat', system-ui, sans-serif; }
  :root {
    --color-background-primary: #ffffff;
    --color-background-secondary: #f8fafc;
    --color-background-tertiary: #f1f5f9;
    --color-text-primary: #1e293b;
    --color-text-secondary: #64748b;
    --color-border-secondary: #cbd5e1;
    --color-border-tertiary: #e2e8f0;
  }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
  .ai-spin { animation: spin 0.8s linear infinite; }
  @media(max-width:768px){
    .grid2 { grid-template-columns: 1fr !important; }
    .kpi-grid { grid-template-columns: repeat(2,1fr) !important; }
    .result-row { flex-direction: column !important; }
    .btn-row { flex-direction: column !important; }
    .btn-row button { width: 100% !important; text-align: center !important; }
    .step-label { display: none !important; }
    .step-circle { width: 24px !important; height: 24px !important; font-size: 10px !important; }
    .step-line { margin: 0 4px !important; }
    .oms-grid { grid-template-columns: 1fr !important; }
    .patient-meta { grid-template-columns: repeat(2,1fr) !important; }
    .preview-header { flex-direction: column !important; }
    .history-row { flex-direction: column !important; align-items: flex-start !important; }
    .analysis-row-inner { flex-direction: column !important; align-items: flex-start !important; }
    .portal-search-row { flex-wrap: wrap !important; }
    .sub-search { width: 100% !important; }
    .deleted-inner { flex-direction: column !important; }
    .deleted-btns { flex-direction: column !important; width: 100% !important; }
    .deleted-btns button { width: 100% !important; text-align: center !important; }
    .dropzone { padding: 20px 12px !important; }
  }
`;
document.head.appendChild(_gs);

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBPK7myme9qDaYu2AT_Mh8T0ESKJAqHwqc",
  authDomain: "oocyte-cegyr.firebaseapp.com",
  projectId: "oocyte-cegyr",
  storageBucket: "oocyte-cegyr.firebasestorage.app",
  messagingSenderId: "1078641763806",
  appId: "1:1078641763806:web:6daba0fca48f941bb8294f"
};

// ─── HARDCODED AUTH ───────────────────────────────────────────────────────────
const MASTER_ADMIN = { id:"__master__", username:"FertiAdmin", password:"Ferti2025!", role:"masterAdmin", displayName:"Master Admin", clinicId:null, permissions:{analysis:true,portal:true,stats:true,training:true,admin:true} };
const CLINIC_ADMIN_CEGYR = { id:"__clinicadmin_cegyr__", username:"Laboratoriocegyr", password:"Labo2021", role:"clinicAdmin", displayName:"Administrador CEGYR", clinicId:"cegyr", permissions:{analysis:true,portal:true,stats:true,training:true,admin:true} };
const CLINIC_ID = "cegyr";
const clinicPath = (cid, sub) => `clinics/${cid}/${sub}`;
const prefixUsername = (cid, u) => `${cid}_${u.trim().toLowerCase()}`;
const stripPrefix = (cid, u) => { const p=cid+"_"; return u?.startsWith(p)?u.slice(p.length):u; };

// ─── OMS 2021 ─────────────────────────────────────────────────────────────────
const OMS = {
  concentration:       { min:16,   max:null, unit:"mill/mL", label:"Concentración" },
  progressiveMotility: { min:30,   max:null, unit:"%",       label:"Motilidad Progresiva (PR)" },
  totalMotility:       { min:42,   max:null, unit:"%",       label:"Motilidad Total (PR+NP)" },
  morphology:          { min:4,    max:null, unit:"%",       label:"Morfología Kruger" },
  vitality:            { min:54,   max:null, unit:"%",       label:"Vitalidad" },
  volume:              { min:1.4,  max:null, unit:"mL",      label:"Volumen" },
  dfi:                 { min:null, max:25,   unit:"%",       label:"DFI · Fragmentación ADN" },
};
const PARAMS_LIST = [
  { key:"concentration",       required:true  },
  { key:"progressiveMotility", required:true  },
  { key:"totalMotility",       required:true  },
  { key:"morphology",          required:true  },
  { key:"vitality",            required:true  },
  { key:"volume",              required:true  },
  { key:"dfi",                 required:false },
];

// ─── FIREBASE ─────────────────────────────────────────────────────────────────
let db = null;
function loadFirebase() {
  if (db) return Promise.resolve(db);
  return new Promise(resolve => {
    const load = src => new Promise((res,rej)=>{ const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s); });
    Promise.all([
      load("https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js"),
      load("https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js"),
    ]).then(()=>{ if(!window.firebase.apps.length)window.firebase.initializeApp(FIREBASE_CONFIG); db=window.firebase.firestore(); resolve(db); })
      .catch(()=>resolve(null));
  });
}
async function getDB() { if(db)return db; return loadFirebase(); }
const TS = () => window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date().toISOString();

// ─── DB OPS ───────────────────────────────────────────────────────────────────
async function saveAnalysis(cid, data) {
  try {
    const d=await getDB(); if(!d)throw 0;
    const col=d.collection(clinicPath(cid,"analyses")); const ref=data.id?col.doc(data.id):col.doc();
    const item={...data,id:ref.id,type:"sperm",clinicId:cid,updatedAt:TS()};
    if(!data.id)item.createdAt=TS();
    await ref.set(item,{merge:true}); return item;
  } catch {
    const key=`sperm_${cid}`; const arr=JSON.parse(localStorage.getItem(key)||"[]");
    const item={...data,id:data.id||`l${Date.now()}`,type:"sperm",clinicId:cid,createdAt:data.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
    const i=arr.findIndex(a=>a.id===item.id); if(i>=0)arr[i]=item; else arr.unshift(item);
    localStorage.setItem(key,JSON.stringify(arr)); return item;
  }
}
async function getAnalyses(cid) {
  try { const d=await getDB(); if(!d)throw 0; const s=await d.collection(clinicPath(cid,"analyses")).where("type","==","sperm").orderBy("createdAt","desc").get(); return s.docs.map(x=>({...x.data(),id:x.id})); }
  catch { return JSON.parse(localStorage.getItem(`sperm_${cid}`)||"[]"); }
}
async function softDeleteAnalysis(cid,id,data) {
  try { const d=await getDB(); if(!d)throw 0; await d.collection(clinicPath(cid,"deleted")).doc(id).set({...data,deletedAt:TS()}); await d.collection(clinicPath(cid,"analyses")).doc(id).delete(); }
  catch {
    const key=`sperm_${cid}`; localStorage.setItem(key,JSON.stringify(JSON.parse(localStorage.getItem(key)||"[]").filter(a=>a.id!==id)));
    const dk=`sperm_del_${cid}`; const darr=JSON.parse(localStorage.getItem(dk)||"[]"); darr.unshift({...data,deletedAt:new Date().toISOString()}); localStorage.setItem(dk,JSON.stringify(darr));
  }
}
async function getDeletedAnalyses(cid) {
  try { const d=await getDB(); if(!d)throw 0; const s=await d.collection(clinicPath(cid,"deleted")).where("type","==","sperm").orderBy("deletedAt","desc").get(); return s.docs.map(x=>({...x.data(),id:x.id})); }
  catch { return JSON.parse(localStorage.getItem(`sperm_del_${cid}`)||"[]"); }
}
async function restoreAnalysis(cid,item) {
  try { const d=await getDB(); if(!d)throw 0; const{deletedAt,...rest}=item; await d.collection(clinicPath(cid,"analyses")).doc(item.id).set({...rest,updatedAt:TS()}); await d.collection(clinicPath(cid,"deleted")).doc(item.id).delete(); }
  catch {
    const{deletedAt,...rest}=item; const key=`sperm_${cid}`; const arr=JSON.parse(localStorage.getItem(key)||"[]"); arr.unshift(rest); localStorage.setItem(key,JSON.stringify(arr));
    const dk=`sperm_del_${cid}`; localStorage.setItem(dk,JSON.stringify(JSON.parse(localStorage.getItem(dk)||"[]").filter(a=>a.id!==item.id)));
  }
}
async function permDeleteAnalysis(cid,id) {
  try { const d=await getDB(); if(!d)throw 0; await d.collection(clinicPath(cid,"deleted")).doc(id).delete(); }
  catch { const dk=`sperm_del_${cid}`; localStorage.setItem(dk,JSON.stringify(JSON.parse(localStorage.getItem(dk)||"[]").filter(a=>a.id!==id))); }
}
async function getUsers(cid) {
  try { const d=await getDB(); if(!d)throw 0; const s=await d.collection(clinicPath(cid,"users")).get(); return s.docs.map(x=>({...x.data(),id:x.id})); }
  catch { return JSON.parse(localStorage.getItem(`users_${cid}`)||"[]"); }
}
async function saveUser(cid,u) {
  try { const d=await getDB(); if(!d)throw 0; const col=d.collection(clinicPath(cid,"users")); const ref=u.id?col.doc(u.id):col.doc(); await ref.set({...u,id:ref.id},{merge:true}); return{...u,id:ref.id}; }
  catch { const key=`users_${cid}`; const arr=JSON.parse(localStorage.getItem(key)||"[]"); const item={...u,id:u.id||`u${Date.now()}`}; const i=arr.findIndex(x=>x.id===item.id); if(i>=0)arr[i]=item; else arr.push(item); localStorage.setItem(key,JSON.stringify(arr)); return item; }
}
async function deleteUser(cid,id) {
  try { const d=await getDB(); if(!d)throw 0; await d.collection(clinicPath(cid,"users")).doc(id).delete(); }
  catch { const key=`users_${cid}`; localStorage.setItem(key,JSON.stringify(JSON.parse(localStorage.getItem(key)||"[]").filter(u=>u.id!==id))); }
}
async function getPlatformClinics() {
  try { const d=await getDB(); if(!d)throw 0; const s=await d.collection("platformClinics").get(); return s.docs.map(x=>({...x.data(),id:x.id})); }
  catch { return JSON.parse(localStorage.getItem("platformClinics")||"[]"); }
}
async function savePlatformClinic(c) {
  try { const d=await getDB(); if(!d)throw 0; const col=d.collection("platformClinics"); const ref=c.id?col.doc(c.id):col.doc(); await ref.set({...c,id:ref.id},{merge:true}); return{...c,id:ref.id}; }
  catch { const arr=JSON.parse(localStorage.getItem("platformClinics")||"[]"); const item={...c,id:c.id||`clinic_${Date.now()}`}; const i=arr.findIndex(x=>x.id===item.id); if(i>=0)arr[i]=item; else arr.push(item); localStorage.setItem("platformClinics",JSON.stringify(arr)); return item; }
}
async function deletePlatformClinic(id) {
  try { const d=await getDB(); if(!d)throw 0; await d.collection("platformClinics").doc(id).delete(); }
  catch { localStorage.setItem("platformClinics",JSON.stringify(JSON.parse(localStorage.getItem("platformClinics")||"[]").filter(c=>c.id!==id))); }
}

// ─── CLASSIFICATION ───────────────────────────────────────────────────────────
function classify(p) {
  if(p.concentration===0)return{diagnosis:"Azoospermia",score:0,recs:["Ausencia total de espermatozoides. Confirmar con segunda muestra y evaluación andrológica completa."],aiNotes:"Análisis procesado con referencia OMS 2021 (6ª ed.). Azoospermia confirmada."};
  const issues=[];
  if(p.concentration<16)issues.push("oligo");
  if(p.progressiveMotility<30)issues.push("aste");
  if(p.morphology<4)issues.push("tera");
  let diagnosis="Normal";
  if(issues.length>=3)diagnosis="Oligoastenoteratozoospermia (OAT)";
  else if(issues.length===2){if(issues.includes("oligo")&&issues.includes("aste"))diagnosis="Oligoastenozoospermia";else if(issues.includes("oligo")&&issues.includes("tera"))diagnosis="Oligoteratozoospermia";else diagnosis="Astenoteratozoospermia";}
  else if(issues.length===1){if(issues.includes("oligo"))diagnosis="Oligozoospermia";else if(issues.includes("aste"))diagnosis="Astenozoospermia";else diagnosis="Teratozoospermia";}
  const sv=v=>Math.min(100,v);
  const dfiS=p.dfi<=15?100:p.dfi<=25?60:Math.max(0,100-(p.dfi-25)*4);
  const score=Math.round(sv((p.concentration/16)*100)*.22+sv((p.progressiveMotility/30)*100)*.22+sv((p.totalMotility/42)*100)*.12+sv((p.morphology/4)*100)*.18+sv((p.vitality/54)*100)*.10+sv((p.volume/1.4)*100)*.08+dfiS*.08);
  const recs=[];
  if(p.concentration<16)recs.push("Considerar evaluación hormonal (FSH, LH, testosterona) y ecografía testicular.");
  if(p.progressiveMotility<30)recs.push("Evaluar estrés oxidativo seminal. Antioxidantes (vitamina E, C, CoQ10) pueden mejorar motilidad.");
  if(p.morphology<4)recs.push("Morfología alterada. Considerar ICSI si se planifica FIV. Descartar exposición a tóxicos.");
  if(p.dfi>25)recs.push("DFI elevado (>25%). Riesgo aumentado de fallo de implantación y aborto. Evaluar IMSI/ICSI.");
  if(p.vitality<54)recs.push("Vitalidad reducida. Test HOS para confirmar necrozoospermia.");
  if(p.volume<1.4)recs.push("Hipospermia. Descartar obstrucción de conductos eyaculadores.");
  if(recs.length===0)recs.push("Parámetros dentro de valores de referencia OMS 2021. Capacidad fecundante normal.");
  const prog=(p.concentration*(p.progressiveMotility/100)).toFixed(1);
  const aiNotes=`Análisis procesado con referencia OMS 2021 (6ª ed.). ${diagnosis==="Normal"?"Parámetros dentro de valores normativos.":"Se detectaron alteraciones: "+diagnosis.toLowerCase()+"."} Espermatozoides progresivos estimados: ${prog} mill/mL.`;
  return{diagnosis,score,recs,aiNotes};
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function diagColor(d,s){const m={"Normal":"#22c55e","Azoospermia":"#ef4444","Oligoastenoteratozoospermia (OAT)":"#dc2626"};return m[d]||(s>=70?"#22c55e":s>=45?"#f59e0b":"#ef4444");}
function scoreColor(s){return s>=70?"#22c55e":s>=45?"#f59e0b":"#ef4444";}

function ParamBars({params}){
  const bars=[
    {key:"concentration",isMax:false,ref:16,unit:"mill/mL"},
    {key:"progressiveMotility",isMax:false,ref:30,unit:"%"},
    {key:"totalMotility",isMax:false,ref:42,unit:"%"},
    {key:"morphology",isMax:false,ref:4,unit:"%"},
    {key:"vitality",isMax:false,ref:54,unit:"%"},
    {key:"volume",isMax:false,ref:1.4,unit:"mL"},
    ...(params.dfi>0?[{key:"dfi",isMax:true,ref:25,unit:"%"}]:[]),
  ];
  return bars.map(b=>{
    const v=params[b.key]||0,ok=b.isMax?v<=b.ref:v>=b.ref,col=ok?"#22c55e":"#ef4444";
    const pct=b.isMax?Math.min(100,(v/(b.ref*2))*100):Math.min(100,(v/(b.ref*1.5))*100);
    return(<div key={b.key} style={{marginBottom:9}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
        <span style={{fontSize:11,fontWeight:600,color:"#4a5568"}}>{OMS[b.key].label}</span>
        <span style={{fontSize:11,fontWeight:700,color:col}}>{v} {b.unit}</span>
      </div>
      <div style={{background:"#e8edf2",borderRadius:4,height:7,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:4}}/>
      </div>
      <div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>Ref: {b.isMax?"≤":"≥"}{b.ref} {b.unit}</div>
    </div>);
  });
}

function downloadPDF(a){
  const dc=diagColor(a.diagnosis,a.spermScore),sc=scoreColor(a.spermScore);
  const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SpermAI · ${a.patientFirstName} ${a.patientLastName}</title>
  <style>body{font-family:Arial,sans-serif;padding:30px;color:#1a2332;max-width:700px;margin:0 auto;}h1{color:#0066B3;font-size:20px;margin-bottom:4px;}.sub{color:#94a3b8;font-size:12px;margin-bottom:20px;}.badge{display:inline-block;padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700;background:${dc}18;color:${dc};border:1px solid ${dc}40;}.score{font-size:28px;font-weight:800;color:${sc};}table{width:100%;border-collapse:collapse;margin:16px 0;}td{padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;}td:first-child{color:#64748b;}.ok{color:#22c55e;font-weight:700;}.bad{color:#ef4444;font-weight:700;}.rec{padding:8px 12px;background:#f0f4f8;border-radius:6px;margin-bottom:6px;font-size:12px;}.footer{margin-top:30px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;}@media print{body{padding:20px;}}</style></head><body>
  <h1>SpermAI · Informe de Espermograma</h1><div class="sub">Ferti IA Suite · OMS 2021 (6ª edición)</div>
  <p><strong>Paciente:</strong> ${a.patientFirstName} ${a.patientLastName}</p>
  <p><strong>Fecha:</strong> ${a.procedureDate}${a.doctorName?` &nbsp;·&nbsp; <strong>Médico:</strong> ${a.doctorName}`:""}</p>
  <p style="margin-top:12px"><strong>Diagnóstico:</strong> &nbsp;<span class="badge">${a.diagnosis}</span> &nbsp; <span class="score">${a.spermScore}</span> <span style="font-size:12px;color:#94a3b8">/ 100 SpermScore</span></p>
  <p style="font-size:12px;color:#4a5568;margin-top:8px">${a.aiNotes||""}</p>
  <table>
    <tr><td>Concentración</td><td class="${a.params.concentration>=16?"ok":"bad"}">${a.params.concentration} mill/mL</td></tr>
    <tr><td>Motilidad Progresiva (PR)</td><td class="${a.params.progressiveMotility>=30?"ok":"bad"}">${a.params.progressiveMotility}%</td></tr>
    <tr><td>Motilidad Total</td><td class="${a.params.totalMotility>=42?"ok":"bad"}">${a.params.totalMotility}%</td></tr>
    <tr><td>Morfología Kruger</td><td class="${a.params.morphology>=4?"ok":"bad"}">${a.params.morphology}%</td></tr>
    <tr><td>Vitalidad</td><td class="${a.params.vitality>=54?"ok":"bad"}">${a.params.vitality}%</td></tr>
    <tr><td>Volumen</td><td class="${a.params.volume>=1.4?"ok":"bad"}">${a.params.volume} mL</td></tr>
    ${a.params.dfi>0?`<tr><td>DFI · Fragmentación ADN</td><td class="${a.params.dfi<=25?"ok":"bad"}">${a.params.dfi}%</td></tr>`:""}
  </table>
  <strong style="font-size:13px">Recomendaciones:</strong>
  ${(a.recommendations||[]).map(r=>`<div class="rec">→ ${r}</div>`).join("")}
  <div class="footer">SpermAI · Ferti IA Suite · El diagnóstico final es responsabilidad del especialista certificado. · ${new Date().toLocaleDateString("es-AR")}</div>
  </body></html>`;
  const w=window.open("","_blank");w.document.write(html);w.document.close();w.focus();setTimeout(()=>w.print(),500);
}

// ─── HOOKS ───────────────────────────────────────────────────────────────────
function useWindowSize(){const[w,setW]=useState(window.innerWidth);useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);return w;}
function useToast(){const[t,setT]=useState([]);const remove=useCallback((id)=>setT(p=>p.filter(x=>x.id!==id)),[]);const add=useCallback((msg,type="info")=>{const id=Date.now();setT(p=>[...p,{id,msg,type}]);setTimeout(()=>remove(id),4000);},[remove]);return{toasts:t,add,remove};}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
// ─── DESIGN SYSTEM ───────────────────────────────────────────────────────────
const s = {
  card: {background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:16,padding:"1.25rem"},
  btn:  {background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:500,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6,color:"var(--color-text-primary)"},
  btnP: {background:"#0066B3",border:"none",borderRadius:8,padding:"10px 16px",fontSize:13,fontWeight:500,cursor:"pointer",color:"white",display:"inline-flex",alignItems:"center",gap:6},
  btnG: {background:"#10b981",border:"none",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:500,cursor:"pointer",color:"white",display:"inline-flex",alignItems:"center",gap:6},
  btnD: {background:"#dc2626",border:"none",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:500,cursor:"pointer",color:"white",display:"inline-flex",alignItems:"center",gap:6},
  btnA: {background:"#f59e0b",border:"none",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:500,cursor:"pointer",color:"white",display:"inline-flex",alignItems:"center",gap:6},
  inp:  {width:"100%",padding:"8px 12px",borderRadius:8,border:"0.5px solid var(--color-border-secondary)",fontSize:13,background:"var(--color-background-secondary)",color:"var(--color-text-primary)",outline:"none",boxSizing:"border-box"},
  lbl:  {fontSize:11,fontWeight:500,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:4},
};

function Toast({toasts,remove}){
  return(<div style={{position:"fixed",top:16,right:16,zIndex:9999,display:"flex",flexDirection:"column",gap:8,maxWidth:340}}>
    {toasts.map(t=>(<div key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:10,boxShadow:"0 4px 12px rgba(0,0,0,.08)",borderLeft:`3px solid ${t.type==="success"?"#10b981":t.type==="error"?"#ef4444":t.type==="warning"?"#f59e0b":"#0080D6"}`}}>
      <span style={{width:7,height:7,borderRadius:"50%",flexShrink:0,background:t.type==="success"?"#10b981":t.type==="error"?"#ef4444":t.type==="warning"?"#f59e0b":"#0080D6"}}/>
      <span style={{fontSize:13,color:"var(--color-text-primary)",flex:1}}>{t.msg}</span>
      <button onClick={()=>remove(t.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-secondary)",fontSize:16,lineHeight:1,padding:0}}>×</button>
    </div>))}
  </div>);
}

function Modal({open,onClose,title,children,width=520}){
  if(!open)return null;
  return(<div onClick={e=>{if(e.target===e.currentTarget)onClose();}} style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(15,23,42,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{...s.card,maxWidth:width,width:"100%",background:"#ffffff",boxShadow:"0 24px 64px rgba(0,0,0,.2)",maxHeight:"90vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem"}}>
        <h3 style={{fontSize:16,fontWeight:500,margin:0,color:"#1e293b"}}>{title}</h3>
        <button onClick={onClose} style={{...s.btn,padding:"4px 8px",fontSize:16}}>×</button>
      </div>
      {children}
    </div>
  </div>);
}

function Btn({children,onClick,variant="primary",size="md",disabled,fullWidth,style:extra}){
  const base={sm:{padding:"6px 12px",fontSize:12},md:{padding:"8px 16px",fontSize:13},lg:{padding:"10px 20px",fontSize:14}};
  const v={primary:s.btnP,secondary:s.btn,danger:s.btnD,success:s.btnG,warning:s.btnA,teal:{...s.btnP,background:"#0097A7"},ghost:{...s.btn,color:"#0066B3"}};
  return(<button disabled={disabled} onClick={onClick} style={{...v[variant]||v.primary,...base[size],opacity:disabled?.5:1,cursor:disabled?"not-allowed":"pointer",width:fullWidth?"100%":"auto",...extra}}>{children}</button>);
}

function Field({label,value,onChange,type="text",placeholder,min,max,step,required,unit,hint,hintColor,inputStyle}){
  return(<div style={{marginBottom:14}}>
    {label&&<label style={s.lbl}>{label}{required&&<span style={{color:"#ef4444"}}> *</span>}</label>}
    <div style={{position:"relative"}}>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} min={min} max={max} step={step}
        style={{...s.inp,paddingRight:unit?36:12,...inputStyle}}
        onFocus={e=>e.target.style.borderColor="#0066B3"} onBlur={e=>e.target.style.borderColor="var(--color-border-secondary)"}/>
      {unit&&<span style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"var(--color-text-secondary)",pointerEvents:"none"}}>{unit}</span>}
    </div>
    {hint&&<div style={{fontSize:11,marginTop:3,color:hintColor||"var(--color-text-secondary)"}}>{hint}</div>}
  </div>);
}

function SField({label,value,onChange,children,required}){
  return(<div style={{marginBottom:14}}>
    {label&&<label style={s.lbl}>{label}{required&&<span style={{color:"#ef4444"}}> *</span>}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)} style={s.inp}>{children}</select>
  </div>);
}

function Card({children,style:extra}){return<div style={{...s.card,marginBottom:14,...extra}}>{children}</div>;}

function Badge({label,color="#0066B3"}){return<span style={{display:"inline-flex",alignItems:"center",padding:"2px 10px",borderRadius:6,fontSize:11,fontWeight:500,background:color+"18",color,border:`0.5px solid ${color}40`}}>{label}</span>;}

function Gauge({score,size=120}){
  const col=scoreColor(score),r=size*.42,cx=size/2,cy=size/2,circ=2*Math.PI*r,off=circ-(score/100)*circ;
  return(<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e8edf2" strokeWidth={size*.083}/>
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={size*.083} strokeDasharray={circ.toFixed(1)} strokeDashoffset={off.toFixed(1)} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>
    <text x={cx} y={cy-size*.05} textAnchor="middle" fontSize={size*.18} fontWeight={800} fill={col} fontFamily="Montserrat">{score}</text>
    <text x={cx} y={cy+size*.1} textAnchor="middle" fontSize={size*.075} fill="#94a3b8" fontFamily="Montserrat">SpermScore</text>
  </svg>);
}

function Stepper({step}){
  const steps=["Paciente","Archivo IA","Parámetros","Resultado"];
  return(<div className="stepper" style={{display:"flex",alignItems:"center",marginBottom:22,overflowX:"auto",paddingBottom:4}}>
    {steps.map((s,i)=>(<div key={i} style={{display:"flex",alignItems:"center",flex:i<steps.length-1?1:"none"}}>
      <div className="step-circle" style={{width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0,background:step>i+1?"#22c55e":step===i+1?"#0066B3":"#e8edf2",color:step>=i+1?"#fff":"#94a3b8"}}>{step>i+1?"✓":i+1}</div>
      <span className="step-label" style={{fontSize:10,fontWeight:600,marginLeft:6,whiteSpace:"nowrap",color:step===i+1?"#0066B3":step>i+1?"#22c55e":"#94a3b8"}}>{s}</span>
      {i<steps.length-1&&<div className="step-line" style={{flex:1,height:2,margin:"0 8px",minWidth:16,background:step>i+1?"#22c55e":"#e2e8f0"}}/>}
    </div>))}
  </div>);
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({onLogin}){
  const[username,setUsername]=useState(""),[ password,setPassword]=useState(""),[ loading,setLoading]=useState(false),[ error,setError]=useState("");
  async function go(){
    if(!username||!password){setError("Completá todos los campos.");return;}
    setLoading(true);setError("");
    try{
      if(username===MASTER_ADMIN.username&&password===MASTER_ADMIN.password){onLogin(MASTER_ADMIN);return;}
      if(username===CLINIC_ADMIN_CEGYR.username&&password===CLINIC_ADMIN_CEGYR.password){onLogin(CLINIC_ADMIN_CEGYR);return;}
      const clinics=await getPlatformClinics();
      for(const c of clinics){if(c.clinicAdminUsername===username&&c.clinicAdminPassword===password){onLogin({id:`__clinicadmin_${c.id}__`,username:c.clinicAdminUsername,role:"clinicAdmin",displayName:c.clinicAdminDisplayName||c.name,clinicId:c.id,permissions:{analysis:true,portal:true,stats:true,training:true,admin:true}});return;}}
      for(const cid of[CLINIC_ID,...clinics.map(c=>c.id)]){const users=await getUsers(cid);const u=users.find(x=>x.username===prefixUsername(cid,username)&&x.password===password);if(u){onLogin({...u,clinicId:cid});return;}}
      setError("Credenciales incorrectas.");
    }catch{setError("Error de conexión.");}finally{setLoading(false);}
  }
  return(<div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0066B3,#0097A7)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:"#fff",borderRadius:20,padding:40,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,.2)"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{width:64,height:64,borderRadius:16,background:"linear-gradient(135deg,#0066B3,#0097A7)",display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:12,fontSize:28}}>🔬</div>
        <div style={{fontSize:22,fontWeight:800}}>SpermAI</div>
        <div style={{fontSize:12,color:"#94a3b8",fontWeight:500,marginTop:2}}>Ferti IA Suite · Módulo de Semen</div>
      </div>
      {error&&<div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#dc2626",marginBottom:16,fontWeight:600}}>{error}</div>}
      <Field label="Usuario" value={username} onChange={setUsername} placeholder="Tu usuario" required/>
      <Field label="Contraseña" value={password} onChange={setPassword} type="password" placeholder="Tu contraseña" required/>
      <Btn onClick={go} disabled={loading} fullWidth style={{marginTop:8}}>{loading?"Verificando...":"Ingresar"}</Btn>
      <p style={{textAlign:"center",fontSize:11,color:"#94a3b8",marginTop:20}}>SpermAI · OMS 2021 (6ª edición)</p>
    </div>
  </div>);
}

// ─── ANALYSIS TAB ─────────────────────────────────────────────────────────────
function AnalysisTab({user,toast}){
  const cid=user.clinicId||CLINIC_ID;
  const[step,setStep]=useState(1);
  const[patient,setPatient]=useState({firstName:"",lastName:"",dob:"",doctorName:"",procedureDate:new Date().toISOString().split("T")[0]});
  const[paramValues,setParamValues]=useState({concentration:"",progressiveMotility:"",totalMotility:"",morphology:"",vitality:"",volume:"",dfi:""});
  const[aiData,setAiData]=useState({});
  const[fromAI,setFromAI]=useState(false);
  const[sourceFile,setSourceFile]=useState(null);
  const[result,setResult]=useState(null);
  const[saving,setSaving]=useState(false);
  const[saved,setSaved]=useState(false);

  function handleAIComplete(extracted,fileName){
    const vals={};Object.entries(extracted).forEach(([k,v])=>{vals[k]=v.value||"";});
    setParamValues(p=>({...p,...vals}));setAiData(extracted);setFromAI(true);setSourceFile(fileName);setStep(3);
  }

  function handleAnalyze(){
    const p={};
    for(const param of PARAMS_LIST){if(!paramValues[param.key]&&param.required){toast.add("Completá todos los campos obligatorios (*)","error");return;}p[param.key]=parseFloat(paramValues[param.key])||0;}
    setResult({...classify(p),params:p});setStep(4);
  }

  async function handleSave(){
    if(!result)return;setSaving(true);
    try{
      await saveAnalysis(cid,{patientFirstName:patient.firstName,patientLastName:patient.lastName,patientDob:patient.dob,doctorName:patient.doctorName,procedureDate:patient.procedureDate,createdBy:user.id,createdByName:user.displayName,params:result.params,diagnosis:result.diagnosis,spermScore:result.score,aiNotes:result.aiNotes,recommendations:result.recs,sourceFile:sourceFile||null,linkedOocyteAnalysisId:null});
      setSaved(true);toast.add("Análisis guardado correctamente.","success");
      setTimeout(()=>reset(),1200);
    }catch{toast.add("Error al guardar.","error");}finally{setSaving(false);}
  }

  function reset(){
    setStep(1);setPatient({firstName:"",lastName:"",dob:"",doctorName:"",procedureDate:new Date().toISOString().split("T")[0]});
    setParamValues({concentration:"",progressiveMotility:"",totalMotility:"",morphology:"",vitality:"",volume:"",dfi:""});
    setAiData({});setFromAI(false);setSourceFile(null);setResult(null);setSaved(false);
  }

  return(<div style={{maxWidth:800,margin:"0 auto"}}>
    <Stepper step={step}/>
    {step===1&&<StepPatient data={patient} onChange={(k,v)=>setPatient(p=>({...p,[k]:v}))} onNext={()=>{if(!patient.firstName||!patient.lastName||!patient.procedureDate)return;setStep(2);}}/>}
    {step===2&&<StepFile onAIComplete={handleAIComplete} onSkip={()=>{setFromAI(false);setStep(3);}} onBack={()=>setStep(1)}/>}
    {step===3&&<StepParams values={paramValues} onChange={(k,v)=>setParamValues(p=>({...p,[k]:v}))} aiData={aiData} fromAI={fromAI} onNext={handleAnalyze} onBack={()=>setStep(2)}/>}
    {step===4&&result&&<StepResult result={result} patient={patient} sourceFile={sourceFile} onSave={handleSave} onNew={reset} saving={saving} saved={saved}/>}
  </div>);
}

function StepPatient({data,onChange,onNext}){
  return(<Card>
    <div style={{fontSize:13,fontWeight:700,color:"#0066B3",marginBottom:14}}>Datos del Paciente</div>
    <div className="grid2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
      <Field label="Nombre" value={data.firstName} onChange={v=>onChange("firstName",v)} required/>
      <Field label="Apellido" value={data.lastName} onChange={v=>onChange("lastName",v)} required/>
      <Field label="Fecha de Nacimiento" type="date" value={data.dob} onChange={v=>onChange("dob",v)}/>
      <Field label="Médico Solicitante" value={data.doctorName} onChange={v=>onChange("doctorName",v)} placeholder="Dr/a..."/>
      <Field label="Fecha de Procedimiento" type="date" value={data.procedureDate} onChange={v=>onChange("procedureDate",v)} required/>
    </div>
    <div className="btn-row" style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}><Btn onClick={onNext}>Continuar →</Btn></div>
  </Card>);
}

function StepFile({onAIComplete,onSkip,onBack}){
  const[file,setFile]=useState(null);const[ft,setFt]=useState(null);const[loading,setLoading]=useState(false);const[stepTxt,setStepTxt]=useState("");
  function processFile(f){const ext=f.name.split(".").pop().toLowerCase();setFile(f);setFt(["pdf"].includes(ext)?"pdf":["jpg","jpeg","png"].includes(ext)?"image":"video");}
  function run(){
    setLoading(true);
    const steps=ft==="video"?["Extrayendo frames del video","Analizando motilidad espermática","Calculando parámetros cinemáticos","Generando resultados"]:["Leyendo documento","Identificando parámetros OMS","Extrayendo valores numéricos","Verificando unidades y rangos"];
    let i=0;const iv=setInterval(()=>{setStepTxt(steps[Math.min(i,steps.length-1)]);i++;if(i>steps.length){clearInterval(iv);
      const r=ft==="video"
        ?{concentration:{value:"18.4",conf:"ok"},progressiveMotility:{value:"20.1",conf:"warn"},totalMotility:{value:"35.2",conf:"ok"},morphology:{value:"",conf:"missing"},vitality:{value:"",conf:"missing"},volume:{value:"2.1",conf:"ok"},dfi:{value:"",conf:"missing"}}
        :{concentration:{value:"24.0",conf:"ok"},progressiveMotility:{value:"20.0",conf:"warn"},totalMotility:{value:"38.0",conf:"ok"},morphology:{value:"6.0",conf:"ok"},vitality:{value:"62.0",conf:"ok"},volume:{value:"2.3",conf:"ok"},dfi:{value:"22.0",conf:"warn"}};
      setLoading(false);onAIComplete(r,file.name);
    }},700);
  }
  const icons={pdf:"📄",image:"🖼️",video:"🎬"};
  return(<Card>
    <div style={{fontSize:13,fontWeight:700,color:"#0066B3",marginBottom:4}}>Subir informe para extracción con IA</div>
    <div style={{fontSize:11,color:"#64748b",marginBottom:16,lineHeight:1.6}}>La IA analizará el archivo y completará los parámetros automáticamente. Podés revisar y corregir antes de continuar.</div>
    {!file&&<div className="dropzone" style={{border:"2px dashed #b0c4d8",borderRadius:14,padding:"36px 20px",textAlign:"center",cursor:"pointer",background:"#f8faff"}}
      onClick={()=>document.getElementById("spermai-fi").click()}
      onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor="#0066B3";}}
      onDragLeave={e=>e.currentTarget.style.borderColor="#b0c4d8"}
      onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor="#b0c4d8";const f=e.dataTransfer.files[0];if(f)processFile(f);}}>
      <div style={{fontSize:36,marginBottom:10}}>📂</div>
      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Arrastrá el archivo o hacé clic</div>
      <div style={{fontSize:11,color:"#94a3b8"}}>La IA extrae los valores automáticamente</div>
      <div style={{display:"flex",gap:8,justifyContent:"center",marginTop:12,flexWrap:"wrap"}}>
        {[["📄 PDF","#0066B3"],["🖼 Imagen","#0097A7"],["🎬 Video BETA","#f59e0b"]].map(([l,c])=>(
          <span key={l} style={{padding:"4px 12px",borderRadius:20,fontSize:10,fontWeight:700,border:`1.5px solid ${c}`,color:c,background:c+"12"}}>{l}</span>
        ))}
      </div>
    </div>}
    <input id="spermai-fi" type="file" accept=".pdf,.jpg,.jpeg,.png,.mp4,.mov" style={{display:"none"}} onChange={e=>{if(e.target.files[0])processFile(e.target.files[0]);}}/>
    {file&&!loading&&(<div>
      <div style={{background:"#f0f4f8",borderRadius:10,padding:"12px 14px",display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
        <span style={{fontSize:22,flexShrink:0}}>{icons[ft]||"📄"}</span>
        <div style={{flex:1}}><div style={{fontSize:12,fontWeight:700}}>{file.name}</div><div style={{fontSize:10,color:"#94a3b8",marginTop:2}}>{ft?.toUpperCase()} · {(file.size/1024/1024).toFixed(1)} MB</div></div>
        <button onClick={()=>setFile(null)} style={{background:"none",border:"none",fontSize:18,color:"#94a3b8",cursor:"pointer"}}>×</button>
      </div>
      {ft==="video"&&<div style={{background:"#fef3c7",border:"1.5px solid #f59e0b",borderRadius:10,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
        <span style={{background:"#f59e0b",color:"#fff",fontSize:9,fontWeight:800,padding:"2px 8px",borderRadius:10,flexShrink:0}}>BETA</span>
        <span style={{fontSize:11,color:"#92400e",fontWeight:600}}>El análisis de video extrae parámetros a partir de frames. Revisá los valores antes de continuar.</span>
      </div>}
      <div className="btn-row" style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
        <Btn variant="secondary" onClick={onBack}>← Atrás</Btn><Btn onClick={run}>✨ Analizar con IA</Btn>
      </div>
    </div>)}
    {loading&&<div style={{background:"#eef4fc",border:"1.5px solid #b5d4f4",borderRadius:12,padding:20,textAlign:"center",marginTop:14}}>
      <div style={{width:36,height:36,border:"3px solid #e2e8f0",borderTopColor:"#0066B3",borderRadius:"50%",margin:"0 auto 10px"}} className="ai-spin"/>
      <div style={{fontSize:12,fontWeight:700,color:"#0066B3"}}>Analizando con IA...</div>
      <div style={{fontSize:11,color:"#0066B3",fontWeight:600,marginTop:4}}>{stepTxt}</div>
    </div>}
    <div style={{textAlign:"center",marginTop:16}}>
      <button onClick={onSkip} style={{background:"none",border:"none",fontSize:11,color:"#94a3b8",cursor:"pointer",fontFamily:"Montserrat,sans-serif",fontWeight:600,textDecoration:"underline"}}>Omitir · Cargar parámetros manualmente</button>
    </div>
  </Card>);
}

function StepParams({values,onChange,aiData,fromAI,onNext,onBack}){
  const miss=fromAI?PARAMS_LIST.filter(p=>aiData[p.key]?.conf==="missing").length:0;
  const warn=fromAI?PARAMS_LIST.filter(p=>aiData[p.key]?.conf==="warn").length:0;
  return(<Card>
    <div style={{fontSize:13,fontWeight:700,color:"#0066B3",marginBottom:4}}>Parámetros OMS 2021 · 6ª Edición</div>
    {fromAI&&<div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:14,padding:"10px 14px",background:"#f8faff",borderRadius:10,border:"1px solid #e2e8f0"}}>
      {[["#22c55e","Extraído por IA"],["#f59e0b","Baja confianza · revisar"],["#e2e8f0","No detectado · completar"]].map(([c,l])=>(
        <div key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,fontWeight:600,color:"#4a5568"}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:c,border:c==="#e2e8f0"?"1.5px solid #d1dbe6":"none",flexShrink:0}}/>
          {l}
        </div>
      ))}
    </div>}
    {fromAI&&(miss>0||warn>0)&&<div style={{background:"#fffbeb",border:"1.5px solid #f59e0b",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:11,color:"#92400e",fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:16,flexShrink:0}}>⚠️</span>
      <span>La IA encontró: {[miss>0&&`${miss} no detectado${miss>1?"s":""}`,warn>0&&`${warn} con baja confianza`].filter(Boolean).join(" y ")}. Revisá los campos marcados.</span>
    </div>}
    <div className="grid2" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
      {PARAMS_LIST.map(p=>{
        const conf=fromAI?(aiData[p.key]?.conf||"missing"):"manual";
        const icon=conf==="ok"?"✅":conf==="warn"?"⚠️":fromAI?"✏️":"";
        const hint=conf==="ok"?"✓ Extraído por IA":conf==="warn"?"⚠ Revisar — baja confianza":fromAI?"No detectado · completar":"";
        const hintColor=conf==="ok"?"#22c55e":conf==="warn"?"#f59e0b":"#94a3b8";
        const border=conf==="ok"?"#22c55e":conf==="warn"?"#f59e0b":"#d1dbe6";
        const bg=conf==="ok"?"#f0fdf4":conf==="warn"?"#fffbeb":"#fff";
        return(<div key={p.key} style={{marginBottom:13}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"#4a5568",marginBottom:4}}>{OMS[p.key].label}{p.required&&<span style={{color:"#ef4444"}}> *</span>}</label>
          <div style={{position:"relative"}}>
            <input type="number" value={values[p.key]} min={0} step={0.1} placeholder="0.0" onChange={e=>onChange(p.key,e.target.value)}
              style={{width:"100%",padding:`9px ${icon?"42px":"11px"} 9px 11px`,border:`1.5px solid ${border}`,borderRadius:8,fontSize:12,background:bg,color:"#1a2332",outline:"none"}}/>
            {icon&&<span style={{position:"absolute",right:11,top:"50%",transform:"translateY(-50%)",fontSize:13,pointerEvents:"none"}}>{icon}</span>}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            {hint&&<div style={{fontSize:10,marginTop:3,fontWeight:600,color:hintColor}}>{hint}</div>}
            <span style={{fontSize:10,color:"#94a3b8",marginLeft:"auto"}}>{OMS[p.key].unit}</span>
          </div>
        </div>);
      })}
    </div>
    <div style={{background:"#f0f4f8",borderRadius:10,padding:"12px 14px",marginTop:6}}>
      <div style={{fontSize:10,fontWeight:700,color:"#0066B3",marginBottom:8}}>📋 Valores de referencia OMS 2021</div>
      <div className="oms-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px 16px"}}>
        {Object.entries(OMS).map(([k,r])=>(<div key={k} style={{fontSize:10,color:"#4a5568"}}><span style={{color:"#94a3b8"}}>{r.label}: </span><strong>{r.min?`≥${r.min}`:`≤${r.max}`} {r.unit}</strong></div>))}
      </div>
    </div>
    <div className="btn-row" style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12}}>
      <Btn variant="secondary" onClick={onBack}>← Atrás</Btn><Btn onClick={onNext}>Ver resultado →</Btn>
    </div>
  </Card>);
}

function StepResult({result,patient,sourceFile,onSave,onNew,saving,saved}){
  const{diagnosis,score,recs,aiNotes,params}=result,dc=diagColor(diagnosis,score);
  return(<div>
    {sourceFile&&<div style={{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:11,color:"#166534",fontWeight:600,display:"flex",alignItems:"center",gap:8}}>✓ Parámetros extraídos de "{sourceFile}" por IA · Revisados y confirmados</div>}
    <Card>
      <div className="result-row" style={{display:"flex",gap:18,alignItems:"flex-start",flexWrap:"wrap"}}>
        <Gauge score={score}/>
        <div style={{flex:1,minWidth:180}}>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:6}}>{patient.firstName} {patient.lastName} · {patient.procedureDate}</div>
          <div style={{marginBottom:10}}><Badge label={diagnosis} color={dc}/></div>
          <div style={{fontSize:11,color:"#4a5568",lineHeight:1.6}}>{aiNotes}</div>
        </div>
      </div>
    </Card>
    <Card><div style={{fontSize:13,fontWeight:700,color:"#0066B3",marginBottom:14}}>Parámetros evaluados</div><ParamBars params={params}/></Card>
    <Card>
      <div style={{fontSize:13,fontWeight:700,color:"#0066B3",marginBottom:12}}>Recomendaciones IA</div>
      {recs.map((r,i)=>(<div key={i} style={{display:"flex",gap:8,padding:"9px 11px",background:"#f0f4f8",borderRadius:8,marginBottom:6,fontSize:11,lineHeight:1.55}}><span style={{color:"#0066B3",flexShrink:0}}>→</span>{r}</div>))}
    </Card>
    <div className="btn-row" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {!saved&&<Btn onClick={onSave} disabled={saving}>{saving?"Guardando...":"💾 Guardar análisis"}</Btn>}
      {saved&&<span style={{color:"#22c55e",fontWeight:700,fontSize:13,padding:"9px 0"}}>✓ Guardado</span>}
      <Btn variant="ghost" onClick={onNew}>Nuevo análisis</Btn>
    </div>
  </div>);
}

// ─── PORTAL TAB ───────────────────────────────────────────────────────────────
function PortalTab({user,toast}){
  const cid=user.clinicId||CLINIC_ID;
  const[subTab,setSubTab]=useState("analyses");
  const[analyses,setAnalyses]=useState([]);
  const[deleted,setDeleted]=useState([]);
  const[loading,setLoading]=useState(true);
  const[search,setSearch]=useState("");
  const[selId,setSelId]=useState(null);
  const[confirmDel,setConfirmDel]=useState(null);
  const[confirmPerm,setConfirmPerm]=useState(null);

  useEffect(()=>{(async()=>{setLoading(true);const[a,d]=await Promise.all([getAnalyses(cid),getDeletedAnalyses(cid)]);setAnalyses(a);setDeleted(d);setLoading(false);})();},[cid]);

  const sel=analyses.find(a=>a.id===selId);
  const q=search.toLowerCase();
  const filtA=analyses.filter(a=>`${a.patientFirstName} ${a.patientLastName} ${a.diagnosis}`.toLowerCase().includes(q));
  const canDel=["masterAdmin","clinicAdmin"].includes(user.role)||user.permissions?.portal;

  async function doDel(item){await softDeleteAnalysis(cid,item.id,item);setAnalyses(p=>p.filter(a=>a.id!==item.id));setDeleted(p=>[{...item,deletedAt:new Date().toISOString()},...p]);if(selId===item.id)setSelId(null);setConfirmDel(null);toast.add("Análisis movido a papelera · 30 días para restaurar","warning");}
  async function doRestore(item){await restoreAnalysis(cid,item);setDeleted(p=>p.filter(d=>d.id!==item.id));const{deletedAt,...rest}=item;setAnalyses(p=>[rest,...p]);toast.add("✓ Análisis restaurado","success");}
  async function doPerm(item){await permDeleteAnalysis(cid,item.id);setDeleted(p=>p.filter(d=>d.id!==item.id));setConfirmPerm(null);toast.add("Análisis eliminado permanentemente","error");}

  return(<div style={{maxWidth:960,margin:"0 auto"}}>
    <Modal open={!!confirmDel} onClose={()=>setConfirmDel(null)} title="¿Eliminar análisis?" width={440}>
      <div style={{background:"#fef2f2",borderRadius:10,padding:14,marginBottom:16,fontSize:12,color:"#7f1d1d",lineHeight:1.6}}><strong>⚠ El análisis pasará a la papelera.</strong><br/>Tendrás 30 días para restaurarlo.</div>
      <p style={{fontSize:13,color:"#4a5568",marginBottom:20}}>¿Eliminar el análisis de <strong>{confirmDel?.patientFirstName} {confirmDel?.patientLastName}</strong>?</p>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn variant="secondary" onClick={()=>setConfirmDel(null)}>Cancelar</Btn><Btn variant="danger" onClick={()=>doDel(confirmDel)}>Mover a papelera</Btn></div>
    </Modal>
    <Modal open={!!confirmPerm} onClose={()=>setConfirmPerm(null)} title="Eliminar permanentemente" width={440}>
      <div style={{background:"#fef2f2",borderRadius:10,padding:14,marginBottom:16,fontSize:12,color:"#7f1d1d",lineHeight:1.6}}><strong>🚨 Esta acción es irreversible.</strong><br/>El análisis se borrará para siempre.</div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn variant="secondary" onClick={()=>setConfirmPerm(null)}>Cancelar</Btn><Btn variant="danger" onClick={()=>doPerm(confirmPerm)}>Eliminar permanentemente</Btn></div>
    </Modal>

    {/* Sub-nav */}
    <div className="portal-search-row" style={{display:"flex",alignItems:"center",borderBottom:"2px solid #e2e8f0",marginBottom:20,gap:0,flexWrap:"wrap"}}>
      {[["analyses","Análisis"],["patients","Pacientes"],["deleted","🗑 Eliminados"]].map(([id,lbl])=>(
        <button key={id} onClick={()=>setSubTab(id)} style={{padding:"10px 18px",background:"none",border:"none",borderBottom:`3px solid ${subTab===id?(id==="deleted"?"#ef4444":"#0066B3"):"transparent"}`,fontFamily:"Montserrat,sans-serif",fontSize:12,fontWeight:600,cursor:"pointer",color:subTab===id?(id==="deleted"?"#ef4444":"#0066B3"):"#64748b",marginBottom:-2,whiteSpace:"nowrap"}}>{lbl}</button>
      ))}
      <div style={{flex:1,display:"flex",justifyContent:"flex-end",alignItems:"center",padding:"6px 0"}}>
        <input className="sub-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..."
          style={{padding:"7px 12px",border:"1.5px solid #d1dbe6",borderRadius:8,fontFamily:"Montserrat,sans-serif",fontSize:12,color:"#1a2332",background:"#fff",outline:"none",width:180}}/>
      </div>
    </div>

    {loading&&<div style={{textAlign:"center",padding:48,color:"#94a3b8"}}>Cargando...</div>}

    {/* ANÁLISIS */}
    {!loading&&subTab==="analyses"&&<div>
      {!filtA.length?<Card style={{textAlign:"center",padding:48,color:"#94a3b8"}}><div style={{fontSize:32,marginBottom:8}}>🔬</div><div style={{fontWeight:600}}>No hay análisis registrados</div></Card>
      :filtA.map(a=>{const dc=diagColor(a.diagnosis,a.spermScore),sc=scoreColor(a.spermScore);return(
        <div key={a.id} onClick={()=>setSelId(selId===a.id?null:a.id)}
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",background:selId===a.id?"#f0f7ff":"#fff",borderRadius:12,marginBottom:8,boxShadow:"0 1px 6px rgba(0,102,179,.06)",cursor:"pointer",border:`2px solid ${selId===a.id?"#0066B3":"transparent"}`,transition:"all .15s",gap:8,flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:13,fontWeight:700}}>{a.patientFirstName} {a.patientLastName}{a.sourceFile&&<span style={{background:"#f0fdf4",color:"#22c55e",border:"1px solid #bbf7d0",padding:"1px 7px",borderRadius:10,fontSize:9,fontWeight:700,marginLeft:6}}>📄 IA</span>}</div>
            <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{a.procedureDate}{a.doctorName?" · "+a.doctorName:""}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <Badge label={a.diagnosis} color={dc}/><Badge label={`Score: ${a.spermScore}`} color={sc}/>
            {canDel&&<button onClick={e=>{e.stopPropagation();setConfirmDel(a);}} style={{background:"none",border:"none",color:"#ef4444",fontSize:15,cursor:"pointer",padding:"2px 6px",borderRadius:6}}>🗑</button>}
          </div>
        </div>
      );})}
      {sel&&<div style={{background:"#fff",borderRadius:14,padding:20,boxShadow:"0 2px 12px rgba(0,102,179,.07)",border:"2px solid #0066B3",marginTop:4}}>
        <div className="preview-header" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <div><div style={{fontSize:15,fontWeight:800}}>{sel.patientFirstName} {sel.patientLastName}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{sel.procedureDate}{sel.doctorName?" · "+sel.doctorName:""}{sel.sourceFile?" · 📄 "+sel.sourceFile:""}</div></div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <Btn size="sm" onClick={()=>downloadPDF({...sel,recommendations:sel.recommendations||[]})}>⬇ Descargar PDF</Btn>
            <Btn size="sm" variant="secondary" onClick={()=>setSelId(null)}>✕ Cerrar</Btn>
          </div>
        </div>
        <div className="result-row" style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap",marginBottom:16}}>
          <Gauge score={sel.spermScore} size={96}/>
          <div><Badge label={sel.diagnosis} color={diagColor(sel.diagnosis,sel.spermScore)}/><div style={{fontSize:11,color:"#4a5568",marginTop:8,lineHeight:1.6,maxWidth:320}}>{sel.aiNotes}</div></div>
        </div>
        <div style={{marginBottom:12}}><ParamBars params={sel.params||{}}/></div>
        {(sel.recommendations||[]).map((r,i)=>(<div key={i} style={{display:"flex",gap:8,padding:"9px 11px",background:"#f0f4f8",borderRadius:8,marginBottom:6,fontSize:11,lineHeight:1.55}}><span style={{color:"#0066B3",flexShrink:0}}>→</span>{r}</div>))}
      </div>}
    </div>}

    {/* PACIENTES */}
    {!loading&&subTab==="patients"&&<div>
      {(()=>{
        const grouped={};analyses.forEach(a=>{const k=`${a.patientFirstName}||${a.patientLastName}`;if(!grouped[k])grouped[k]={fn:a.patientFirstName,ln:a.patientLastName,doctor:a.doctorName,list:[]};grouped[k].list.push(a);});
        const pts=Object.values(grouped).filter(p=>`${p.fn} ${p.ln}`.toLowerCase().includes(q));
        const colors=["#0066B3","#0097A7","#7c3aed","#dc2626","#d97706","#059669"];
        if(!pts.length)return<Card style={{textAlign:"center",padding:48,color:"#94a3b8"}}><div style={{fontSize:32,marginBottom:8}}>👤</div><div style={{fontWeight:600}}>No hay pacientes</div></Card>;
        return pts.map((p,pi)=><PatientCard key={pi} patient={p} color={colors[pi%colors.length]} onSelect={(id)=>{setSubTab("analyses");setSelId(id);}}/>);
      })()}
    </div>}

    {/* ELIMINADOS */}
    {!loading&&subTab==="deleted"&&<div>
      <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:11,color:"#7f1d1d",fontWeight:600}}>
        ⚠ Los análisis eliminados se conservan 30 días y luego se borran automáticamente.
      </div>
      {!deleted.length?<Card style={{textAlign:"center",padding:48,color:"#94a3b8"}}><div style={{fontSize:32,marginBottom:8}}>🗑</div><div style={{fontWeight:600}}>No hay análisis eliminados</div></Card>
      :deleted.map(a=>{
        const ts=a.deletedAt?.seconds?a.deletedAt.seconds*1000:a.deletedAt;
        const days=Math.max(0,30-Math.floor((new Date()-new Date(ts))/86400000));
        return(<div key={a.id} style={{background:"#fff",borderRadius:12,padding:"14px 16px",marginBottom:8,boxShadow:"0 1px 6px rgba(0,0,0,.05)",borderLeft:"4px solid #ef4444"}}>
          <div className="deleted-inner" style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:13,fontWeight:700}}>{a.patientFirstName} {a.patientLastName}</div>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{a.procedureDate} · {a.diagnosis}</div>
              <div style={{marginTop:6}}><span style={{background:"#fef2f2",color:"#ef4444",border:"1px solid #fca5a5",padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700}}>{days>0?`${days} día${days!==1?"s":""} restante${days!==1?"s":""}`:"`Expirado"}</span></div>
            </div>
            <div className="deleted-btns" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Btn size="sm" variant="success" onClick={()=>doRestore(a)}>↩ Restaurar</Btn>
              <Btn size="sm" variant="danger" onClick={()=>setConfirmPerm(a)}>Eliminar permanentemente</Btn>
            </div>
          </div>
        </div>);
      })}
    </div>}
  </div>);
}

function PatientCard({patient,color,onSelect}){
  const[open,setOpen]=useState(false);
  const init=(patient.fn[0]||"")+(patient.ln[0]||"");
  const sorted=[...patient.list].sort((a,b)=>b.procedureDate.localeCompare(a.procedureDate));
  const avg=Math.round(patient.list.reduce((s,a)=>s+a.spermScore,0)/patient.list.length);
  return(<div style={{background:"#fff",borderRadius:14,padding:"18px 20px",marginBottom:12,boxShadow:"0 2px 8px rgba(0,102,179,.06)",border:"1px solid #e2e8f0"}}>
    <div style={{display:"flex",alignItems:"center",gap:12,justifyContent:"space-between",flexWrap:"wrap"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:44,height:44,borderRadius:"50%",background:color+"18",color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,flexShrink:0}}>{init}</div>
        <div><div style={{fontSize:14,fontWeight:800}}>{patient.ln}, {patient.fn}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{patient.doctor||""}</div></div>
      </div>
      <button onClick={()=>setOpen(!open)} style={{background:"#f0f4f8",border:"none",borderRadius:8,padding:"7px 14px",fontSize:11,fontWeight:700,color:"#0066B3",cursor:"pointer"}}>{open?"Cerrar ↑":"Ver historial →"}</button>
    </div>
    <div className="patient-meta" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:10,margin:"12px 0"}}>
      {[["Análisis",patient.list.length,"#0066B3"],["Score prom.",avg,scoreColor(avg)],["Último",sorted[0].procedureDate,"#1a2332"]].map(([l,v,c])=>(
        <div key={l} style={{background:"#f0f4f8",borderRadius:8,padding:"8px 12px",textAlign:"center"}}>
          <div style={{fontSize:18,fontWeight:800,color:c,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</div>
          <div style={{fontSize:10,color:"#94a3b8",fontWeight:600,marginTop:1}}>{l}</div>
        </div>
      ))}
    </div>
    {open&&sorted.map(a=>{const dc=diagColor(a.diagnosis,a.spermScore),sc=scoreColor(a.spermScore);return(
      <div key={a.id} className="history-row" onClick={()=>onSelect(a.id)}
        style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",borderRadius:8,background:"#f8faff",marginBottom:6,flexWrap:"wrap",gap:6,cursor:"pointer"}}>
        <div><div style={{fontSize:12,fontWeight:700}}>{a.procedureDate}</div><div style={{fontSize:10,color:"#94a3b8",marginTop:1}}>{a.doctorName||""}</div></div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <Badge label={a.diagnosis} color={dc}/><Badge label={`Score: ${a.spermScore}`} color={sc}/>
          {a.sourceFile&&<span style={{fontSize:9,background:"#f0fdf4",color:"#22c55e",padding:"1px 6px",borderRadius:8,fontWeight:700}}>📄 IA</span>}
        </div>
      </div>
    );})}
  </div>);
}

// ─── STATS TAB ────────────────────────────────────────────────────────────────
function StatsTab({user,toast}){
  const cid=user.clinicId||CLINIC_ID;
  const[analyses,setAnalyses]=useState([]);const[loading,setLoading]=useState(true);
  useEffect(()=>{(async()=>{setLoading(true);setAnalyses(await getAnalyses(cid));setLoading(false);})();},[cid]);
  if(loading)return<div style={{textAlign:"center",padding:60,color:"#94a3b8"}}>Cargando...</div>;
  if(!analyses.length)return<Card style={{textAlign:"center",padding:48,color:"#94a3b8"}}><div style={{fontSize:36,marginBottom:10}}>📊</div><div style={{fontWeight:600}}>Sin datos suficientes</div></Card>;
  const n=analyses.length,avg=Math.round(analyses.reduce((s,a)=>s+a.spermScore,0)/n),normalPct=Math.round((analyses.filter(a=>a.diagnosis==="Normal").length/n)*100),highDfi=analyses.filter(a=>(a.params?.dfi||0)>25).length;
  const counts={};analyses.forEach(a=>counts[a.diagnosis]=(counts[a.diagnosis]||0)+1);
  return(<div style={{maxWidth:900,margin:"0 auto"}}>
    <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
      {[[n,"🔬","Total análisis","#0066B3"],[avg,"⭐","SpermScore prom.",scoreColor(avg)],[`${normalPct}%`,"✅","Muestras normales","#22c55e"],[highDfi,"⚠️","DFI alto (>25%)","#ef4444"]].map(([v,ic,l,c])=>(
        <Card key={l} style={{textAlign:"center",padding:14}}><div style={{fontSize:22,marginBottom:4}}>{ic}</div><div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div><div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>{l}</div></Card>
      ))}
    </div>
    <Card>
      <div style={{fontSize:13,fontWeight:700,color:"#0066B3",marginBottom:14}}>Distribución de diagnósticos</div>
      {Object.entries(counts).sort(([,a],[,b])=>b-a).map(([d,c])=>{const pct=Math.round((c/n)*100),col=diagColor(d,pct>50?80:40);return(
        <div key={d} style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,fontWeight:600}}>{d}</span><span style={{fontSize:11,color:"#94a3b8"}}>{c} ({pct}%)</span></div>
          <div style={{background:"#e8edf2",borderRadius:4,height:10,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:4}}/></div>
        </div>
      );})}
    </Card>
    <Card>
      <div style={{fontSize:13,fontWeight:700,color:"#0066B3",marginBottom:14}}>Promedios de parámetros</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
        {Object.entries(OMS).map(([k,r])=>{const vals=analyses.map(a=>a.params?.[k]).filter(v=>v!=null&&v!=="");if(!vals.length)return null;const a=(vals.reduce((s,v)=>s+v,0)/vals.length).toFixed(1),ok=r.max?a<=r.max:a>=r.min;return(
          <div key={k} style={{background:ok?"#f0fdf4":"#fef2f2",borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontSize:10,color:"#94a3b8",fontWeight:600,marginBottom:2}}>{r.label}</div>
            <div style={{fontSize:18,fontWeight:800,color:ok?"#22c55e":"#ef4444"}}>{a}</div>
            <div style={{fontSize:10,color:"#94a3b8"}}>{r.unit} · ref {r.min?`≥${r.min}`:`≤${r.max}`}</div>
          </div>
        );})}
      </div>
    </Card>
  </div>);
}

// ─── TRAINING TAB ─────────────────────────────────────────────────────────────
function TrainingTab({user,toast}){
  const cid=user.clinicId||CLINIC_ID;
  const[cases,setCases]=useState([]);const[loading,setLoading]=useState(true);const[show,setShow]=useState(false);
  const[form,setForm]=useState({description:"",expectedDiagnosis:"",notes:""});
  useEffect(()=>{(async()=>{setLoading(true);try{const d=await getDB();if(!d)throw 0;const s=await d.collection(clinicPath(cid,"training")).orderBy("createdAt","desc").get();setCases(s.docs.map(x=>({...x.data(),id:x.id})));}catch{setCases(JSON.parse(localStorage.getItem(`training_${cid}`)||"[]"));}finally{setLoading(false);}})();},[cid]);
  async function save(){
    if(!form.description||!form.expectedDiagnosis){toast.add("Completá descripción y diagnóstico.","error");return;}
    const item={...form,id:"tc"+Date.now(),createdBy:user.id,createdByName:user.displayName,createdAt:new Date().toISOString()};
    try{const d=await getDB();if(!d)throw 0;await d.collection(clinicPath(cid,"training")).doc(item.id).set(item);}
    catch{const arr=JSON.parse(localStorage.getItem(`training_${cid}`)||"[]");arr.unshift(item);localStorage.setItem(`training_${cid}`,JSON.stringify(arr));}
    setCases(p=>[item,...p]);setShow(false);setForm({description:"",expectedDiagnosis:"",notes:""});toast.add("Caso guardado.","success");
  }
  const canAdd=["masterAdmin","clinicAdmin"].includes(user.role)||user.permissions?.training;
  return(<div style={{maxWidth:800,margin:"0 auto"}}>
    <Modal open={show} onClose={()=>setShow(false)} title="Agregar caso de entrenamiento">
      <Field label="Descripción" value={form.description} onChange={v=>setForm(p=>({...p,description:v}))} required/>
      <SField label="Diagnóstico esperado" value={form.expectedDiagnosis} onChange={v=>setForm(p=>({...p,expectedDiagnosis:v}))} required>
        <option value="">Seleccionar...</option>
        {["Normal","Oligozoospermia","Astenozoospermia","Teratozoospermia","Oligoastenoteratozoospermia (OAT)","Azoospermia","Oligoastenozoospermia","Oligoteratozoospermia","Astenoteratozoospermia"].map(d=><option key={d} value={d}>{d}</option>)}
      </SField>
      <div style={{marginBottom:14}}><label style={{display:"block",fontSize:11,fontWeight:700,color:"#4a5568",marginBottom:4}}>Notas clínicas</label><textarea value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} rows={3} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #d1dbe6",borderRadius:8,fontSize:12,resize:"vertical",fontFamily:"Montserrat,sans-serif"}}/></div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn variant="secondary" onClick={()=>setShow(false)}>Cancelar</Btn><Btn onClick={save}>Guardar</Btn></div>
    </Modal>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
      <div><div style={{fontSize:15,fontWeight:700}}>Casos de entrenamiento</div><div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>Calibración del modelo IA</div></div>
      {canAdd&&<Btn onClick={()=>setShow(true)}>+ Agregar caso</Btn>}
    </div>
    {loading?<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>Cargando...</div>
    :!cases.length?<Card style={{textAlign:"center",padding:48,color:"#94a3b8"}}><div style={{fontSize:36,marginBottom:12}}>🧬</div><div style={{fontWeight:600}}>No hay casos</div></Card>
    :cases.map(c=>(<Card key={c.id}>
      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,alignItems:"center"}}>
        <div><div style={{fontSize:13,fontWeight:700}}>{c.description}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{c.createdByName} · {c.createdAt?.split?.("T")[0]||""}</div></div>
        <Badge label={c.expectedDiagnosis} color={diagColor(c.expectedDiagnosis,50)}/>
      </div>
      {c.notes&&<div style={{fontSize:11,color:"#4a5568",background:"#f0f4f8",borderRadius:8,padding:"9px 11px",marginTop:10}}>{c.notes}</div>}
    </Card>))}
  </div>);
}

// ─── ADMIN TAB ────────────────────────────────────────────────────────────────
function AdminTab({user,toast}){
  if(user.role==="masterAdmin")return<MasterPanel user={user} toast={toast}/>;
  if(user.role==="clinicAdmin")return<ClinicPanel user={user} toast={toast}/>;
  return<div style={{color:"#94a3b8",textAlign:"center",padding:48}}>Sin acceso.</div>;
}

function MasterPanel({user,toast}){
  const[clinics,setClinics]=useState([]);const[loading,setLoading]=useState(true);const[show,setShow]=useState(false);const[edit,setEdit]=useState(null);
  const[form,setForm]=useState({name:"",location:"",clinicAdminUsername:"",clinicAdminPassword:"",clinicAdminDisplayName:"",status:"active"});
  useEffect(()=>{(async()=>{setLoading(true);setClinics(await getPlatformClinics());setLoading(false);})();},[]);
  function openNew(){setForm({name:"",location:"",clinicAdminUsername:"",clinicAdminPassword:"",clinicAdminDisplayName:"",status:"active"});setEdit(null);setShow(true);}
  function openEdit(c){setForm({name:c.name,location:c.location||"",clinicAdminUsername:c.clinicAdminUsername||"",clinicAdminPassword:c.clinicAdminPassword||"",clinicAdminDisplayName:c.clinicAdminDisplayName||"",status:c.status||"active"});setEdit(c);setShow(true);}
  async function handleSave(){if(!form.name||!form.clinicAdminUsername||!form.clinicAdminPassword){toast.add("Nombre, usuario y contraseña son obligatorios.","error");return;}const s=await savePlatformClinic({...form,id:edit?.id,createdAt:edit?.createdAt||new Date().toISOString()});if(edit)setClinics(p=>p.map(c=>c.id===s.id?s:c));else setClinics(p=>[...p,s]);setShow(false);toast.add(edit?"Clínica actualizada.":"Clínica creada.","success");}
  async function handleDel(id){await deletePlatformClinic(id);setClinics(p=>p.filter(c=>c.id!==id));toast.add("Clínica eliminada.","success");}
  return(<div style={{maxWidth:900,margin:"0 auto"}}>
    <Modal open={show} onClose={()=>setShow(false)} title={edit?"Editar clínica":"Nueva clínica"}>
      <Field label="Nombre de la clínica" value={form.name} onChange={v=>setForm(p=>({...p,name:v}))} required/>
      <Field label="Ubicación" value={form.location} onChange={v=>setForm(p=>({...p,location:v}))}/>
      <Field label="Nombre display del admin" value={form.clinicAdminDisplayName} onChange={v=>setForm(p=>({...p,clinicAdminDisplayName:v}))}/>
      <Field label="Usuario Clinic Admin" value={form.clinicAdminUsername} onChange={v=>setForm(p=>({...p,clinicAdminUsername:v}))} required/>
      <Field label="Contraseña Clinic Admin" value={form.clinicAdminPassword} onChange={v=>setForm(p=>({...p,clinicAdminPassword:v}))} required/>
      <SField label="Estado" value={form.status} onChange={v=>setForm(p=>({...p,status:v}))}><option value="active">Activa</option><option value="inactive">Inactiva</option></SField>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn variant="secondary" onClick={()=>setShow(false)}>Cancelar</Btn><Btn variant="teal" onClick={handleSave}>{edit?"Actualizar":"Crear clínica"}</Btn></div>
    </Modal>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8}}>
      <div><div style={{fontSize:16,fontWeight:700}}>Panel Master Admin</div><div style={{fontSize:12,color:"#94a3b8"}}>Gestión global de clínicas · SpermAI</div></div>
      <Btn variant="teal" onClick={openNew}>+ Nueva clínica</Btn>
    </div>
    <Card style={{border:"2px solid #0097A7",marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}><div><div style={{fontWeight:700,fontSize:14}}>CEGYR <Badge label="Hardcodeada" color="#0097A7"/></div><div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>Admin: Laboratoriocegyr · clinicId: cegyr</div></div><Badge label="Activa" color="#22c55e"/></div>
    </Card>
    {loading?<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>Cargando...</div>:clinics.map(c=>(<Card key={c.id} style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,alignItems:"center"}}>
        <div><div style={{fontWeight:700,fontSize:14}}>{c.name}</div><div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>{c.location&&c.location+" · "}Admin: {c.clinicAdminUsername}</div></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}><Badge label={c.status==="active"?"Activa":"Inactiva"} color={c.status==="active"?"#22c55e":"#94a3b8"}/><Btn size="sm" variant="secondary" onClick={()=>openEdit(c)}>Editar</Btn><Btn size="sm" variant="danger" onClick={()=>handleDel(c.id)}>Eliminar</Btn></div>
      </div>
    </Card>))}
  </div>);
}

function ClinicPanel({user,toast}){
  const cid=user.clinicId||CLINIC_ID;const TABS_P=["analysis","portal","stats","training"];const TAB_LBL={analysis:"Análisis",portal:"Portal",stats:"Estadísticas",training:"Entrenamiento"};
  const[users,setUsers]=useState([]);const[loading,setLoading]=useState(true);const[show,setShow]=useState(false);const[edit,setEdit]=useState(null);
  const[form,setForm]=useState({displayName:"",username:"",password:"",permissions:{analysis:true,portal:true,stats:false,training:false}});
  useEffect(()=>{(async()=>{setLoading(true);const u=await getUsers(cid);setUsers(u.filter(x=>x.role==="user"||!x.role));setLoading(false);})();},[cid]);
  function openNew(){setForm({displayName:"",username:"",password:"",permissions:{analysis:true,portal:true,stats:false,training:false}});setEdit(null);setShow(true);}
  function openEdit(u){setForm({displayName:u.displayName||"",username:stripPrefix(cid,u.username),password:u.password||"",permissions:u.permissions||{analysis:true,portal:true,stats:false,training:false}});setEdit(u);setShow(true);}
  async function handleSave(){if(!form.displayName||!form.username||!form.password){toast.add("Nombre, usuario y contraseña son obligatorios.","error");return;}const s=await saveUser(cid,{id:edit?.id,displayName:form.displayName,username:prefixUsername(cid,form.username),password:form.password,role:"user",clinicId:cid,permissions:form.permissions});if(edit)setUsers(p=>p.map(u=>u.id===s.id?s:u));else setUsers(p=>[...p,s]);setShow(false);toast.add(edit?"Usuario actualizado.":"Usuario creado.","success");}
  async function handleDel(id){await deleteUser(cid,id);setUsers(p=>p.filter(u=>u.id!==id));toast.add("Usuario eliminado.","success");}
  return(<div style={{maxWidth:800,margin:"0 auto"}}>
    <Modal open={show} onClose={()=>setShow(false)} title={edit?"Editar usuario":"Nuevo usuario"}>
      <Field label="Nombre completo" value={form.displayName} onChange={v=>setForm(p=>({...p,displayName:v}))} required/>
      <Field label="Usuario" value={form.username} onChange={v=>setForm(p=>({...p,username:v}))} required/>
      <Field label="Contraseña" value={form.password} onChange={v=>setForm(p=>({...p,password:v}))} required/>
      <div style={{marginBottom:14}}><label style={{display:"block",fontSize:11,fontWeight:700,color:"#4a5568",marginBottom:8}}>Permisos de acceso</label>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {TABS_P.map(t=>{const toggle=e=>{const v=e.target.checked;setForm(p=>({...p,permissions:{...p.permissions,[t]:v}}));};return(<label key={t} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,fontWeight:500}}><input type="checkbox" checked={!!form.permissions[t]} onChange={toggle}/>{TAB_LBL[t]}</label>);})}
        </div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><Btn variant="secondary" onClick={()=>setShow(false)}>Cancelar</Btn><Btn onClick={handleSave}>{edit?"Actualizar":"Crear usuario"}</Btn></div>
    </Modal>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
      <div><div style={{fontSize:15,fontWeight:700}}>Gestión de usuarios</div><div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{user.displayName} · Clínica {cid}</div></div>
      <Btn onClick={openNew}>+ Nuevo usuario</Btn>
    </div>
    {loading?<div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>Cargando...</div>
    :!users.length?<Card style={{textAlign:"center",padding:48,color:"#94a3b8"}}><div style={{fontSize:36,marginBottom:12}}>👤</div><div style={{fontWeight:600}}>No hay usuarios</div></Card>
    :users.map(u=>(<Card key={u.id} style={{marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8,alignItems:"center"}}>
        <div><div style={{fontSize:13,fontWeight:700}}>{u.displayName}</div><div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>@{stripPrefix(cid,u.username)}</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>{TABS_P.filter(t=>u.permissions?.[t]).map(t=><Badge key={t} label={TAB_LBL[t]} color="#0066B3"/>)}</div>
        </div>
        <div style={{display:"flex",gap:8}}><Btn size="sm" variant="secondary" onClick={()=>openEdit(u)}>Editar</Btn><Btn size="sm" variant="danger" onClick={()=>handleDel(u.id)}>Eliminar</Btn></div>
      </div>
    </Card>))}
  </div>);
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const[user,setUser]=useState(null);const[activeTab,setActiveTab]=useState("analysis");
  const{toasts,add:addToast,remove}=useToast();const width=useWindowSize();const isMobile=width<880;const toast={add:addToast};
  useEffect(()=>{loadFirebase();},[]);
  function handleLogin(u){setUser(u);if(u.role==="masterAdmin"||u.role==="clinicAdmin")setActiveTab("admin");else{const first=["analysis","portal","stats","training","admin"].find(t=>u.permissions?.[t]);setActiveTab(first||"analysis");}}
  function handleLogout(){setUser(null);setActiveTab("analysis");}
  if(!user)return(<><Toast toasts={toasts} remove={remove}/><LoginScreen onLogin={handleLogin}/></>);
  const ALL_TABS=[{id:"analysis",label:"Análisis",icon:"🔬"},{id:"portal",label:"Portal",icon:"📋"},{id:"stats",label:"Estadísticas",icon:"📊"},{id:"training",label:"Entrenamiento",icon:"🧬"},{id:"admin",label:"Admin",icon:"⚙️"}];
  const vis=ALL_TABS.filter(t=>user.role==="masterAdmin"||user.role==="clinicAdmin"||user.permissions?.[t.id]);
  const roleBg=user.role==="masterAdmin"?"linear-gradient(135deg,#1e293b,#0f172a)":user.role==="clinicAdmin"?"linear-gradient(135deg,#0066B3,#0097A7)":"linear-gradient(135deg,#0066B3,#0080D6)";
  const roleLabel=user.role==="masterAdmin"?"Master Admin":user.role==="clinicAdmin"?"Clinic Admin":"Usuario";
  return(<div style={{minHeight:"100vh",background:"var(--color-background-tertiary)",display:"flex",flexDirection:"column"}}>
    <Toast toasts={toasts} remove={remove}/>
    <header style={{background:"#ffffff",borderBottom:"1px solid var(--color-border-tertiary)",padding:"0 1rem",position:"sticky",top:0,zIndex:9999,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
      <div style={{maxWidth:1280,margin:"0 auto",height:60,display:"flex",alignItems:"center",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
          <div style={{width:34,height:34,borderRadius:10,background:"linear-gradient(135deg,#0066B3,#0097A7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>🔬</div>
          <div><div style={{fontSize:15,fontWeight:600,color:"var(--color-text-primary)"}}>SpermAI</div><div style={{fontSize:10,color:"var(--color-text-secondary)",fontWeight:500}}>Ferti IA Suite</div></div>
        </div>
        {!isMobile&&<nav style={{display:"flex",background:"var(--color-background-secondary)",borderRadius:8,padding:2}}>
          {vis.map(t=>(<button key={t.id} onClick={()=>setActiveTab(t.id)} style={{padding:"5px 12px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:500,whiteSpace:"nowrap",background:activeTab===t.id?"#ffffff":"transparent",color:activeTab===t.id?"#0066B3":"var(--color-text-secondary)",boxShadow:activeTab===t.id?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>{t.icon} {t.label}</button>))}
        </nav>}
        <div style={{display:"flex",alignItems:"center",gap:10,flex:isMobile?1:0,justifyContent:"flex-end"}}>
          {!isMobile&&<div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 10px",borderRadius:8,background:roleBg}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"rgba(255,255,255,0.7)"}}/>
            <span style={{fontSize:11,fontWeight:500,color:"white"}}>{user.displayName}</span>
            <span style={{fontSize:10,color:"rgba(255,255,255,0.7)"}}>· {roleLabel}</span>
          </div>}
          <button onClick={handleLogout} style={{...s.btn,fontSize:12,padding:"6px 12px"}}>Salir</button>
        </div>
      </div>
    </header>
    {isMobile&&<div style={{background:"#fff",borderBottom:"1px solid var(--color-border-tertiary)",padding:"0 1rem"}}>
      <select value={activeTab} onChange={e=>setActiveTab(e.target.value)} style={{...s.inp,border:"none",background:"transparent",padding:"10px 0",fontSize:13,fontWeight:500,color:"#0066B3",width:"100%",maxWidth:220}}>
        {vis.map(t=><option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
      </select>
    </div>}
    <main style={{flex:1,maxWidth:1280,margin:"0 auto",width:"100%",padding:isMobile?"0.75rem":"1.5rem"}}>
      {activeTab==="analysis"&&<AnalysisTab user={user} toast={toast}/>}
      {activeTab==="portal"&&<PortalTab user={user} toast={toast}/>}
      {activeTab==="stats"&&<StatsTab user={user} toast={toast}/>}
      {activeTab==="training"&&<TrainingTab user={user} toast={toast}/>}
      {activeTab==="admin"&&<AdminTab user={user} toast={toast}/>}
    </main>
    <footer style={{borderTop:"0.5px solid var(--color-border-tertiary)",padding:"1rem 1.5rem",textAlign:"center"}}>
      <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>SpermAI · Ferti IA Suite · OMS 2021 6ª Ed · Herramienta de apoyo clínico · El diagnóstico final es responsabilidad del especialista</span>
    </footer>
  </div>);
}
