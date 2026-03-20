// ============================================================
// APINFLOW — v1.4 FINAL
// Fixed:
//   - Auth input focus loss (AuthModal moved outside main component)
//   - Google auth removed (email only for now)
//   - Pro button now works
//   - Clean UX throughout
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

// ─── VERSION & MIGRATION ──────────────────────────────────────────────────────
const DATA_VERSION = 2;

const MIGRATIONS = {
  2: (old) => ({
    ...old,
    darkMode: old.darkMode ?? true,
    referral: old.referral ?? { code: generateCode(), referredBy: null, freeMonthsEarned: 0 },
    expenses: {
      fixed:    old.expenses?.fixed    ?? [],
      variable: old.expenses?.variable ?? [],
    },
  }),
};

function migrateData(raw) {
  if (!raw) return null;
  let data = raw;
  const fromVersion = data._version || 1;
  for (let v = fromVersion + 1; v <= DATA_VERSION; v++) {
    if (MIGRATIONS[v]) data = MIGRATIONS[v](data);
  }
  data._version = DATA_VERSION;
  return data;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CURRENCIES  = ["EUR €","GBP £","USD $","XOF CFA","NGN ₦","GHS ₵"];
const SYM         = {"EUR €":"€","GBP £":"£","USD $":"$","XOF CFA":"CFA","NGN ₦":"₦","GHS ₵":"₵"};
const ASSET_TYPES = ["liquid","income-generating","business","depreciating","appreciating"];
const STORAGE_KEY = "apinflow_v1";

const STRIPE = {
  monthly: "https://buy.stripe.com/YOUR_MONTHLY_LINK",
  yearly:  "https://buy.stripe.com/YOUR_YEARLY_LINK",
};

// ─── SECURITY ─────────────────────────────────────────────────────────────────
const sanitise = (str) =>
  String(str).replace(/&/g,"").replace(/</g,"").replace(/>/g,"")
    .replace(/"/g,"").replace(/'/g,"").trim().slice(0,100);

const safeNum = (val) => {
  const n = parseFloat(val);
  if (isNaN(n)||!isFinite(n)||n<0) return 0;
  return Math.min(n, 9_999_999);
};

function generateCode() {
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(36).padStart(2,"0")).join("").toUpperCase().slice(0,8);
}

function isProActive(isPro, proExpiry) {
  if (!isPro) return false;
  if (!proExpiry) return true;
  try { return new Date(proExpiry).getTime() > Date.now(); } catch { return false; }
}

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.cssText = "position:fixed;top:-9999px;opacity:0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); } catch {}
  document.body.removeChild(ta); return Promise.resolve();
}

// ─── INITIAL DATA ─────────────────────────────────────────────────────────────
const makeInit = () => ({
  _version:    DATA_VERSION,
  currency:    "EUR €",
  darkMode:    true,
  isPro:       false,
  proExpiry:   null,
  profile:     { name:"", occupation:"" },
  income:      { active:[], passive:[], sidehustle:[] },
  expenses:    { fixed:[], variable:[] },
  assets:      [],
  liabilities: [],
  freedomGoal: 0,
  referral:    { code: generateCode(), referredBy: null, freeMonthsEarned: 0 },
});

// ─── PERSISTENCE ──────────────────────────────────────────────────────────────
const validateShape = (raw) => {
  const fresh = makeInit();
  return {
    _version:    raw._version    ?? DATA_VERSION,
    currency:    CURRENCIES.includes(raw.currency) ? raw.currency : fresh.currency,
    darkMode:    typeof raw.darkMode === "boolean"  ? raw.darkMode : true,
    isPro:       typeof raw.isPro   === "boolean"   ? raw.isPro    : false,
    proExpiry:   raw.proExpiry   ?? null,
    profile:     (raw.profile && typeof raw.profile.name === "string") ? raw.profile : fresh.profile,
    income: {
      active:     Array.isArray(raw.income?.active)     ? raw.income.active     : [],
      passive:    Array.isArray(raw.income?.passive)    ? raw.income.passive    : [],
      sidehustle: Array.isArray(raw.income?.sidehustle) ? raw.income.sidehustle : [],
    },
    expenses: {
      fixed:    Array.isArray(raw.expenses?.fixed)    ? raw.expenses.fixed    : [],
      variable: Array.isArray(raw.expenses?.variable) ? raw.expenses.variable : [],
    },
    assets:      Array.isArray(raw.assets)      ? raw.assets      : [],
    liabilities: Array.isArray(raw.liabilities) ? raw.liabilities : [],
    freedomGoal: safeNum(raw.freedomGoal),
    referral:    raw.referral ?? fresh.referral,
  };
};

const loadLocal = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return makeInit();
    const migrated = migrateData(JSON.parse(saved));
    return validateShape(migrated);
  } catch { return makeInit(); }
};

const saveLocal = (d) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {}
};

// ─── THEMES ───────────────────────────────────────────────────────────────────
const DARK = {
  bg:"#080B0F", surface:"#0F1318", surface2:"#161B22",
  border:"rgba(255,255,255,0.07)", text:"#E8EDF2",
  muted:"rgba(232,237,242,0.45)", faint:"rgba(232,237,242,0.15)",
  green:"#4ADE80", red:"#F87171", yellow:"#FBBF24",
  blue:"#60A5FA", purple:"#C084FC", accent:"#4ADE80",
  inputBg:"rgba(255,255,255,0.05)", navBg:"rgba(8,11,15,0.97)",
  overlay:"rgba(0,0,0,0.80)",
};
const LIGHT = {
  bg:"#F4F6F9", surface:"#FFFFFF", surface2:"#EEF1F5",
  border:"rgba(0,0,0,0.08)", text:"#111827",
  muted:"rgba(17,24,39,0.5)", faint:"rgba(17,24,39,0.2)",
  green:"#16A34A", red:"#DC2626", yellow:"#D97706",
  blue:"#2563EB", purple:"#9333EA", accent:"#16A34A",
  inputBg:"rgba(0,0,0,0.04)", navBg:"rgba(244,246,249,0.97)",
  overlay:"rgba(0,0,0,0.5)",
};

// ─── TABS ─────────────────────────────────────────────────────────────────────
const TABS = [
  {id:"freedom",  label:"Freedom",  icon:"◎"},
  {id:"income",   label:"Income",   icon:"↑"},
  {id:"expenses", label:"Expenses", icon:"↓"},
  {id:"balance",  label:"Balance",  icon:"⊟"},
  {id:"cashflow", label:"Cashflow", icon:"≋"},
  {id:"settings", label:"Settings", icon:"⚙"},
];

// ─── AUTH MODAL (outside main component — fixes focus loss bug) ───────────────
// This MUST be outside Apinflow() so React never recreates it on re-render
function AuthModal({ C, onClose, onLoginSuccess }) {
  const [view, setView]       = useState("login");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  const mono = {fontFamily:"'IBM Plex Mono',monospace"};
  const inp  = {
    background:C.inputBg, border:`1px solid ${C.border}`,
    color:C.text, padding:"11px 14px", borderRadius:9,
    fontFamily:"'DM Sans',sans-serif", fontSize:14,
    width:"100%", outline:"none", marginBottom:0,
  };
  const lbl = {fontSize:11, color:C.muted, display:"block", marginBottom:5};
  const btn = {border:"none", cursor:"pointer", transition:"all 0.15s", fontFamily:"'DM Sans',sans-serif"};

  async function handleLogin() {
    if (!email || !password) { setError("Please fill in all fields"); return; }
    setLoading(true); setError("");
    try {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password });
      if (e) setError(e.message);
      else { onLoginSuccess(); onClose(); }
    } finally { setLoading(false); }
  }

  async function handleSignUp() {
    if (!email || !password) { setError("Please fill in all fields"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true); setError("");
    try {
      const { error: e } = await supabase.auth.signUp({
        email, password,
        options: { data: { name: sanitise(name) } },
      });
      if (e) setError(e.message);
      else { setError("✓ Check your email to confirm your account, then log in."); setView("login"); }
    } finally { setLoading(false); }
  }

  async function handleForgot() {
    if (!email) { setError("Enter your email address first"); return; }
    setLoading(true); setError("");
    const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (e) setError(e.message);
    else setError("✓ Password reset email sent — check your inbox");
    setLoading(false);
  }

  const submit = view === "login" ? handleLogin : view === "signup" ? handleSignUp : handleForgot;

  return (
    <div
      style={{position:"fixed", inset:0, background:C.overlay, backdropFilter:"blur(12px)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20}}
      onClick={onClose}
    >
      <div
        style={{background:C.surface, borderRadius:20, padding:28, width:"100%", maxWidth:400, border:`1px solid ${C.border}`, position:"relative"}}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button onClick={onClose} style={{...btn, position:"absolute", top:14, right:14, background:C.surface2, border:`1px solid ${C.border}`, color:C.muted, width:30, height:30, borderRadius:8, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center"}}>✕</button>

        {/* Title */}
        <div style={{marginBottom:22}}>
          <div style={{fontSize:11, color:C.muted, ...mono, letterSpacing:2, marginBottom:6}}>APINFLOW</div>
          <div style={{fontSize:20, fontWeight:700, color:C.text}}>
            {view==="login" ? "Welcome back" : view==="signup" ? "Create account" : "Reset password"}
          </div>
          <div style={{fontSize:13, color:C.muted, marginTop:4}}>
            {view==="login"  ? "Log in to sync your data across devices" :
             view==="signup" ? "Free — your data syncs everywhere" :
             "We'll send a reset link to your email"}
          </div>
        </div>

        {/* Fields */}
        <div style={{display:"grid", gap:14}}>
          {view==="signup" && (
            <div>
              <label style={lbl}>Name (optional)</label>
              <input
                autoComplete="name"
                placeholder="Your name"
                maxLength={60}
                value={name}
                onChange={e => setName(e.target.value)}
                style={inp}
              />
            </div>
          )}
          <div>
            <label style={lbl}>Email address</label>
            <input
              type="email"
              autoComplete="email"
              placeholder="your@email.com"
              maxLength={200}
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key==="Enter" && submit()}
              style={inp}
            />
          </div>
          {view !== "forgot" && (
            <div>
              <label style={lbl}>{view==="signup" ? "Password (min 8 chars)" : "Password"}</label>
              <input
                type="password"
                autoComplete={view==="signup" ? "new-password" : "current-password"}
                placeholder="••••••••"
                maxLength={200}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key==="Enter" && submit()}
                style={inp}
              />
            </div>
          )}

          {error && (
            <div style={{
              fontSize:13, padding:"10px 14px", borderRadius:9,
              color:      error.startsWith("✓") ? C.green : C.red,
              background: error.startsWith("✓") ? `${C.green}12` : `${C.red}12`,
              border:    `1px solid ${error.startsWith("✓") ? C.green+"33" : C.red+"33"}`,
            }}>
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading}
            style={{...btn, background:`${C.accent}22`, color:C.accent, border:`1px solid ${C.accent}44`, padding:"13px 16px", borderRadius:10, fontSize:15, fontWeight:600, width:"100%", opacity:loading?0.6:1}}
          >
            {loading ? "Please wait..." : view==="login" ? "Log in" : view==="signup" ? "Create account" : "Send reset link"}
          </button>
        </div>

        {/* Switch views */}
        <div style={{marginTop:16, textAlign:"center", fontSize:13, color:C.muted, display:"flex", justifyContent:"center", gap:16, flexWrap:"wrap"}}>
          {view==="login" && <>
            <span style={{cursor:"pointer", color:C.accent}} onClick={()=>{setView("forgot");setError("");}}>Forgot password?</span>
            <span style={{cursor:"pointer", color:C.accent}} onClick={()=>{setView("signup");setError("");}}>Create account</span>
          </>}
          {view==="signup" && (
            <span style={{cursor:"pointer", color:C.accent}} onClick={()=>{setView("login");setError("");}}>Already have an account? Log in</span>
          )}
          {view==="forgot" && (
            <span style={{cursor:"pointer", color:C.accent}} onClick={()=>{setView("login");setError("");}}>← Back to login</span>
          )}
        </div>

        <div style={{marginTop:14, fontSize:11, color:C.faint, textAlign:"center", lineHeight:1.6}}>
          No ads · No data selling · Your finances stay private
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Apinflow() {

  const [d, setD]         = useState(loadLocal);
  const [tab, setTab]     = useState("freedom");
  const [modal, setModal] = useState(null);
  const [form, setForm]   = useState({});

  const [showPaywall, setShowPaywall]       = useState(false);
  const [paywallFeature, setPaywallFeature] = useState("");
  const [referralCopied, setReferralCopied] = useState(false);

  const [user, setUser]         = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [syncing, setSyncing]   = useState(false);

  // Save locally on every change
  useEffect(() => { saveLocal(d); }, [d]);

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) syncFromCloud(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) syncFromCloud(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Referral from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && /^[A-Z0-9]{6,8}$/i.test(ref) && !d.referral.referredBy) {
      setD(prev => ({ ...prev, referral: { ...prev.referral, referredBy: ref.toUpperCase().slice(0,8) } }));
    }
    if (params.toString()) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // Cloud sync
  async function syncFromCloud(userId) {
    setSyncing(true);
    try {
      const { data, error } = await supabase
        .from("user_data")
        .select("data, is_pro, pro_expiry")
        .eq("user_id", userId)
        .single();
      if (error && error.code !== "PGRST116") { console.error("Sync error:", error); return; }
      if (data) {
        const cloudData = validateShape(migrateData({ ...data.data, isPro: data.is_pro, proExpiry: data.pro_expiry }));
        setD(cloudData); saveLocal(cloudData);
      } else {
        await pushToCloud(userId, d);
      }
    } finally { setSyncing(false); }
  }

  async function pushToCloud(userId, data) {
    const { isPro, proExpiry, ...rest } = data;
    await supabase.from("user_data").upsert({
      user_id: userId, data: rest,
      is_pro: isPro ?? false, pro_expiry: proExpiry ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  }

  // Debounced cloud push
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => pushToCloud(user.id, d), 1500);
    return () => clearTimeout(t);
  }, [d, user]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  // Theme + computed values
  const C   = d.darkMode ? DARK : LIGHT;
  const sym = SYM[d.currency] || "€";
  const isPro = isProActive(d.isPro, d.proExpiry);

  const sum = (arr) => arr.reduce((t,x) => t + safeNum(x.amount||x.value), 0);

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
    freedomPct < 10 ? {label:"Starting Out",     color:C.red,    desc:"Build the base. Every euro counts."}
  : freedomPct < 30 ? {label:"Gaining Ground",   color:C.yellow, desc:"Side hustle is real. Keep stacking."}
  : freedomPct < 60 ? {label:"Breaking Free",    color:C.yellow, desc:"Passive income is becoming meaningful."}
  : freedomPct < 90 ? {label:"Almost There",     color:C.green,  desc:"Passive income nearly covers your life."}
  :                   {label:"Financial Freedom", color:C.green,  desc:"Your money works harder than you do."};

  const requirePro = (featureName) => {
    if (isPro) return true;
    setPaywallFeature(featureName);
    setShowPaywall(true);
    return false;
  };

  // Data mutations
  const update = useCallback((fn) => setD(prev => { const next = deepClone(prev); fn(next); return next; }), []);
  const openAdd  = (type, section) => { setModal({type,section}); setForm({currency:d.currency}); };
  const openEdit = (type, section, item) => { setModal({type,section,item}); setForm({...item}); };
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
    const {type, section, item} = modal;
    update(n => {
      const arr = (type==="asset"||type==="liability")
        ? n[type==="asset"?"assets":"liabilities"]
        : n[type][section];
      if (item) { const i=arr.findIndex(x=>x.id===item.id); if(i>=0) arr[i]={...clean,id:item.id}; }
      else arr.push({...clean, id:Date.now()});
    });
    closeModal();
  };

  const deleteItem = () => {
    const {type, section, item} = modal;
    update(n => {
      if      (type==="asset")     n.assets      = n.assets.filter(x=>x.id!==item.id);
      else if (type==="liability") n.liabilities = n.liabilities.filter(x=>x.id!==item.id);
      else    n[type][section] = n[type][section].filter(x=>x.id!==item.id);
    });
    closeModal();
  };

  const referralLink = `${window.location.origin}?ref=${d.referral.code}`;
  const copyReferral = () => {
    copyToClipboard(referralLink).then(() => {
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2500);
    });
  };

  // Style shortcuts
  const card = {background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:18, marginBottom:12};
  const btn  = {border:"none", cursor:"pointer", fontFamily:"'IBM Plex Mono',monospace", fontWeight:600, transition:"all 0.15s"};
  const inp  = {background:C.inputBg, border:`1px solid ${C.border}`, color:C.text, padding:"10px 13px", borderRadius:9, fontFamily:"'DM Sans',sans-serif", fontSize:14, width:"100%", outline:"none"};
  const lbl  = {fontSize:10, color:C.muted, letterSpacing:2, display:"block", marginBottom:5, fontFamily:"'IBM Plex Mono',monospace"};
  const mono = {fontFamily:"'IBM Plex Mono',monospace"};

  // Sub-components (simple enough to be inline — no state, no hooks)
  const Empty = ({onAdd, label}) => (
    <div style={{textAlign:"center", padding:"20px 0"}}>
      <div style={{fontSize:12, color:C.faint, marginBottom:10, ...mono}}>— nothing yet —</div>
      <button onClick={onAdd} style={{...btn, background:`${C.accent}18`, color:C.accent, fontSize:12, padding:"7px 16px", borderRadius:8}}>
        + Add {label}
      </button>
    </div>
  );

  const Row = ({label, amount, color, currency:rc, onEdit}) => (
    <div onClick={onEdit} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.border}`, cursor:onEdit?"pointer":"default"}}>
      <span style={{fontSize:14, color:C.text}}>{label}</span>
      <div style={{display:"flex", gap:8, alignItems:"center"}}>
        <span style={{fontSize:14, ...mono, color:color||C.text, fontWeight:600}}>{SYM[rc]||sym}{safeNum(amount).toLocaleString()}</span>
        {onEdit && <span style={{fontSize:11, color:C.faint}}>✎</span>}
      </div>
    </div>
  );

  const SectionCard = ({title, items, type, section, color}) => (
    <div style={card}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
        <span style={{fontSize:12, fontWeight:700, color:color||C.muted, letterSpacing:1, ...mono}}>{title}</span>
        <button onClick={()=>openAdd(type,section)} style={{...btn, background:`${color}18`, color:color||C.accent, fontSize:11, padding:"5px 12px", borderRadius:6}}>+ ADD</button>
      </div>
      {items.length===0
        ? <Empty onAdd={()=>openAdd(type,section)} label={title.toLowerCase()} />
        : items.map(item => <Row key={item.id} label={item.label} amount={item.amount||item.value} currency={item.currency} color={color} onEdit={()=>openEdit(type,section,item)} />)
      }
      {items.length>0 && (
        <div style={{display:"flex", justifyContent:"flex-end", marginTop:10, paddingTop:8, borderTop:`1px solid ${C.border}`}}>
          <span style={{fontSize:12, ...mono, color:C.muted}}>TOTAL </span>
          <span style={{fontSize:13, ...mono, color:color||C.text, fontWeight:700, marginLeft:8}}>{sym}{sum(items).toLocaleString()}</span>
        </div>
      )}
    </div>
  );

  const ProLocked = ({feature, description, icon}) => (
    <div style={{...card, border:`1px solid ${C.purple}33`, background:`${C.purple}06`, cursor:"pointer"}} onClick={()=>requirePro(feature)}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12}}>
        <div style={{flex:1}}>
          <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap"}}>
            <span style={{fontSize:18}}>{icon}</span>
            <span style={{fontSize:14, fontWeight:700, color:C.text}}>{feature}</span>
            <span style={{fontSize:10, ...mono, background:`${C.purple}22`, color:C.purple, padding:"2px 8px", borderRadius:20}}>PRO</span>
          </div>
          <div style={{fontSize:12, color:C.muted, lineHeight:1.6}}>{description}</div>
        </div>
        <span style={{fontSize:20, flexShrink:0}}>🔒</span>
      </div>
      <button style={{...btn, marginTop:12, background:`${C.purple}18`, color:C.purple, border:`1px solid ${C.purple}33`, padding:"8px 16px", borderRadius:8, fontSize:12}}>
        Unlock with Pro →
      </button>
    </div>
  );

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'DM Sans',sans-serif", display:"flex", flexDirection:"column", transition:"background 0.3s,color 0.3s"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.accent}44;border-radius:2px;}
        select option{background:${C.surface};color:${C.text};}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp 0.2s ease forwards;}
        @keyframes barGrow{from{width:0}to{width:var(--w)}}
        .bar{animation:barGrow 1s cubic-bezier(.4,0,.2,1) forwards;}
        input,select{color:${C.text}!important;}
        input:focus,select:focus{border-color:${C.accent}!important;outline:none;}
        .shell{display:flex;flex-direction:column;max-width:500px;margin:0 auto;width:100%;}
        @media(min-width:640px){.shell{max-width:620px;}.pad{padding:20px 24px 100px;}.nav{max-width:620px;}}
        @media(min-width:1024px){.shell{max-width:520px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};}.nav{max-width:520px;}}
      `}</style>

      {/* HEADER */}
      <div className="shell" style={{position:"sticky", top:0, zIndex:40}}>
        <div style={{padding:"14px 18px 12px", background:C.bg, borderBottom:`1px solid ${C.border}`, backdropFilter:"blur(20px)"}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <div>
              <div style={{fontSize:11, color:C.muted, ...mono, letterSpacing:2}}>APINFLOW</div>
              <div style={{fontSize:16, fontWeight:700, marginTop:1, display:"flex", alignItems:"center", gap:8}}>
                {d.profile.name || (user ? user.email?.split("@")[0] : "Welcome")}
                {isPro && <span style={{fontSize:10, ...mono, background:`${C.purple}22`, color:C.purple, padding:"2px 7px", borderRadius:10}}>PRO</span>}
                {syncing && <span style={{fontSize:10, color:C.muted}}>↑ syncing</span>}
              </div>
              {d.profile.occupation && <div style={{fontSize:11, color:C.muted, marginTop:1}}>{d.profile.occupation}</div>}
            </div>
            <div style={{display:"flex", alignItems:"center", gap:8}}>
              <button onClick={()=>update(n=>n.darkMode=!n.darkMode)}
                style={{...btn, background:C.surface2, border:`1px solid ${C.border}`, color:C.muted, width:34, height:34, borderRadius:9, fontSize:16, display:"flex", alignItems:"center", justifyContent:"center"}}>
                {d.darkMode?"☀":"◑"}
              </button>
              <button onClick={()=>{ if(user) handleLogout(); else setShowAuth(true); }}
                style={{...btn, background:user?`${C.green}18`:`${C.blue}18`, color:user?C.green:C.blue, border:`1px solid ${user?C.green+"33":C.blue+"33"}`, padding:"6px 12px", borderRadius:8, fontSize:11}}>
                {user?"Log out":"Log in"}
              </button>
              <div style={{fontSize:10, ...mono, padding:"4px 8px", borderRadius:6, background:inRatRace?`${C.red}18`:`${C.green}18`, color:inRatRace?C.red:C.green, border:`1px solid ${inRatRace?C.red+"33":C.green+"33"}`}}>
                {inRatRace?"RAT RACE":"FREE"}
              </div>
            </div>
          </div>
          {!user && (totalIncome>0||totalExp>0) && (
            <div onClick={()=>setShowAuth(true)} style={{marginTop:10, padding:"8px 12px", background:`${C.blue}10`, border:`1px solid ${C.blue}22`, borderRadius:8, fontSize:12, color:C.blue, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <span>Create a free account to sync across devices</span>
              <span>→</span>
            </div>
          )}
        </div>
      </div>

      {/* CONTENT */}
      <div style={{flex:1}}>
        <div className="shell" style={{margin:"0 auto"}}>
          <div className="pad" style={{padding:"16px 16px 90px"}}>

            {/* ══ FREEDOM ══ */}
            {tab==="freedom" && (
              <div className="fu">
                <div style={{...card, background:d.darkMode?`linear-gradient(135deg,${C.surface},#0d1a12)`:`linear-gradient(135deg,${C.surface},#f0faf4)`, border:`1px solid ${stage.color}22`, marginBottom:16}}>
                  <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:16}}>FINANCIAL FREEDOM INDEX</div>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:12}}>
                    <div>
                      <div style={{fontSize:24, fontWeight:700, color:stage.color, ...mono}}>{freedomPct}%</div>
                      <div style={{fontSize:15, fontWeight:600, color:C.text, marginTop:2}}>{stage.label}</div>
                      <div style={{fontSize:12, color:C.muted, marginTop:3, maxWidth:200, lineHeight:1.5}}>{stage.desc}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:10, color:C.muted, ...mono, letterSpacing:1}}>PASSIVE + SIDE</div>
                      <div style={{fontSize:20, fontWeight:700, ...mono, color:stage.color}}>{sym}{freedomIncome.toLocaleString()}<span style={{fontSize:11, color:C.muted}}>/mo</span></div>
                      <div style={{fontSize:11, color:C.muted, marginTop:2}}>Goal: {sym}{d.freedomGoal||0}/mo</div>
                    </div>
                  </div>
                  <div style={{height:6, background:C.border, borderRadius:3, overflow:"hidden"}}>
                    <div className="bar" style={{"--w":`${freedomPct}%`, width:`${freedomPct}%`, height:"100%", borderRadius:3, background:`linear-gradient(90deg,${stage.color}88,${stage.color})`}} />
                  </div>
                  <div style={{display:"flex", justifyContent:"space-between", marginTop:6}}>
                    <span style={{fontSize:10, color:C.faint, ...mono}}>0 — RAT RACE</span>
                    <span style={{fontSize:10, color:C.faint, ...mono}}>100% — FREE</span>
                  </div>
                </div>

                {totalIncome===0 && totalExp===0 ? (
                  <div style={{...card, textAlign:"center", padding:32}}>
                    <div style={{fontSize:32, marginBottom:14}}>◎</div>
                    <div style={{fontSize:16, fontWeight:600, color:C.text, marginBottom:8}}>Start tracking your finances</div>
                    <div style={{fontSize:13, color:C.muted, lineHeight:1.8, marginBottom:20}}>Add your income, expenses, assets and liabilities to see your progress toward financial freedom.</div>
                    <button onClick={()=>setTab("income")} style={{...btn, background:`${C.accent}18`, color:C.accent, border:`1px solid ${C.accent}33`, padding:"11px 28px", borderRadius:10, fontSize:14}}>
                      Add first income →
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:10}}>MONTHLY SNAPSHOT</div>
                    <div style={{...card, padding:0, overflow:"hidden"}}>
                      {[
                        {label:"Active Income",  value:activeIncome,    color:C.blue,   sub:"job + salary"},
                        {label:"Side Hustle",    value:sideIncome,      color:C.yellow, sub:"freelance etc"},
                        {label:"Passive Income", value:passiveIncome,   color:C.green,  sub:"money working for you"},
                        {label:"Total Income",   value:totalIncome,     color:C.text,   sub:"", bold:true, divider:true},
                        {label:"Total Expenses", value:-totalExp,       color:C.red,    sub:"fixed + variable", bold:true},
                        {label:"Net Cashflow",   value:monthlyCashflow, color:monthlyCashflow>=0?C.green:C.red, sub:"", bold:true, big:true},
                      ].map((r,i)=>(
                        <div key={i} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:`${r.big?"15px":"11px"} 18px`, borderTop:r.divider?`1px solid ${C.border}`:"none", background:r.big?(monthlyCashflow>=0?`${C.green}08`:`${C.red}08`):"transparent"}}>
                          <div>
                            <div style={{fontSize:r.big?15:13, fontWeight:r.bold?700:400, color:C.text}}>{r.label}</div>
                            {r.sub && <div style={{fontSize:11, color:C.faint, ...mono}}>{r.sub}</div>}
                          </div>
                          <div style={{fontSize:r.big?17:14, fontWeight:r.bold?700:500, ...mono, color:r.color}}>
                            {r.value>=0?"":"-"}{sym}{Math.abs(r.value).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:10, marginTop:20}}>BALANCE SHEET</div>
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
                      {[{label:"Assets",value:totalAssets,color:C.green},{label:"Liabilities",value:totalLiabilities,color:C.red}].map(s=>(
                        <div key={s.label} style={{...card, marginBottom:0, textAlign:"center", padding:16}}>
                          <div style={{fontSize:10, color:C.muted, ...mono, letterSpacing:1, marginBottom:6}}>{s.label.toUpperCase()}</div>
                          <div style={{fontSize:22, fontWeight:700, ...mono, color:s.color}}>{sym}{s.value.toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{...card, display:"flex", justifyContent:"space-between", alignItems:"center", background:netWorth>=0?`${C.green}08`:`${C.red}08`, border:`1px solid ${netWorth>=0?C.green+"22":C.red+"22"}`}}>
                      <div>
                        <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono}}>NET WORTH</div>
                        <div style={{fontSize:12, color:C.faint, marginTop:2}}>Buy assets. Avoid liabilities.</div>
                      </div>
                      <div style={{fontSize:26, fontWeight:700, ...mono, color:netWorth>=0?C.green:C.red}}>
                        {netWorth>=0?"":"-"}{sym}{Math.abs(netWorth).toLocaleString()}
                      </div>
                    </div>
                  </>
                )}

                <div style={{...card, marginTop:4}}>
                  <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:8}}>FREEDOM TARGET</div>
                  <div style={{fontSize:13, color:C.muted, marginBottom:10}}>Monthly passive income needed to be free</div>
                  <input type="number" min="0" max="9999999" placeholder="e.g. 2000" value={d.freedomGoal||""}
                    onChange={e=>update(n=>n.freedomGoal=safeNum(e.target.value))}
                    style={{...inp, fontSize:16, fontWeight:700, color:C.green, fontFamily:"'IBM Plex Mono',monospace"}} />
                  {d.freedomGoal>0 && freedomIncome<d.freedomGoal && (
                    <div style={{fontSize:12, color:C.muted, ...mono, marginTop:8}}>{sym}{Math.max(0,d.freedomGoal-freedomIncome).toLocaleString()} still to go</div>
                  )}
                </div>

                {!isPro && (
                  <div style={{...card, border:`1px solid ${C.purple}33`, background:`${C.purple}06`, cursor:"pointer"}} onClick={()=>setShowPaywall(true)}>
                    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:14, fontWeight:700, color:C.text, marginBottom:4}}>✦ Upgrade to Pro</div>
                        <div style={{fontSize:12, color:C.muted}}>AI assistant · Asset tracking · Spending charts</div>
                      </div>
                      <div style={{fontSize:16, fontWeight:800, ...mono, color:C.purple, flexShrink:0}}>€3.99<span style={{fontSize:11}}>/mo</span></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══ INCOME ══ */}
            {tab==="income" && (
              <div className="fu">
                <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:14}}>INCOME STATEMENT</div>
                <SectionCard title="ACTIVE INCOME"  items={d.income.active}     type="income" section="active"     color={C.blue} />
                <SectionCard title="SIDE HUSTLE"    items={d.income.sidehustle} type="income" section="sidehustle" color={C.yellow} />
                <SectionCard title="PASSIVE INCOME" items={d.income.passive}    type="income" section="passive"    color={C.green} />
                {(totalIncome>0||totalExp>0) && (
                  <div style={{...card, background:`${C.green}06`, border:`1px solid ${C.green}18`}}>
                    <div style={{fontSize:11, color:C.green, fontWeight:700, marginBottom:6, ...mono}}>THE GOAL</div>
                    <div style={{fontSize:13, color:C.muted, lineHeight:1.9}}>
                      Passive income must exceed total expenses.<br/>
                      Now: <span style={{color:C.green, fontWeight:700}}>{sym}{freedomIncome.toLocaleString()}/mo</span> vs <span style={{color:C.red, fontWeight:700}}>{sym}{totalExp.toLocaleString()}/mo</span>
                      {totalExp>freedomIncome && <span><br/>Gap: <span style={{color:C.yellow, fontWeight:700}}>{sym}{(totalExp-freedomIncome).toLocaleString()}/mo</span></span>}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══ EXPENSES ══ */}
            {tab==="expenses" && (
              <div className="fu">
                <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:14}}>EXPENSE STATEMENT</div>
                <SectionCard title="FIXED EXPENSES"    items={d.expenses.fixed}    type="expenses" section="fixed"    color={C.red} />
                <SectionCard title="VARIABLE EXPENSES" items={d.expenses.variable} type="expenses" section="variable" color="#FB923C" />
                {totalExp>0 && (
                  <div style={{...card, background:`${C.red}06`, border:`1px solid ${C.red}18`}}>
                    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                      <div style={{fontSize:12, color:C.muted, ...mono}}>TOTAL OUTFLOW</div>
                      <div style={{fontSize:22, fontWeight:700, ...mono, color:C.red}}>{sym}{totalExp.toLocaleString()}</div>
                    </div>
                    {totalIncome>0 && (
                      <div style={{marginTop:10, paddingTop:10, borderTop:`1px solid ${C.border}`}}>
                        <div style={{fontSize:12, color:C.muted, marginBottom:6}}>
                          {Math.min(100,Math.round((totalExp/totalIncome)*100))}% of income
                          {totalExp/totalIncome<0.7?" ✓ healthy":totalExp>totalIncome?" ⚠ over income":" — aim below 70%"}
                        </div>
                        <div style={{height:5, background:C.border, borderRadius:3, overflow:"hidden"}}>
                          <div style={{width:`${Math.min(100,Math.round((totalExp/totalIncome)*100))}%`, height:"100%", borderRadius:3, background:totalExp>totalIncome?C.red:C.yellow}} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══ BALANCE ══ */}
            {tab==="balance" && (
              <div className="fu">
                <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:14}}>BALANCE SHEET</div>
                <div style={card}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
                    <span style={{fontSize:12, fontWeight:700, color:C.green, letterSpacing:1, ...mono}}>ASSETS</span>
                    <button onClick={()=>openAdd("asset","assets")} style={{...btn, background:`${C.green}18`, color:C.green, fontSize:11, padding:"5px 12px", borderRadius:6}}>+ ADD</button>
                  </div>
                  {d.assets.length===0 ? <Empty onAdd={()=>openAdd("asset","assets")} label="asset" />
                    : d.assets.map(a=>(
                      <div key={a.id} onClick={()=>openEdit("asset","assets",a)} style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"10px 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer"}}>
                        <div><div style={{fontSize:14, color:C.text}}>{a.label}</div><div style={{fontSize:11, color:C.faint, ...mono, marginTop:2}}>{a.type}{a.note?` · ${a.note}`:""}</div></div>
                        <div style={{display:"flex", gap:6, alignItems:"center"}}>
                          <span style={{fontSize:14, ...mono, color:C.green, fontWeight:600}}>{SYM[a.currency]||sym}{safeNum(a.value).toLocaleString()}</span>
                          <span style={{fontSize:11, color:C.faint}}>✎</span>
                        </div>
                      </div>
                    ))
                  }
                  {d.assets.length>0 && <div style={{display:"flex", justifyContent:"flex-end", marginTop:10, paddingTop:8, borderTop:`1px solid ${C.border}`}}><span style={{fontSize:13, ...mono, color:C.green, fontWeight:700}}>TOTAL {sym}{totalAssets.toLocaleString()}</span></div>}
                </div>
                <div style={card}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
                    <span style={{fontSize:12, fontWeight:700, color:C.red, letterSpacing:1, ...mono}}>LIABILITIES</span>
                    <button onClick={()=>openAdd("liability","liabilities")} style={{...btn, background:`${C.red}18`, color:C.red, fontSize:11, padding:"5px 12px", borderRadius:6}}>+ ADD</button>
                  </div>
                  {d.liabilities.length===0 ? <Empty onAdd={()=>openAdd("liability","liabilities")} label="liability" />
                    : d.liabilities.map(l=>(
                      <div key={l.id} onClick={()=>openEdit("liability","liabilities",l)} style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"10px 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer"}}>
                        <div><div style={{fontSize:14, color:C.text}}>{l.label}</div>{l.note && <div style={{fontSize:11, color:C.faint, ...mono, marginTop:2}}>{l.note}</div>}</div>
                        <div style={{display:"flex", gap:6, alignItems:"center"}}>
                          <span style={{fontSize:14, ...mono, color:C.red, fontWeight:600}}>{SYM[l.currency]||sym}{safeNum(l.amount).toLocaleString()}</span>
                          <span style={{fontSize:11, color:C.faint}}>✎</span>
                        </div>
                      </div>
                    ))
                  }
                  {d.liabilities.length>0 && <div style={{display:"flex", justifyContent:"flex-end", marginTop:10, paddingTop:8, borderTop:`1px solid ${C.border}`}}><span style={{fontSize:13, ...mono, color:C.red, fontWeight:700}}>TOTAL {sym}{totalLiabilities.toLocaleString()}</span></div>}
                </div>
                <div style={{...card, background:netWorth>=0?`${C.green}08`:`${C.red}08`, border:`1px solid ${netWorth>=0?C.green+"22":C.red+"22"}`}}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                    <div><div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono}}>NET WORTH</div><div style={{fontSize:12, color:C.faint, marginTop:2}}>Buy assets. Avoid liabilities.</div></div>
                    <div style={{fontSize:26, fontWeight:700, ...mono, color:netWorth>=0?C.green:C.red}}>{netWorth>=0?"":"-"}{sym}{Math.abs(netWorth).toLocaleString()}</div>
                  </div>
                </div>
                <ProLocked feature="Live Asset Tracking" description="Auto-update stock, crypto and property values. Net worth stays current without manual updates." icon="📈" />
              </div>
            )}

            {/* ══ CASHFLOW ══ */}
            {tab==="cashflow" && (
              <div className="fu">
                <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:14}}>CASHFLOW STATEMENT</div>
                {totalIncome===0 && totalExp===0 ? (
                  <div style={{...card, textAlign:"center", padding:32}}>
                    <div style={{fontSize:14, color:C.muted, lineHeight:2}}>Add income and expenses first.<br/><span style={{fontSize:12, color:C.faint}}>Your cashflow will appear here.</span></div>
                  </div>
                ) : (
                  <>
                    <div style={{...card, marginBottom:16}}>
                      <div style={{fontSize:11, color:C.muted, ...mono, marginBottom:14}}>WHERE YOUR MONEY FLOWS</div>
                      {[
                        {label:"Active",      value:activeIncome,  color:C.blue},
                        {label:"Side Hustle", value:sideIncome,    color:C.yellow},
                        {label:"Passive",     value:passiveIncome, color:C.green},
                      ].map(bar=>(
                        <div key={bar.label} style={{marginBottom:12}}>
                          <div style={{display:"flex", justifyContent:"space-between", marginBottom:5}}>
                            <span style={{fontSize:13, color:C.muted}}>{bar.label}</span>
                            <span style={{fontSize:13, ...mono, color:bar.color}}>{sym}{bar.value.toLocaleString()}</span>
                          </div>
                          <div style={{height:6, background:C.border, borderRadius:3, overflow:"hidden"}}>
                            <div style={{width:`${totalIncome>0?Math.round((bar.value/totalIncome)*100):0}%`, height:"100%", background:bar.color, borderRadius:3, transition:"width 0.7s"}} />
                          </div>
                        </div>
                      ))}
                      <div style={{height:1, background:C.border, margin:"14px 0"}} />
                      {[
                        {label:"Fixed",    value:fixedExp, color:C.red},
                        {label:"Variable", value:varExp,   color:"#FB923C"},
                      ].map(bar=>(
                        <div key={bar.label} style={{marginBottom:12}}>
                          <div style={{display:"flex", justifyContent:"space-between", marginBottom:5}}>
                            <span style={{fontSize:13, color:C.muted}}>{bar.label}</span>
                            <span style={{fontSize:13, ...mono, color:bar.color}}>{sym}{bar.value.toLocaleString()}</span>
                          </div>
                          <div style={{height:6, background:C.border, borderRadius:3, overflow:"hidden"}}>
                            <div style={{width:`${totalExp>0?Math.round((bar.value/totalExp)*100):0}%`, height:"100%", background:bar.color, borderRadius:3, transition:"width 0.7s"}} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{...card, textAlign:"center", background:monthlyCashflow>=0?`${C.green}08`:`${C.red}08`, border:`1px solid ${monthlyCashflow>=0?C.green+"22":C.red+"22"}`}}>
                      <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:10}}>MONTHLY CASHFLOW</div>
                      <div style={{fontSize:44, fontWeight:700, ...mono, color:monthlyCashflow>=0?C.green:C.red, letterSpacing:"-1px"}}>
                        {monthlyCashflow>=0?"+":""}{sym}{monthlyCashflow.toLocaleString()}
                      </div>
                      <div style={{fontSize:13, color:C.muted, marginTop:8}}>
                        {monthlyCashflow>=0?`${sym}${monthlyCashflow.toLocaleString()} to invest or save each month`:`Spending ${sym}${Math.abs(monthlyCashflow).toLocaleString()} more than you earn`}
                      </div>
                    </div>
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginTop:10}}>
                      {[
                        {label:"Annual Income",   value:totalIncome*12,     color:C.green},
                        {label:"Annual Expenses", value:totalExp*12,        color:C.red},
                        {label:"Annual Cashflow", value:monthlyCashflow*12, color:monthlyCashflow>=0?C.green:C.red},
                      ].map(s=>(
                        <div key={s.label} style={{...card, marginBottom:0, textAlign:"center", padding:14}}>
                          <div style={{fontSize:9, color:C.muted, ...mono, letterSpacing:1, marginBottom:6}}>{s.label}</div>
                          <div style={{fontSize:15, fontWeight:700, ...mono, color:s.color}}>{sym}{(s.value/1000).toFixed(1)}k</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div style={{marginTop:12}}>
                  <ProLocked feature="Charts & Insights" description="Visual spending trends, monthly comparisons and financial insights." icon="📊" />
                </div>
              </div>
            )}

            {/* ══ SETTINGS ══ */}
            {tab==="settings" && (
              <div className="fu">
                <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:14}}>SETTINGS</div>

                {/* Account */}
                <div style={card}>
                  <div style={{fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1, ...mono, marginBottom:14}}>ACCOUNT</div>
                  {user ? (
                    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:14, color:C.text, fontWeight:600}}>{user.email}</div>
                        <div style={{fontSize:12, color:C.green, marginTop:4}}>✓ Data synced across devices</div>
                      </div>
                      <button onClick={handleLogout} style={{...btn, background:`${C.red}15`, color:C.red, border:`1px solid ${C.red}33`, padding:"8px 16px", borderRadius:8, fontSize:12}}>
                        Log out
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{fontSize:13, color:C.muted, marginBottom:14, lineHeight:1.7}}>Create a free account to sync your data across all your devices. No payment needed.</div>
                      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
                        <button onClick={()=>setShowAuth(true)} style={{...btn, background:`${C.blue}18`, color:C.blue, border:`1px solid ${C.blue}33`, padding:"10px 12px", borderRadius:9, fontSize:13}}>
                          Log in
                        </button>
                        <button onClick={()=>setShowAuth(true)} style={{...btn, background:`${C.accent}18`, color:C.accent, border:`1px solid ${C.accent}33`, padding:"10px 12px", borderRadius:9, fontSize:13}}>
                          Create account
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Profile */}
                <div style={card}>
                  <div style={{fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1, ...mono, marginBottom:14}}>PROFILE</div>
                  <div style={{marginBottom:12}}>
                    <label style={lbl}>YOUR NAME</label>
                    <input maxLength={60} placeholder="Your name" value={d.profile.name}
                      onChange={e=>update(n=>n.profile={...n.profile,name:sanitise(e.target.value)})} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>OCCUPATION</label>
                    <input maxLength={80} placeholder="e.g. IT Student" value={d.profile.occupation}
                      onChange={e=>update(n=>n.profile={...n.profile,occupation:sanitise(e.target.value)})} style={inp} />
                  </div>
                </div>

                {/* Pro */}
                {!isPro ? (
                  <div style={{...card, border:`1px solid ${C.purple}33`, background:`${C.purple}06`}}>
                    <div style={{fontSize:12, fontWeight:700, color:C.purple, letterSpacing:1, ...mono, marginBottom:14}}>APINFLOW PRO</div>
                    <div style={{display:"grid", gap:10, marginBottom:18}}>
                      {["AI financial assistant (coming soon)","Live asset & stock tracking","Spending charts & trends","Priority support"].map(f=>(
                        <div key={f} style={{display:"flex", gap:10, alignItems:"center"}}>
                          <span style={{color:C.purple, fontSize:16}}>✓</span>
                          <span style={{fontSize:14, color:C.text}}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                      <a href={`${STRIPE.monthly}?client_reference_id=${d.referral.code}`} style={{textDecoration:"none"}}>
                        <button style={{...btn, width:"100%", background:`${C.purple}22`, color:C.purple, border:`1px solid ${C.purple}44`, padding:"14px 8px", borderRadius:10, lineHeight:1.5, fontFamily:"'DM Sans',sans-serif"}}>
                          <div style={{fontSize:18, fontWeight:800, ...mono}}>€3.99</div>
                          <div style={{fontSize:12, opacity:0.7}}>per month</div>
                        </button>
                      </a>
                      <a href={`${STRIPE.yearly}?client_reference_id=${d.referral.code}`} style={{textDecoration:"none"}}>
                        <button style={{...btn, width:"100%", background:C.purple, color:"#fff", border:"none", padding:"14px 8px", borderRadius:10, lineHeight:1.5, position:"relative", fontFamily:"'DM Sans',sans-serif"}}>
                          <div style={{fontSize:10, ...mono, position:"absolute", top:-10, right:8, background:C.yellow, color:"#000", padding:"3px 8px", borderRadius:10, fontWeight:700}}>SAVE 37%</div>
                          <div style={{fontSize:18, fontWeight:800, ...mono}}>€29.99</div>
                          <div style={{fontSize:12, opacity:0.85}}>per year</div>
                        </button>
                      </a>
                    </div>
                    <div style={{fontSize:11, color:C.faint, textAlign:"center", marginTop:12, ...mono}}>Secure via Stripe · No ads · Cancel anytime</div>
                  </div>
                ) : (
                  <div style={{...card, border:`1px solid ${C.purple}33`, background:`${C.purple}06`}}>
                    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:14, fontWeight:700, color:C.purple}}>✦ Pro Active</div>
                        {d.proExpiry && <div style={{fontSize:12, color:C.muted, marginTop:3}}>Renews {new Date(d.proExpiry).toLocaleDateString()}</div>}
                      </div>
                      <span style={{fontSize:10, ...mono, background:`${C.purple}22`, color:C.purple, padding:"4px 12px", borderRadius:20}}>ACTIVE</span>
                    </div>
                  </div>
                )}

                {/* Referral */}
                <div style={card}>
                  <div style={{fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1, ...mono, marginBottom:8}}>REFER A FRIEND</div>
                  <div style={{fontSize:13, color:C.muted, marginBottom:14, lineHeight:1.7}}>Share your link. When a friend subscribes you both get <strong style={{color:C.text}}>1 month Pro free</strong>.</div>
                  <div style={{background:C.inputBg, border:`1px solid ${C.border}`, borderRadius:9, padding:"10px 14px", marginBottom:10}}>
                    <div style={{fontSize:10, color:C.faint, ...mono, marginBottom:4}}>YOUR REFERRAL LINK</div>
                    <div style={{fontSize:12, color:C.text, wordBreak:"break-all", lineHeight:1.5}}>{referralLink}</div>
                  </div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
                    <button onClick={copyReferral} style={{...btn, background:referralCopied?`${C.green}22`:`${C.accent}18`, color:referralCopied?C.green:C.accent, border:`1px solid ${referralCopied?C.green:C.accent}33`, padding:"10px 12px", borderRadius:9, fontSize:13}}>
                      {referralCopied?"✓ Copied!":"Copy link"}
                    </button>
                    <button onClick={()=>{ if(navigator.share) navigator.share({title:"Apinflow",text:"Track your path to financial freedom",url:referralLink}); else copyReferral(); }}
                      style={{...btn, background:`${C.blue}18`, color:C.blue, border:`1px solid ${C.blue}33`, padding:"10px 12px", borderRadius:9, fontSize:13}}>
                      Share
                    </button>
                  </div>
                </div>

                {/* Appearance */}
                <div style={card}>
                  <div style={{fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1, ...mono, marginBottom:14}}>APPEARANCE</div>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:14, color:C.text, fontWeight:600}}>{d.darkMode?"Dark mode":"Light mode"}</div>
                      <div style={{fontSize:12, color:C.muted, marginTop:2}}>More themes coming for Pro</div>
                    </div>
                    <button onClick={()=>update(n=>n.darkMode=!n.darkMode)}
                      style={{...btn, background:d.darkMode?C.green:`${C.green}22`, color:d.darkMode?"#000":C.green, border:`1px solid ${C.green}44`, padding:"9px 18px", borderRadius:10, fontSize:13}}>
                      {d.darkMode?"☀ Light":"◑ Dark"}
                    </button>
                  </div>
                </div>

                {/* Currency */}
                <div style={card}>
                  <div style={{fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1, ...mono, marginBottom:14}}>DEFAULT CURRENCY</div>
                  <select value={d.currency} onChange={e=>update(n=>n.currency=CURRENCIES.includes(e.target.value)?e.target.value:n.currency)} style={inp}>
                    {CURRENCIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>

                {/* Freedom goal */}
                <div style={card}>
                  <div style={{fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1, ...mono, marginBottom:8}}>FREEDOM GOAL</div>
                  <div style={{fontSize:13, color:C.muted, marginBottom:12}}>Monthly passive income needed to be free.</div>
                  <input type="number" min="0" max="9999999" placeholder="0" value={d.freedomGoal||""}
                    onChange={e=>update(n=>n.freedomGoal=safeNum(e.target.value))}
                    style={{...inp, fontSize:16, fontWeight:700, color:C.green, fontFamily:"'IBM Plex Mono',monospace"}} />
                </div>

                {/* Danger zone */}
                <div style={{...card, border:`1px solid ${C.red}33`, background:`${C.red}05`}}>
                  <div style={{fontSize:12, fontWeight:700, color:C.red, letterSpacing:1, ...mono, marginBottom:10}}>DANGER ZONE</div>
                  <div style={{fontSize:13, color:C.muted, marginBottom:14}}>Reset everything to zero. Cannot be undone.</div>
                  <button onClick={()=>{ if(window.confirm("Reset all data? This cannot be undone.")){ localStorage.removeItem(STORAGE_KEY); setD(makeInit()); setTab("freedom"); } }}
                    style={{...btn, background:`${C.red}15`, color:C.red, border:`1px solid ${C.red}33`, padding:"11px 20px", borderRadius:9, fontSize:13, width:"100%"}}>
                    Reset all data
                  </button>
                </div>

                <div style={{textAlign:"center", padding:"16px 0", fontSize:11, color:C.faint, ...mono}}>
                  APINFLOW v1.4 · {user?"Synced to cloud ✓":"Data on this device"}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* BOTTOM NAV */}
      <div className="nav" style={{position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", background:C.navBg, backdropFilter:"blur(20px)", borderTop:`1px solid ${C.border}`, padding:"8px 4px 10px", display:"flex", zIndex:40}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1, background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"4px 0"}}>
            <span style={{fontSize:17, opacity:tab===t.id?1:0.3, transition:"opacity 0.15s"}}>{t.icon}</span>
            <span style={{fontSize:9, ...mono, fontWeight:600, color:tab===t.id?C.accent:C.faint, letterSpacing:0.5}}>{t.label.toUpperCase()}</span>
          </button>
        ))}
      </div>

      {/* ADD/EDIT MODAL */}
      {modal && (
        <div style={{position:"fixed", inset:0, background:C.overlay, backdropFilter:"blur(8px)", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center"}} onClick={closeModal}>
          <div style={{background:C.surface, borderRadius:"20px 20px 0 0", padding:"24px 20px 32px", width:"100%", maxWidth:520, border:`1px solid ${C.border}`}} onClick={e=>e.stopPropagation()}>
            <div style={{width:32, height:3, borderRadius:2, background:C.border, margin:"0 auto 20px"}} />
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18}}>
              <h3 style={{fontSize:15, fontWeight:700, ...mono, color:C.text}}>{modal.item?"EDIT":"ADD"} {modal.type.toUpperCase()}</h3>
              {modal.item && <button onClick={deleteItem} style={{...btn, background:`${C.red}15`, color:C.red, fontSize:11, padding:"6px 12px", borderRadius:6}}>DELETE</button>}
            </div>
            <div style={{display:"grid", gap:12}}>
              <div>
                <label style={lbl}>LABEL</label>
                <input maxLength={100} placeholder="e.g. Salary" value={form.label||""} onChange={e=>setForm(f=>({...f,label:e.target.value}))} style={inp} />
              </div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                <div>
                  <label style={lbl}>{modal.type==="asset"?"VALUE":"AMOUNT"}</label>
                  <input type="number" min="0" max="9999999" step="0.01" placeholder="0"
                    value={form.amount||form.value||""}
                    onChange={e=>setForm(f=>({...f,amount:parseFloat(e.target.value)||0,value:parseFloat(e.target.value)||0}))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>CURRENCY</label>
                  <select value={form.currency||d.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))} style={inp}>
                    {CURRENCIES.map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {modal.type==="asset" && (
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
                <input maxLength={100} placeholder="Any detail" value={form.note||""} onChange={e=>setForm(f=>({...f,note:e.target.value}))} style={inp} />
              </div>
              <button onClick={saveItem} style={{...btn, background:`${C.green}18`, color:C.green, border:`1px solid ${C.green}33`, padding:14, borderRadius:10, fontSize:14, width:"100%", fontFamily:"'DM Sans',sans-serif", fontWeight:600}}>
                {modal.item?"SAVE CHANGES":"ADD"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAYWALL */}
      {showPaywall && (
        <div style={{position:"fixed", inset:0, background:C.overlay, backdropFilter:"blur(12px)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center"}} onClick={()=>setShowPaywall(false)}>
          <div style={{background:d.darkMode?"#13131A":C.surface, borderRadius:"24px 24px 0 0", padding:"28px 24px 40px", width:"100%", maxWidth:520, border:`1px solid ${C.border}`, position:"relative"}} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setShowPaywall(false)} style={{...btn, position:"absolute", top:16, right:16, background:C.surface2, border:`1px solid ${C.border}`, color:C.muted, width:30, height:30, borderRadius:8, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center"}}>✕</button>
            <div style={{width:36, height:4, borderRadius:2, background:C.border, margin:"0 auto 24px"}} />
            <div style={{fontSize:11, color:C.purple, ...mono, letterSpacing:2, marginBottom:8, textAlign:"center"}}>APINFLOW PRO</div>
            {paywallFeature && <div style={{fontSize:14, color:C.muted, marginBottom:16, textAlign:"center"}}>Unlock <strong style={{color:C.text}}>{paywallFeature}</strong> and more</div>}
            <div style={{display:"grid", gap:10, marginBottom:20}}>
              {["AI financial assistant (coming soon)","Live asset & stock tracking","Spending charts & trends","Priority support"].map(f=>(
                <div key={f} style={{display:"flex", gap:10, alignItems:"center", padding:"9px 0", borderBottom:`1px solid ${C.border}`}}>
                  <span style={{color:C.purple, fontSize:16}}>✓</span>
                  <span style={{fontSize:14, color:C.text}}>{f}</span>
                </div>
              ))}
            </div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14}}>
              <a href={`${STRIPE.monthly}?client_reference_id=${d.referral.code}`} style={{textDecoration:"none"}}>
                <button style={{...btn, width:"100%", background:`${C.purple}22`, color:C.purple, border:`1px solid ${C.purple}44`, padding:"14px 8px", borderRadius:12, lineHeight:1.5, fontFamily:"'DM Sans',sans-serif"}}>
                  <div style={{fontSize:20, fontWeight:800, ...mono}}>€3.99</div>
                  <div style={{fontSize:12, opacity:0.7}}>per month</div>
                </button>
              </a>
              <a href={`${STRIPE.yearly}?client_reference_id=${d.referral.code}`} style={{textDecoration:"none"}}>
                <button style={{...btn, width:"100%", background:C.purple, color:"#fff", border:"none", padding:"14px 8px", borderRadius:12, lineHeight:1.5, position:"relative", fontFamily:"'DM Sans',sans-serif"}}>
                  <div style={{fontSize:10, ...mono, position:"absolute", top:-10, right:8, background:C.yellow, color:"#000", padding:"3px 8px", borderRadius:10, fontWeight:700}}>SAVE 37%</div>
                  <div style={{fontSize:20, fontWeight:800, ...mono}}>€29.99</div>
                  <div style={{fontSize:12, opacity:0.85}}>per year</div>
                </button>
              </a>
            </div>
            <div style={{fontSize:11, color:C.faint, textAlign:"center", ...mono}}>Secure via Stripe · No ads · Cancel anytime</div>
          </div>
        </div>
      )}

      {/* AUTH MODAL — rendered as separate component outside, fixes focus bug */}
      {showAuth && (
        <AuthModal
          C={C}
          onClose={() => setShowAuth(false)}
          onLoginSuccess={() => setShowAuth(false)}
        />
      )}

    </div>
  );
}