// ============================================================
// APP v1.1 — Clean start, dark/light mode, no remittance
// All security fixes from v1.0 retained
// ============================================================

import { useState, useEffect } from "react";

const CURRENCIES = ["EUR €","GBP £","USD $","XOF CFA","NGN ₦","GHS ₵","CAD CA$","CHF ₣"];
const SYM = {"EUR €":"€","GBP £":"£","USD $":"$","XOF CFA":"CFA","NGN ₦":"₦","GHS ₵":"₵","CAD CA$":"CA$","CHF ₣":"₣"};

const sanitise = (str) =>
  String(str).replace(/&/g,"").replace(/</g,"").replace(/>/g,"")
    .replace(/"/g,"").replace(/'/g,"").trim().slice(0,100);

const safeNum = (val) => {
  const n = parseFloat(val);
  if (isNaN(n) || !isFinite(n) || n < 0) return 0;
  return Math.min(n, 9_999_999);
};

const INIT = {
  currency:    "EUR €",
  theme:       "dark",
  profile:     { name: "", occupation: "" },
  income:      { active:[], passive:[], sidehustle:[] },
  expenses:    { fixed:[], variable:[] },
  assets:      [],
  liabilities: [],
  freedomGoal: 0,
};

const validateData = (raw) => {
  if (!raw || typeof raw !== "object") return INIT;
  return {
    currency:    CURRENCIES.includes(raw.currency) ? raw.currency : INIT.currency,
    theme:       ["dark","light"].includes(raw.theme) ? raw.theme : "dark",
    profile:     (raw.profile && typeof raw.profile.name === "string") ? raw.profile : INIT.profile,
    income: {
      active:    Array.isArray(raw.income?.active)     ? raw.income.active     : [],
      passive:   Array.isArray(raw.income?.passive)    ? raw.income.passive    : [],
      sidehustle:Array.isArray(raw.income?.sidehustle) ? raw.income.sidehustle : [],
    },
    expenses: {
      fixed:    Array.isArray(raw.expenses?.fixed)    ? raw.expenses.fixed    : [],
      variable: Array.isArray(raw.expenses?.variable) ? raw.expenses.variable : [],
    },
    assets:      Array.isArray(raw.assets)      ? raw.assets      : [],
    liabilities: Array.isArray(raw.liabilities) ? raw.liabilities : [],
    freedomGoal: safeNum(raw.freedomGoal),
  };
};

const load = () => {
  try {
    const s = localStorage.getItem("flowfree_v2");
    return s ? validateData(JSON.parse(s)) : INIT;
  } catch { return INIT; }
};

const save = (d) => {
  try { localStorage.setItem("flowfree_v2", JSON.stringify(d)); } catch {}
};

const ASSET_TYPES = ["liquid","income-generating","business","depreciating","appreciating"];

const TABS = [
  { id:"freedom",  label:"Freedom",  icon:"◎" },
  { id:"income",   label:"Income",   icon:"↑" },
  { id:"expenses", label:"Expenses", icon:"↓" },
  { id:"balance",  label:"Balance",  icon:"⊟" },
  { id:"cashflow", label:"Cashflow", icon:"≋" },
  { id:"settings", label:"Settings", icon:"⚙" },
];

const THEMES = {
  dark: {
    bg:"#080B0F", surface:"#0F1318", border:"rgba(255,255,255,0.07)",
    text:"#E8EDF2", muted:"rgba(232,237,242,0.4)", faint:"rgba(232,237,242,0.15)",
    green:"#4ADE80", red:"#F87171", yellow:"#FBBF24", blue:"#60A5FA",
    accent:"#4ADE80", navBg:"rgba(8,11,15,0.97)", inputBg:"rgba(255,255,255,0.05)",
  },
  light: {
    bg:"#F4F6F9", surface:"#FFFFFF", border:"rgba(0,0,0,0.08)",
    text:"#111827", muted:"rgba(17,24,39,0.45)", faint:"rgba(17,24,39,0.2)",
    green:"#16A34A", red:"#DC2626", yellow:"#D97706", blue:"#2563EB",
    accent:"#16A34A", navBg:"rgba(244,246,249,0.97)", inputBg:"rgba(0,0,0,0.04)",
  }
};

export default function App() {
  const [d, setD]         = useState(load);
  const [tab, setTab]     = useState("freedom");
  const [modal, setModal] = useState(null);
  const [form, setForm]   = useState({});

  useEffect(() => { save(d); }, [d]);

  const C      = THEMES[d.theme] || THEMES.dark;
  const sym    = SYM[d.currency] || "€";
  const isDark = d.theme === "dark";

  const sum = (arr) => arr.reduce((s,x) => s + safeNum(x.amount||x.value), 0);

  const activeIncome  = sum(d.income.active);
  const passiveIncome = sum(d.income.passive);
  const sideIncome    = sum(d.income.sidehustle);
  const totalIncome   = activeIncome + passiveIncome + sideIncome;
  const fixedExp      = sum(d.expenses.fixed);
  const varExp        = sum(d.expenses.variable);
  const totalExp      = fixedExp + varExp;
  const monthlyCashflow  = totalIncome - totalExp;
  const totalAssets      = sum(d.assets);
  const totalLiabilities = sum(d.liabilities);
  const netWorth         = totalAssets - totalLiabilities;
  const freedomIncome    = passiveIncome + sideIncome;
  const goalSafe         = Math.max(1, safeNum(d.freedomGoal));
  const freedomPct       = Math.min(100, Math.round((freedomIncome / goalSafe) * 100));
  const inRatRace        = freedomIncome < totalExp;

  const stage =
    freedomPct < 10 ? { label:"Starting Out",     color:C.red,    desc:"Build the base. Every euro counts." }
  : freedomPct < 30 ? { label:"Gaining Ground",   color:C.yellow, desc:"Side hustle is real. Keep stacking." }
  : freedomPct < 60 ? { label:"Breaking Free",    color:C.yellow, desc:"Passive income is becoming meaningful." }
  : freedomPct < 90 ? { label:"Almost There",     color:C.green,  desc:"Passive income nearly covers your life." }
  :                   { label:"Financial Freedom", color:C.green,  desc:"Your money works harder than you do." };

  const isEmpty = totalIncome===0 && totalExp===0 && d.assets.length===0 && d.liabilities.length===0;

  const update = (fn) => setD(prev => { const n={...prev}; fn(n); return {...n}; });
  const openAdd  = (type,section) => { setModal({type,section}); setForm({currency:d.currency,freq:"monthly"}); };
  const openEdit = (type,section,item) => { setModal({type,section,item}); setForm({...item}); };
  const closeModal = () => { setModal(null); setForm({}); };

  const saveItem = () => {
    if (!form.label?.trim() || (!form.amount && !form.value)) return;
    const clean = {
      ...form,
      label:    sanitise(form.label),
      note:     sanitise(form.note||""),
      amount:   safeNum(form.amount||form.value),
      value:    safeNum(form.value||form.amount),
      type:     ASSET_TYPES.includes(form.type) ? form.type : "liquid",
      currency: CURRENCIES.includes(form.currency) ? form.currency : d.currency,
    };
    const {type,section,item} = modal;
    update(n => {
      const arr = (type==="asset"||type==="liability")
        ? n[type==="asset"?"assets":"liabilities"]
        : n[type][section];
      if (item) { const i=arr.findIndex(x=>x.id===item.id); if(i>=0) arr[i]={...clean,id:item.id}; }
      else arr.push({...clean,id:Date.now()});
    });
    closeModal();
  };

  const deleteItem = () => {
    const {type,section,item} = modal;
    update(n => {
      if      (type==="asset")     n.assets      = n.assets.filter(x=>x.id!==item.id);
      else if (type==="liability") n.liabilities = n.liabilities.filter(x=>x.id!==item.id);
      else    n[type][section] = n[type][section].filter(x=>x.id!==item.id);
    });
    closeModal();
  };

  const card = { background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:18, marginBottom:12 };
  const btn  = { border:"none", cursor:"pointer", fontFamily:"'IBM Plex Mono',monospace", fontWeight:600, transition:"all 0.15s" };
  const inp  = { background:C.inputBg, border:`1px solid ${C.border}`, color:C.text, padding:"10px 13px", borderRadius:9, fontFamily:"'IBM Plex Mono',monospace", fontSize:13, width:"100%", outline:"none" };
  const lbl  = { fontSize:10, color:C.muted, letterSpacing:2, display:"block", marginBottom:5, fontFamily:"'IBM Plex Mono',monospace" };

  const Row = ({label,amount,color,currency:rc,onEdit}) => (
    <div onClick={onEdit} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`,cursor:onEdit?"pointer":"default"}}>
      <span style={{fontSize:13,color:C.text}}>{label}</span>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <span style={{fontSize:13,fontFamily:"'IBM Plex Mono',monospace",color:color||C.text,fontWeight:600}}>{SYM[rc]||sym}{safeNum(amount).toLocaleString()}</span>
        {onEdit&&<span style={{fontSize:10,color:C.faint}}>✎</span>}
      </div>
    </div>
  );

  const SectionCard = ({title,items,type,section,color}) => (
    <div style={{...card}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:12,fontWeight:700,color:color||C.muted,letterSpacing:1,fontFamily:"'IBM Plex Mono',monospace"}}>{title}</span>
        <button onClick={()=>openAdd(type,section)} style={{...btn,background:`${color}18`,color:color||C.accent,fontSize:11,padding:"4px 10px",borderRadius:6}}>+ ADD</button>
      </div>
      {items.map(item=>(
        <Row key={item.id} label={item.label} amount={item.amount||item.value} currency={item.currency} color={color} onEdit={()=>openEdit(type,section,item)} />
      ))}
      {items.length===0&&<div style={{fontSize:12,color:C.faint,padding:"8px 0",fontFamily:"'IBM Plex Mono',monospace"}}>— nothing added yet —</div>}
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:10,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
        <span style={{fontSize:12,fontFamily:"'IBM Plex Mono',monospace",color:C.muted}}>TOTAL </span>
        <span style={{fontSize:13,fontFamily:"'IBM Plex Mono',monospace",color:color||C.text,fontWeight:700,marginLeft:8}}>{sym}{sum(items).toLocaleString()}</span>
      </div>
    </div>
  );

  const EmptyState = () => (
    <div style={{textAlign:"center",padding:"40px 20px"}}>
      <div style={{fontSize:40,marginBottom:12}}>◎</div>
      <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:8}}>Welcome to FlowFree</div>
      <div style={{fontSize:13,color:C.muted,lineHeight:1.8,marginBottom:24,maxWidth:280,margin:"0 auto 24px"}}>
        Add your income, expenses, assets and liabilities. Your Freedom Index updates automatically.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,maxWidth:300,margin:"0 auto"}}>
        {[
          {label:"Add Income",   tab:"income",   color:C.blue},
          {label:"Add Expenses", tab:"expenses", color:C.red},
          {label:"Add Assets",   tab:"balance",  color:C.green},
          {label:"Set Goal",     tab:"settings", color:C.yellow},
        ].map(b=>(
          <button key={b.tab} onClick={()=>setTab(b.tab)} style={{...btn,background:`${b.color}15`,color:b.color,border:`1px solid ${b.color}30`,padding:"10px 8px",borderRadius:10,fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Sans',sans-serif",display:"flex",flexDirection:"column",maxWidth:500,margin:"0 auto"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
        ::-webkit-scrollbar{display:none;}
        select option{background:${C.surface};color:${C.text};}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp 0.25s ease forwards;}
        @keyframes barGrow{from{width:0}to{width:var(--w)}}
        .bar{animation:barGrow 1s cubic-bezier(.4,0,.2,1) forwards;}
        input,select{color:${C.text}!important;background:${C.inputBg}!important;}
        input:focus,select:focus{border-color:${C.accent}!important;outline:none;}
      `}</style>

      {/* HEADER */}
      <div style={{padding:"16px 20px 12px",background:C.bg,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:40,backdropFilter:"blur(20px)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:11,color:C.muted,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:2}}>FLOWFREE</div>
            {d.profile.name
              ? <div style={{fontSize:16,fontWeight:700,marginTop:1}}>{d.profile.name}</div>
              : <div style={{fontSize:13,color:C.faint,marginTop:1,fontFamily:"'IBM Plex Mono',monospace"}}>Set name in Settings ⚙</div>
            }
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
            <select value={d.currency} onChange={e=>update(n=>n.currency=CURRENCIES.includes(e.target.value)?e.target.value:n.currency)} style={{...inp,width:"auto",fontSize:11,padding:"5px 8px",borderRadius:7}}>
              {CURRENCIES.map(c=><option key={c}>{c}</option>)}
            </select>
            <div style={{fontSize:10,fontFamily:"'IBM Plex Mono',monospace",padding:"3px 8px",borderRadius:4,background:inRatRace?`${C.red}18`:`${C.green}18`,color:inRatRace?C.red:C.green,border:`1px solid ${inRatRace?C.red+"30":C.green+"30"}`}}>
              {inRatRace?"● RAT RACE":"● BREAKING FREE"}
            </div>
          </div>
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"16px 16px 90px"}}>

        {/* FREEDOM */}
        {tab==="freedom"&&(
          <div className="fu">
            {isEmpty?<EmptyState/>:(<>
              <div style={{...card,background:isDark?`linear-gradient(135deg,${C.surface},#0d1a12)`:`linear-gradient(135deg,${C.surface},#f0faf4)`,border:`1px solid ${stage.color}22`,marginBottom:16}}>
                <div style={{fontSize:10,color:C.muted,letterSpacing:2,fontFamily:"'IBM Plex Mono',monospace",marginBottom:16}}>FINANCIAL FREEDOM INDEX</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:22,fontWeight:700,color:stage.color,fontFamily:"'IBM Plex Mono',monospace"}}>{freedomPct}%</div>
                    <div style={{fontSize:14,fontWeight:600,color:C.text,marginTop:2}}>{stage.label}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:2,maxWidth:200,lineHeight:1.5}}>{stage.desc}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:10,color:C.muted,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:1}}>PASSIVE + SIDE</div>
                    <div style={{fontSize:20,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",color:stage.color}}>
                      {sym}{freedomIncome.toLocaleString()}<span style={{fontSize:11,color:C.muted}}>/mo</span>
                    </div>
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>Goal: {sym}{d.freedomGoal.toLocaleString()}/mo</div>
                  </div>
                </div>
                <div style={{height:6,background:isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.07)",borderRadius:3,overflow:"hidden"}}>
                  <div className="bar" style={{"--w":`${freedomPct}%`,width:`${freedomPct}%`,height:"100%",borderRadius:3,background:`linear-gradient(90deg,${stage.color}88,${stage.color})`}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
                  <span style={{fontSize:10,color:C.faint,fontFamily:"'IBM Plex Mono',monospace"}}>0 — RAT RACE</span>
                  <span style={{fontSize:10,color:C.faint,fontFamily:"'IBM Plex Mono',monospace"}}>100% — FREE</span>
                </div>
              </div>

              <div style={{fontSize:10,color:C.muted,letterSpacing:2,fontFamily:"'IBM Plex Mono',monospace",marginBottom:10}}>MONTHLY INCOME STATEMENT</div>
              <div style={{...card,padding:0,overflow:"hidden"}}>
                {[
                  {label:"Active Income", value:activeIncome,    color:C.blue,   sub:"job + grants"},
                  {label:"Side Hustle",   value:sideIncome,      color:C.yellow, sub:"freelance etc"},
                  {label:"Passive Income",value:passiveIncome,   color:C.green,  sub:"money working for you"},
                  {label:"Total Income",  value:totalIncome,     color:C.text,   sub:"",bold:true,border:true},
                  {label:"Total Expenses",value:-totalExp,       color:C.red,    sub:"fixed + variable",bold:true},
                  {label:"Net Cashflow",  value:monthlyCashflow, color:monthlyCashflow>=0?C.green:C.red,sub:"",bold:true,big:true},
                ].map((r,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${r.big?"14px":"10px"} 18px`,borderTop:r.border?`1px solid ${C.border}`:"none",background:r.big?(monthlyCashflow>=0?`${C.green}08`:`${C.red}08`):"transparent"}}>
                    <div>
                      <div style={{fontSize:r.big?14:13,fontWeight:r.bold?700:400,color:C.text}}>{r.label}</div>
                      {r.sub&&<div style={{fontSize:10,color:C.faint,fontFamily:"'IBM Plex Mono',monospace"}}>{r.sub}</div>}
                    </div>
                    <div style={{fontSize:r.big?16:13,fontWeight:r.bold?700:500,fontFamily:"'IBM Plex Mono',monospace",color:r.color}}>
                      {r.value>=0?"":"-"}{sym}{Math.abs(r.value).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{fontSize:10,color:C.muted,letterSpacing:2,fontFamily:"'IBM Plex Mono',monospace",marginBottom:10,marginTop:20}}>BALANCE SHEET SNAPSHOT</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                {[
                  {label:"Total Assets",      value:totalAssets,      color:C.green},
                  {label:"Total Liabilities", value:totalLiabilities, color:C.red},
                ].map(s=>(
                  <div key={s.label} style={{...card,marginBottom:0,textAlign:"center",padding:14}}>
                    <div style={{fontSize:10,color:C.muted,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:1,marginBottom:6}}>{s.label.toUpperCase()}</div>
                    <div style={{fontSize:20,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",color:s.color}}>{sym}{s.value.toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div style={{...card,display:"flex",justifyContent:"space-between",alignItems:"center",background:netWorth>=0?`${C.green}08`:`${C.red}08`,border:`1px solid ${netWorth>=0?C.green+"25":C.red+"25"}`}}>
                <div>
                  <div style={{fontSize:10,color:C.muted,letterSpacing:2,fontFamily:"'IBM Plex Mono',monospace"}}>NET WORTH</div>
                  <div style={{fontSize:11,color:C.faint,marginTop:2}}>Assets minus Liabilities</div>
                </div>
                <div style={{fontSize:24,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",color:netWorth>=0?C.green:C.red}}>
                  {netWorth>=0?"":"-"}{sym}{Math.abs(netWorth).toLocaleString()}
                </div>
              </div>
            </>)}
          </div>
        )}

        {/* INCOME */}
        {tab==="income"&&(
          <div className="fu">
            <div style={{fontSize:10,color:C.muted,letterSpacing:2,fontFamily:"'IBM Plex Mono',monospace",marginBottom:14}}>INCOME STATEMENT</div>
            <SectionCard title="ACTIVE INCOME"  items={d.income.active}     type="income" section="active"     color={C.blue}/>
            <SectionCard title="SIDE HUSTLE"    items={d.income.sidehustle} type="income" section="sidehustle" color={C.yellow}/>
            <SectionCard title="PASSIVE INCOME" items={d.income.passive}    type="income" section="passive"    color={C.green}/>
            {(totalIncome>0||totalExp>0)&&(
              <div style={{...card,background:`${C.green}06`,border:`1px solid ${C.green}18`}}>
                <div style={{fontSize:11,color:C.green,fontWeight:700,marginBottom:6,fontFamily:"'IBM Plex Mono',monospace"}}>THE GOAL</div>
                <div style={{fontSize:13,color:C.muted,lineHeight:1.8}}>
                  Passive income must exceed total expenses.<br/>
                  Now: <span style={{color:C.green,fontWeight:700}}>{sym}{freedomIncome}/mo</span> vs <span style={{color:C.red,fontWeight:700}}>{sym}{totalExp}/mo</span><br/>
                  Gap: <span style={{color:C.yellow,fontWeight:700}}>{sym}{Math.max(0,totalExp-freedomIncome).toLocaleString()}/mo</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* EXPENSES */}
        {tab==="expenses"&&(
          <div className="fu">
            <div style={{fontSize:10,color:C.muted,letterSpacing:2,fontFamily:"'IBM Plex Mono',monospace",marginBottom:14}}>EXPENSE STATEMENT</div>
            <SectionCard title="FIXED EXPENSES"    items={d.expenses.fixed}    type="expenses" section="fixed"    color={C.red}/>
            <SectionCard title="VARIABLE EXPENSES" items={d.expenses.variable} type="expenses" section="variable" color="#FB923C"/>
            {totalExp>0&&(
              <div style={{...card,background:`${C.red}06`,border:`1px solid ${C.red}18`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:12,color:C.muted,fontFamily:"'IBM Plex Mono',monospace"}}>TOTAL MONTHLY OUTFLOW</div>
                  <div style={{fontSize:22,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",color:C.red}}>{sym}{totalExp.toLocaleString()}</div>
                </div>
                {totalIncome>0&&(
                  <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                    <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Expense ratio</div>
                    <div style={{height:5,background:isDark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.07)",borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:`${Math.min(100,Math.round((totalExp/Math.max(totalIncome,1))*100))}%`,height:"100%",borderRadius:3,background:totalExp>totalIncome?C.red:C.yellow}}/>
                    </div>
                    <div style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:C.muted,marginTop:4}}>
                      {Math.min(100,Math.round((totalExp/Math.max(totalIncome,1))*100))}% of income — target below 70%
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* BALANCE */}
        {tab==="balance"&&(
          <div className="fu">
            <div style={{fontSize:10,color:C.muted,letterSpacing:2,fontFamily:"'IBM Plex Mono',monospace",marginBottom:14}}>BALANCE SHEET</div>
            <div style={card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={{fontSize:12,fontWeight:700,color:C.green,letterSpacing:1,fontFamily:"'IBM Plex Mono',monospace"}}>ASSETS</span>
                <button onClick={()=>openAdd("asset","assets")} style={{...btn,background:`${C.green}18`,color:C.green,fontSize:11,padding:"4px 10px",borderRadius:6}}>+ ADD</button>
              </div>
              {d.assets.map(a=>(
                <div key={a.id} onClick={()=>openEdit("asset","assets",a)} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"9px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
                  <div>
                    <div style={{fontSize:13,color:C.text}}>{a.label}</div>
                    <div style={{fontSize:10,color:C.faint,fontFamily:"'IBM Plex Mono',monospace",marginTop:2}}>{a.type}{a.note?` · ${a.note}`:""}</div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontSize:13,fontFamily:"'IBM Plex Mono',monospace",color:C.green,fontWeight:600}}>{SYM[a.currency]||sym}{safeNum(a.value).toLocaleString()}</span>
                    <span style={{fontSize:10,color:C.faint}}>✎</span>
                  </div>
                </div>
              ))}
              {d.assets.length===0&&<div style={{fontSize:12,color:C.faint,padding:"8px 0",fontFamily:"'IBM Plex Mono',monospace"}}>— nothing added yet —</div>}
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:10,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
                <span style={{fontSize:13,fontFamily:"'IBM Plex Mono',monospace",color:C.green,fontWeight:700}}>TOTAL {sym}{totalAssets.toLocaleString()}</span>
              </div>
            </div>
            <div style={card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={{fontSize:12,fontWeight:700,color:C.red,letterSpacing:1,fontFamily:"'IBM Plex Mono',monospace"}}>LIABILITIES</span>
                <button onClick={()=>openAdd("liability","liabilities")} style={{...btn,background:`${C.red}18`,color:C.red,fontSize:11,padding:"4px 10px",borderRadius:6}}>+ ADD</button>
              </div>
              {d.liabilities.map(l=>(
                <div key={l.id} onClick={()=>openEdit("liability","liabilities",l)} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"9px 0",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
                  <div>
                    <div style={{fontSize:13,color:C.text}}>{l.label}</div>
                    {l.note&&<div style={{fontSize:10,color:C.faint,fontFamily:"'IBM Plex Mono',monospace",marginTop:2}}>{l.note}</div>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{fontSize:13,fontFamily:"'IBM Plex Mono',monospace",color:C.red,fontWeight:600}}>{SYM[l.currency]||sym}{safeNum(l.amount).toLocaleString()}</span>
                    <span style={{fontSize:10,color:C.faint}}>✎</span>
                  </div>
                </div>
              ))}
              {d.liabilities.length===0&&<div style={{fontSize:12,color:C.faint,padding:"8px 0",fontFamily:"'IBM Plex Mono',monospace"}}>— nothing added yet —</div>}
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:10,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
                <span style={{fontSize:13,fontFamily:"'IBM Plex Mono',monospace",color:C.red,fontWeight:700}}>TOTAL {sym}{totalLiabilities.toLocaleString()}</span>
              </div>
            </div>
            <div style={{...card,background:netWorth>=0?`${C.green}08`:`${C.red}08`,border:`1px solid ${netWorth>=0?C.green+"25":C.red+"25"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:10,color:C.muted,letterSpacing:2,fontFamily:"'IBM Plex Mono',monospace"}}>NET WORTH</div>
                  <div style={{fontSize:11,color:C.faint,marginTop:2}}>Assets minus Liabilities</div>
                </div>
                <div style={{fontSize:26,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",color:netWorth>=0?C.green:C.red}}>
                  {netWorth>=0?"":"-"}{sym}{Math.abs(netWorth).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CASHFLOW */}
        {tab==="cashflow"&&(
          <div className="fu">
            <div style={{fontSize:10,color:C.muted,letterSpacing:2,fontFamily:"'IBM Plex Mono',monospace",marginBottom:14}}>CASHFLOW STATEMENT</div>
            {isEmpty?(
              <div style={{...card,textAlign:"center",padding:32}}>
                <div style={{fontSize:13,color:C.muted}}>Add income and expenses to see your cashflow.</div>
              </div>
            ):(<>
              <div style={{...card,marginBottom:16}}>
                <div style={{fontSize:11,color:C.muted,fontFamily:"'IBM Plex Mono',monospace",marginBottom:14}}>WHERE YOUR MONEY FLOWS</div>
                {[
                  {label:"Active",     value:activeIncome,  color:C.blue},
                  {label:"Side Hustle",value:sideIncome,    color:C.yellow},
                  {label:"Passive",    value:passiveIncome, color:C.green},
                ].map(bar=>(
                  <div key={bar.label} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,color:C.muted}}>{bar.label}</span>
                      <span style={{fontSize:12,fontFamily:"'IBM Plex Mono',monospace",color:bar.color}}>{sym}{bar.value.toLocaleString()}</span>
                    </div>
                    <div style={{height:5,background:isDark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.07)",borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:`${totalIncome>0?Math.round((bar.value/totalIncome)*100):0}%`,height:"100%",background:bar.color,borderRadius:3,transition:"width 0.7s ease"}}/>
                    </div>
                  </div>
                ))}
                <div style={{height:1,background:C.border,margin:"14px 0"}}/>
                {[
                  {label:"Fixed",    value:fixedExp, color:C.red},
                  {label:"Variable", value:varExp,   color:"#FB923C"},
                ].map(bar=>(
                  <div key={bar.label} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,color:C.muted}}>{bar.label}</span>
                      <span style={{fontSize:12,fontFamily:"'IBM Plex Mono',monospace",color:bar.color}}>{sym}{bar.value.toLocaleString()}</span>
                    </div>
                    <div style={{height:5,background:isDark?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.07)",borderRadius:3,overflow:"hidden"}}>
                      <div style={{width:`${totalExp>0?Math.round((bar.value/totalExp)*100):0}%`,height:"100%",background:bar.color,borderRadius:3,transition:"width 0.7s ease"}}/>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{...card,textAlign:"center",background:monthlyCashflow>=0?`${C.green}06`:`${C.red}06`,border:`1px solid ${monthlyCashflow>=0?C.green+"25":C.red+"25"}`}}>
                <div style={{fontSize:10,color:C.muted,letterSpacing:2,fontFamily:"'IBM Plex Mono',monospace",marginBottom:8}}>MONTHLY CASHFLOW</div>
                <div style={{fontSize:42,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",color:monthlyCashflow>=0?C.green:C.red,letterSpacing:"-1px"}}>
                  {monthlyCashflow>=0?"+":""}{sym}{monthlyCashflow.toLocaleString()}
                </div>
                <div style={{fontSize:12,color:C.muted,marginTop:6}}>
                  {monthlyCashflow>=0
                    ?`${sym}${monthlyCashflow.toLocaleString()} available to invest or save`
                    :`Spending ${sym}${Math.abs(monthlyCashflow).toLocaleString()} more than you earn`}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginTop:10}}>
                {[
                  {label:"Annual Income",   value:totalIncome*12,     color:C.green},
                  {label:"Annual Expenses", value:totalExp*12,        color:C.red},
                  {label:"Annual Cashflow", value:monthlyCashflow*12, color:monthlyCashflow>=0?C.green:C.red},
                ].map(s=>(
                  <div key={s.label} style={{...card,marginBottom:0,textAlign:"center",padding:12}}>
                    <div style={{fontSize:9,color:C.muted,fontFamily:"'IBM Plex Mono',monospace",letterSpacing:1,marginBottom:5}}>{s.label}</div>
                    <div style={{fontSize:14,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",color:s.color}}>{sym}{(s.value/1000).toFixed(1)}k</div>
                  </div>
                ))}
              </div>
            </>)}
          </div>
        )}

        {/* SETTINGS */}
        {tab==="settings"&&(
          <div className="fu">
            <div style={{fontSize:10,color:C.muted,letterSpacing:2,fontFamily:"'IBM Plex Mono',monospace",marginBottom:14}}>SETTINGS</div>
            <div style={card}>
              <div style={{fontSize:12,fontWeight:700,color:C.muted,letterSpacing:1,fontFamily:"'IBM Plex Mono',monospace",marginBottom:14}}>PROFILE</div>
              <div style={{marginBottom:12}}>
                <label style={lbl}>YOUR NAME</label>
                <input maxLength={60} placeholder="Your name" value={d.profile.name} onChange={e=>update(n=>n.profile={...n.profile,name:sanitise(e.target.value)})} style={inp}/>
              </div>
              <div>
                <label style={lbl}>OCCUPATION</label>
                <input maxLength={80} placeholder="e.g. Student / Developer" value={d.profile.occupation} onChange={e=>update(n=>n.profile={...n.profile,occupation:sanitise(e.target.value)})} style={inp}/>
              </div>
            </div>
            <div style={card}>
              <div style={{fontSize:12,fontWeight:700,color:C.muted,letterSpacing:1,fontFamily:"'IBM Plex Mono',monospace",marginBottom:14}}>APPEARANCE</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  {id:"dark", label:"Dark", bg:"#080B0F", text:"#E8EDF2"},
                  {id:"light",label:"Light",bg:"#F4F6F9", text:"#111827"},
                ].map(t=>(
                  <button key={t.id} onClick={()=>update(n=>n.theme=t.id)} style={{...btn,padding:"14px 10px",borderRadius:12,background:t.bg,color:t.text,border:`2px solid ${d.theme===t.id?C.accent:"transparent"}`,fontFamily:"'DM Sans',sans-serif",fontSize:14}}>
                    <div style={{fontSize:18,marginBottom:4}}>{t.id==="dark"?"◑":"○"}</div>
                    {t.label}
                    {d.theme===t.id&&<div style={{fontSize:10,color:C.accent,marginTop:2,fontFamily:"'IBM Plex Mono',monospace"}}>ACTIVE</div>}
                  </button>
                ))}
              </div>
              <div style={{fontSize:11,color:C.faint,marginTop:10,fontFamily:"'IBM Plex Mono',monospace",textAlign:"center"}}>
                More colour palettes coming soon (Pro)
              </div>
            </div>
            <div style={card}>
              <div style={{fontSize:12,fontWeight:700,color:C.muted,letterSpacing:1,fontFamily:"'IBM Plex Mono',monospace",marginBottom:14}}>DEFAULT CURRENCY</div>
              <select value={d.currency} onChange={e=>update(n=>n.currency=CURRENCIES.includes(e.target.value)?e.target.value:n.currency)} style={inp}>
                {CURRENCIES.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={card}>
              <div style={{fontSize:12,fontWeight:700,color:C.muted,letterSpacing:1,fontFamily:"'IBM Plex Mono',monospace",marginBottom:6}}>FREEDOM GOAL</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.6}}>Monthly passive + side hustle income to be financially free.</div>
              <input type="number" min="0" max="9999999" value={d.freedomGoal} onChange={e=>update(n=>n.freedomGoal=safeNum(e.target.value))} style={{...inp,fontFamily:"'IBM Plex Mono',monospace",fontSize:16,fontWeight:700,color:C.green}}/>
            </div>
            <div style={{...card,border:`1px solid ${C.red}30`,background:`${C.red}05`}}>
              <div style={{fontSize:12,fontWeight:700,color:C.red,letterSpacing:1,fontFamily:"'IBM Plex Mono',monospace",marginBottom:10}}>DANGER ZONE</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:14,lineHeight:1.6}}>Reset all data. This cannot be undone.</div>
              <button onClick={()=>{if(window.confirm("Reset all data? Cannot be undone.")){localStorage.removeItem("flowfree_v2");setD(INIT);setTab("freedom");}}} style={{...btn,background:`${C.red}12`,color:C.red,border:`1px solid ${C.red}30`,padding:"10px 20px",borderRadius:9,fontSize:13,width:"100%"}}>
                Reset all data
              </button>
            </div>
            <div style={{textAlign:"center",padding:"16px 0",fontSize:11,color:C.faint,fontFamily:"'IBM Plex Mono',monospace"}}>
              FLOWFREE v1.1 · Data stored locally on your device
            </div>
          </div>
        )}

      </div>

      {/* BOTTOM NAV */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:500,background:C.navBg,backdropFilter:"blur(20px)",borderTop:`1px solid ${C.border}`,padding:"8px 4px 10px",display:"flex",zIndex:40}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"4px 0"}}>
            <span style={{fontSize:16,opacity:tab===t.id?1:0.3,transition:"opacity 0.15s"}}>{t.icon}</span>
            <span style={{fontSize:9,fontFamily:"'IBM Plex Mono',monospace",fontWeight:600,color:tab===t.id?C.accent:`${C.text}40`,letterSpacing:0.5}}>{t.label.toUpperCase()}</span>
          </button>
        ))}
      </div>

      {/* MODAL */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",backdropFilter:"blur(8px)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={closeModal}>
          <div style={{background:C.surface,borderRadius:"20px 20px 0 0",padding:"24px 20px 32px",width:"100%",maxWidth:500,border:`1px solid ${C.border}`}} onClick={e=>e.stopPropagation()}>
            <div style={{width:32,height:3,borderRadius:2,background:C.border,margin:"0 auto 20px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <h3 style={{fontSize:15,fontWeight:700,fontFamily:"'IBM Plex Mono',monospace",color:C.text}}>
                {modal.item?"EDIT":"ADD"} {modal.type.toUpperCase()}
              </h3>
              {modal.item&&<button onClick={deleteItem} style={{...btn,background:`${C.red}12`,color:C.red,fontSize:11,padding:"5px 10px",borderRadius:6}}>DELETE</button>}
            </div>
            <div style={{display:"grid",gap:12}}>
              <div>
                <label style={lbl}>LABEL</label>
                <input maxLength={100} placeholder="e.g. Freelance income" value={form.label||""} onChange={e=>setForm(f=>({...f,label:e.target.value}))} style={inp}/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={lbl}>{modal.type==="asset"?"VALUE":"AMOUNT"}</label>
                  <input type="number" min="0" max="9999999" step="0.01" placeholder="0" value={form.amount||form.value||""} onChange={e=>setForm(f=>({...f,amount:parseFloat(e.target.value)||0,value:parseFloat(e.target.value)||0}))} style={inp}/>
                </div>
                <div>
                  <label style={lbl}>CURRENCY</label>
                  <select value={form.currency||d.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))} style={inp}>
                    {CURRENCIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {modal.type==="asset"&&(
                <div>
                  <label style={lbl}>ASSET TYPE</label>
                  <select value={form.type||"liquid"} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={inp}>
                    <option value="liquid">Liquid (cash, savings)</option>
                    <option value="income-generating">Income-generating (stocks, rental)</option>
                    <option value="business">Business equity</option>
                    <option value="depreciating">Depreciating (electronics, car)</option>
                    <option value="appreciating">Appreciating (property, gold)</option>
                  </select>
                </div>
              )}
              <div>
                <label style={lbl}>NOTES (optional)</label>
                <input maxLength={100} placeholder="Any detail" value={form.note||""} onChange={e=>setForm(f=>({...f,note:e.target.value}))} style={inp}/>
              </div>
              <button onClick={saveItem} style={{...btn,background:`${C.green}18`,color:C.green,border:`1px solid ${C.green}30`,padding:14,borderRadius:10,fontSize:14,width:"100%"}}>
                {modal.item?"SAVE CHANGES":"ADD"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}