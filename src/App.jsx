// ============================================================
// APINFLOW — v1.3 FINAL
// - All values start at zero
// - localStorage for anonymous users (no account needed)
// - Supabase auth (email + Google) for sync across devices
// - Data migration system — updates never erase user data
// - Fully responsive (phone, tablet, desktop)
// - Pro feature gates (locked UI, no AI yet)
// - Referral system
// - Secure: no URL-based Pro bypass, crypto referral codes
// - No ads ever
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "./supabase";

// ─── VERSION & MIGRATION ──────────────────────────────────────────────────────
// HOW TO UPDATE SAFELY IN THE FUTURE:
// 1. Change DATA_VERSION to the next number (e.g. 3)
// 2. Add a migration function: MIGRATIONS[3] = (old) => ({ ...old, newField: defaultValue })
// 3. Deploy — existing users get their data migrated automatically
// NEVER remove old migration functions — someone might be upgrading from any version
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

// Stripe payment links — replace with real links from Stripe dashboard
const STRIPE = {
  monthly: "https://buy.stripe.com/YOUR_MONTHLY_LINK",
  yearly:  "https://buy.stripe.com/YOUR_YEARLY_LINK",
};

// ─── SECURITY HELPERS ─────────────────────────────────────────────────────────

// Strip HTML injection characters from all text inputs
const sanitise = (str) =>
  String(str).replace(/&/g,"").replace(/</g,"").replace(/>/g,"")
    .replace(/"/g,"").replace(/'/g,"").trim().slice(0,100);

// Clamp numbers — prevents NaN, Infinity, negatives, impossibly large values
const safeNum = (val) => {
  const n = parseFloat(val);
  if (isNaN(n)||!isFinite(n)||n<0) return 0;
  return Math.min(n, 9_999_999);
};

// Cryptographically secure referral code (NOT Math.random which is predictable)
function generateCode() {
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(36).padStart(2,"0")).join("").toUpperCase().slice(0,8);
}

// Safe Pro expiry check — guards against malformed date strings
function isProActive(isPro, proExpiry) {
  if (!isPro) return false;
  if (!proExpiry) return true;
  try { return new Date(proExpiry).getTime() > Date.now(); } catch { return false; }
}

// Deep clone — prevents React StrictMode double-render bugs with nested arrays
function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

// Clipboard with fallback for older browsers
function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.cssText = "position:fixed;top:-9999px;opacity:0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); } catch {}
  document.body.removeChild(ta); return Promise.resolve();
}

// ─── INITIAL DATA — everything at zero ───────────────────────────────────────
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

// ─── TABS ─────────────────────────────────────────────────────────────────────
const TABS = [
  {id:"freedom",  label:"Freedom",  icon:"◎"},
  {id:"income",   label:"Income",   icon:"↑"},
  {id:"expenses", label:"Expenses", icon:"↓"},
  {id:"balance",  label:"Balance",  icon:"⊟"},
  {id:"cashflow", label:"Cashflow", icon:"≋"},
  {id:"settings", label:"Settings", icon:"⚙"},
];

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

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Apinflow() {

  const [d, setD]                   = useState(loadLocal);
  const [tab, setTab]               = useState("freedom");
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState({});
  const [showPaywall, setShowPaywall]     = useState(false);
  const [paywallFeature, setPaywallFeature] = useState("");
  const [referralCopied, setReferralCopied] = useState(false);

  // Auth state
  const [user, setUser]             = useState(null);
  const [authView, setAuthView]     = useState("login"); // "login" | "signup" | "forgot"
  const [showAuth, setShowAuth]     = useState(false);
  const [authForm, setAuthForm]     = useState({ email:"", password:"", name:"" });
  const [authError, setAuthError]   = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [syncing, setSyncing]       = useState(false);

  // ── SAVE locally on every change ──
  useEffect(() => { saveLocal(d); }, [d]);

  // ── AUTH LISTENER — detects login/logout ──
  useEffect(() => {
    // Check if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) syncFromCloud(session.user.id);
    });
    // Listen for login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) syncFromCloud(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── REFERRAL from URL ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    // Only accept clean alphanumeric codes — no injection possible
    if (ref && /^[A-Z0-9]{6,8}$/i.test(ref) && !d.referral.referredBy) {
      setD(prev => ({ ...prev, referral: { ...prev.referral, referredBy: ref.toUpperCase().slice(0,8) } }));
    }
    if (params.toString()) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // ── CLOUD SYNC ────────────────────────────────────────────────────────────

  // Pull data from Supabase — called on login
  async function syncFromCloud(userId) {
    setSyncing(true);
    try {
      const { data, error } = await supabase
        .from("user_data")
        .select("data, is_pro, pro_expiry")
        .eq("user_id", userId)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found (first login) — that's fine
        console.error("Sync error:", error);
        return;
      }

      if (data) {
        // User has cloud data — migrate and validate it
        const cloudData = validateShape(migrateData({ ...data.data, isPro: data.is_pro, proExpiry: data.pro_expiry }));
        // Cloud data wins over local (cloud is the source of truth when logged in)
        setD(cloudData);
        saveLocal(cloudData);
      } else {
        // First login — upload existing local data to cloud
        await pushToCloud(userId, d);
      }
    } finally {
      setSyncing(false);
    }
  }

  // Push data to Supabase — called on every save when logged in
  async function pushToCloud(userId, data) {
    const { isPro, proExpiry, ...financialData } = data;
    await supabase.from("user_data").upsert({
      user_id:    userId,
      data:       financialData,
      is_pro:     isPro    ?? false,
      pro_expiry: proExpiry ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  }

  // Auto-sync to cloud whenever data changes and user is logged in
  useEffect(() => {
    if (user) {
      const timeout = setTimeout(() => pushToCloud(user.id, d), 1500);
      return () => clearTimeout(timeout);
      // Debounced — waits 1.5s after last change before pushing
      // Prevents hammering the database on every keystroke
    }
  }, [d, user]);

  // ── AUTH ACTIONS ──────────────────────────────────────────────────────────

  async function handleSignUp() {
    if (!authForm.email || !authForm.password) return;
    if (authForm.password.length < 8) { setAuthError("Password must be at least 8 characters"); return; }
    setAuthLoading(true); setAuthError("");
    try {
      const { error } = await supabase.auth.signUp({
        email:    authForm.email,
        password: authForm.password,
        options:  { data: { name: sanitise(authForm.name) } },
      });
      if (error) setAuthError(error.message);
      else {
        setAuthError("✓ Check your email to confirm your account");
        setAuthView("login");
      }
    } finally { setAuthLoading(false); }
  }

  async function handleLogin() {
    if (!authForm.email || !authForm.password) return;
    setAuthLoading(true); setAuthError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email:    authForm.email,
        password: authForm.password,
      });
      if (error) setAuthError(error.message);
      else { setShowAuth(false); setAuthForm({ email:"", password:"", name:"" }); }
    } finally { setAuthLoading(false); }
  }

  async function handleGoogle() {
    setAuthLoading(true); setAuthError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options:  { redirectTo: window.location.origin },
    });
    if (error) { setAuthError(error.message); setAuthLoading(false); }
    // On success, browser redirects to Google — no further action needed here
  }

  async function handleForgotPassword() {
    if (!authForm.email) { setAuthError("Enter your email first"); return; }
    setAuthLoading(true); setAuthError("");
    const { error } = await supabase.auth.resetPasswordForEmail(authForm.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setAuthError(error.message);
    else setAuthError("✓ Password reset email sent");
    setAuthLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    // Keep local data — user doesn't lose anything on logout
  }

  // ── THEME & COMPUTED ─────────────────────────────────────────────────────

  const C   = d.darkMode ? DARK : LIGHT;
  const sym = SYM[d.currency] || "€";
  const isPro = isProActive(d.isPro, d.proExpiry);

  const sum  = (arr) => arr.reduce((t,x) => t + safeNum(x.amount||x.value), 0);

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

  // ── PRO GATE ──────────────────────────────────────────────────────────────
  const requirePro = (featureName) => {
    if (isPro) return true;
    setPaywallFeature(featureName);
    setShowPaywall(true);
    return false;
  };

  // ── DATA MUTATIONS ────────────────────────────────────────────────────────
  const update = (fn) => setD(prev => { const next = deepClone(prev); fn(next); return next; });

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

  // ── REFERRAL ──────────────────────────────────────────────────────────────
  const referralLink = `${window.location.origin}?ref=${d.referral.code}`;
  const copyReferral = () => {
    copyToClipboard(referralLink).then(() => {
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2500);
    });
  };

  // ── STYLE SHORTCUTS ───────────────────────────────────────────────────────
  const card = {background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:18, marginBottom:12};
  const btn  = {border:"none", cursor:"pointer", fontFamily:"'IBM Plex Mono',monospace", fontWeight:600, transition:"all 0.15s"};
  const inp  = {background:C.inputBg, border:`1px solid ${C.border}`, color:C.text, padding:"10px 13px", borderRadius:9, fontFamily:"'IBM Plex Mono',monospace", fontSize:13, width:"100%", outline:"none"};
  const lbl  = {fontSize:10, color:C.muted, letterSpacing:2, display:"block", marginBottom:5, fontFamily:"'IBM Plex Mono',monospace"};
  const mono = {fontFamily:"'IBM Plex Mono',monospace"};

  // ── SUB-COMPONENTS ────────────────────────────────────────────────────────

  const Empty = ({onAdd, label}) => (
    <div style={{textAlign:"center", padding:"20px 0"}}>
      <div style={{fontSize:12, color:C.faint, marginBottom:10, ...mono}}>— nothing yet —</div>
      <button onClick={onAdd} style={{...btn, background:`${C.accent}18`, color:C.accent, fontSize:12, padding:"7px 16px", borderRadius:8}}>
        + Add {label}
      </button>
    </div>
  );

  const Row = ({label, amount, color, currency:rc, onEdit}) => (
    <div onClick={onEdit} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:`1px solid ${C.border}`, cursor:onEdit?"pointer":"default"}}>
      <span style={{fontSize:13, color:C.text}}>{label}</span>
      <div style={{display:"flex", gap:8, alignItems:"center"}}>
        <span style={{fontSize:13, ...mono, color:color||C.text, fontWeight:600}}>{SYM[rc]||sym}{safeNum(amount).toLocaleString()}</span>
        {onEdit && <span style={{fontSize:10, color:C.faint}}>✎</span>}
      </div>
    </div>
  );

  const SectionCard = ({title, items, type, section, color}) => (
    <div style={card}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
        <span style={{fontSize:12, fontWeight:700, color:color||C.muted, letterSpacing:1, ...mono}}>{title}</span>
        <button onClick={()=>openAdd(type,section)} style={{...btn, background:`${color}18`, color:color||C.accent, fontSize:11, padding:"4px 10px", borderRadius:6}}>+ ADD</button>
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
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
        <div>
          <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:6}}>
            <span style={{fontSize:18}}>{icon}</span>
            <span style={{fontSize:14, fontWeight:700, color:C.text}}>{feature}</span>
            <span style={{fontSize:10, ...mono, background:`${C.purple}22`, color:C.purple, padding:"2px 8px", borderRadius:20}}>PRO</span>
          </div>
          <div style={{fontSize:12, color:C.muted, lineHeight:1.6}}>{description}</div>
        </div>
        <span style={{fontSize:18, color:C.purple, flexShrink:0}}>🔒</span>
      </div>
      <button style={{...btn, marginTop:12, background:`${C.purple}18`, color:C.purple, border:`1px solid ${C.purple}33`, padding:"7px 14px", borderRadius:8, fontSize:12}}>
        Unlock with Pro →
      </button>
    </div>
  );

  // ── AUTH SCREEN ───────────────────────────────────────────────────────────
  const AuthModal = () => (
    <div style={{position:"fixed", inset:0, background:C.overlay, backdropFilter:"blur(12px)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={()=>setShowAuth(false)}>
      <div style={{background:C.surface, borderRadius:20, padding:28, width:"100%", maxWidth:400, border:`1px solid ${C.border}`, position:"relative"}} onClick={e=>e.stopPropagation()}>

        {/* Close button */}
        <button onClick={()=>setShowAuth(false)} style={{...btn, position:"absolute", top:16, right:16, background:C.surface2, border:`1px solid ${C.border}`, color:C.muted, width:30, height:30, borderRadius:8, fontSize:14}}>✕</button>

        {/* Header */}
        <div style={{marginBottom:24}}>
          <div style={{fontSize:11, color:C.muted, ...mono, letterSpacing:2, marginBottom:6}}>APINFLOW</div>
          <div style={{fontSize:20, fontWeight:700, color:C.text}}>
            {authView==="login"  ? "Welcome back"    :
             authView==="signup" ? "Create account"  : "Reset password"}
          </div>
          <div style={{fontSize:12, color:C.muted, marginTop:4}}>
            {authView==="login"  ? "Your data syncs across all your devices" :
             authView==="signup" ? "Free account — your data follows you everywhere" :
             "We'll send you a reset link"}
          </div>
        </div>

        {/* Google login button */}
        {authView !== "forgot" && (
          <button onClick={handleGoogle} disabled={authLoading}
            style={{...btn, width:"100%", background:C.surface2, border:`1px solid ${C.border}`, color:C.text, padding:"11px 16px", borderRadius:10, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:16, opacity:authLoading?0.6:1}}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/><path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/></svg>
            Continue with Google
          </button>
        )}

        {/* Divider */}
        {authView !== "forgot" && (
          <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:16}}>
            <div style={{flex:1, height:1, background:C.border}} />
            <span style={{fontSize:11, color:C.faint, ...mono}}>OR</span>
            <div style={{flex:1, height:1, background:C.border}} />
          </div>
        )}

        {/* Form fields */}
        <div style={{display:"grid", gap:10}}>
          {authView==="signup" && (
            <div>
              <label style={lbl}>YOUR NAME</label>
              <input maxLength={60} placeholder="Your name" value={authForm.name}
                onChange={e=>setAuthForm(f=>({...f,name:e.target.value}))} style={inp} />
            </div>
          )}
          <div>
            <label style={lbl}>EMAIL</label>
            <input type="email" maxLength={200} placeholder="your@email.com" value={authForm.email}
              onChange={e=>setAuthForm(f=>({...f,email:e.target.value}))}
              onKeyDown={e=>{ if(e.key==="Enter") authView==="login"?handleLogin():authView==="signup"?handleSignUp():handleForgotPassword(); }}
              style={inp} />
          </div>
          {authView !== "forgot" && (
            <div>
              <label style={lbl}>PASSWORD</label>
              <input type="password" maxLength={200} placeholder={authView==="signup"?"Minimum 8 characters":"Your password"} value={authForm.password}
                onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))}
                onKeyDown={e=>{ if(e.key==="Enter") authView==="login"?handleLogin():handleSignUp(); }}
                style={inp} />
            </div>
          )}

          {/* Error / success message */}
          {authError && (
            <div style={{fontSize:12, color:authError.startsWith("✓")?C.green:C.red, padding:"8px 12px", background:authError.startsWith("✓")?`${C.green}10`:`${C.red}10`, borderRadius:8, border:`1px solid ${authError.startsWith("✓")?C.green+"33":C.red+"33"}`}}>
              {authError}
            </div>
          )}

          {/* Primary action button */}
          <button
            onClick={authView==="login"?handleLogin:authView==="signup"?handleSignUp:handleForgotPassword}
            disabled={authLoading}
            style={{...btn, background:`${C.accent}22`, color:C.accent, border:`1px solid ${C.accent}44`, padding:13, borderRadius:10, fontSize:14, width:"100%", opacity:authLoading?0.6:1}}>
            {authLoading ? "Please wait..." :
             authView==="login"  ? "Log in" :
             authView==="signup" ? "Create account" : "Send reset link"}
          </button>
        </div>

        {/* Switch views */}
        <div style={{marginTop:16, textAlign:"center", fontSize:12, color:C.muted}}>
          {authView==="login" && <>
            <span style={{cursor:"pointer", color:C.accent}} onClick={()=>{setAuthView("forgot");setAuthError("");}}>Forgot password?</span>
            <span style={{margin:"0 8px"}}>·</span>
            <span style={{cursor:"pointer", color:C.accent}} onClick={()=>{setAuthView("signup");setAuthError("");}}>Create account</span>
          </>}
          {authView==="signup" && <>
            Already have an account?{" "}
            <span style={{cursor:"pointer", color:C.accent}} onClick={()=>{setAuthView("login");setAuthError("");}}>Log in</span>
          </>}
          {authView==="forgot" && <>
            <span style={{cursor:"pointer", color:C.accent}} onClick={()=>{setAuthView("login");setAuthError("");}}>← Back to login</span>
          </>}
        </div>

        {/* Privacy note */}
        <div style={{marginTop:14, fontSize:11, color:C.faint, textAlign:"center", lineHeight:1.6}}>
          No ads. No data selling. Your finances stay private.
        </div>
      </div>
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
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp 0.25s ease forwards;}
        @keyframes barGrow{from{width:0}to{width:var(--w)}}
        .bar{animation:barGrow 1s cubic-bezier(.4,0,.2,1) forwards;}
        input,select{color:${C.text}!important;}
        input:focus,select:focus{border-color:${C.accent}!important;outline:none;}
        .app-shell{display:flex;flex-direction:column;max-width:500px;margin:0 auto;width:100%;}
        @media(min-width:640px){.app-shell{max-width:620px;}.content-pad{padding:20px 24px 100px;}.bottom-nav{max-width:620px;}}
        @media(min-width:1024px){.app-shell{max-width:520px;min-height:100vh;border-left:1px solid ${C.border};border-right:1px solid ${C.border};}.bottom-nav{max-width:520px;}}
        .stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
        .annual-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}
      `}</style>

      {/* HEADER */}
      <div className="app-shell" style={{position:"sticky", top:0, zIndex:40}}>
        <div style={{padding:"14px 20px 12px", background:C.bg, borderBottom:`1px solid ${C.border}`, backdropFilter:"blur(20px)"}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <div>
              <div style={{fontSize:11, color:C.muted, ...mono, letterSpacing:2}}>APINFLOW</div>
              <div style={{fontSize:16, fontWeight:700, marginTop:1}}>
                {d.profile.name || (user ? user.email?.split("@")[0] : "Welcome")}
                {isPro && <span style={{fontSize:10, ...mono, marginLeft:8, background:`${C.purple}22`, color:C.purple, padding:"2px 7px", borderRadius:10}}>PRO</span>}
                {syncing && <span style={{fontSize:10, color:C.muted, marginLeft:8}}>syncing...</span>}
              </div>
              {d.profile.occupation && <div style={{fontSize:11, color:C.muted, marginTop:1}}>{d.profile.occupation}</div>}
            </div>
            <div style={{display:"flex", alignItems:"center", gap:8}}>
              {/* Theme toggle */}
              <button onClick={()=>update(n=>n.darkMode=!n.darkMode)}
                style={{...btn, background:C.surface2, border:`1px solid ${C.border}`, color:C.muted, width:34, height:34, borderRadius:9, fontSize:15, display:"flex", alignItems:"center", justifyContent:"center"}}>
                {d.darkMode?"☀":"◑"}
              </button>
              {/* Login / account button */}
              <button onClick={()=>{ if(user) handleLogout(); else { setShowAuth(true); setAuthView("login"); setAuthError(""); } }}
                style={{...btn, background:user?`${C.green}18`:`${C.blue}18`, color:user?C.green:C.blue, border:`1px solid ${user?C.green+"33":C.blue+"33"}`, padding:"5px 11px", borderRadius:8, fontSize:11}}>
                {user ? "Log out" : "Log in"}
              </button>
              {/* Rat race indicator */}
              <div style={{fontSize:10, ...mono, padding:"3px 8px", borderRadius:4, background:inRatRace?`${C.red}18`:`${C.green}18`, color:inRatRace?C.red:C.green, border:`1px solid ${inRatRace?C.red+"33":C.green+"33"}`}}>
                {inRatRace?"● RAT RACE":"● FREE"}
              </div>
            </div>
          </div>
          {/* Sync banner for logged-out users */}
          {!user && (totalIncome>0||totalExp>0) && (
            <div onClick={()=>{setShowAuth(true);setAuthView("signup");setAuthError("");}}
              style={{marginTop:10, padding:"8px 12px", background:`${C.blue}10`, border:`1px solid ${C.blue}22`, borderRadius:8, fontSize:12, color:C.blue, cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <span>Create a free account to sync across devices</span>
              <span style={{...mono, fontSize:11}}>→</span>
            </div>
          )}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{flex:1}}>
        <div className="app-shell" style={{margin:"0 auto"}}>
          <div className="content-pad" style={{padding:"16px 16px 90px"}}>

            {/* ══ FREEDOM ══ */}
            {tab==="freedom" && (
              <div className="fu">
                {/* Freedom index */}
                <div style={{...card, background:d.darkMode?`linear-gradient(135deg,${C.surface},#0d1a12)`:`linear-gradient(135deg,${C.surface},#f0faf4)`, border:`1px solid ${stage.color}22`, marginBottom:16}}>
                  <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:16}}>FINANCIAL FREEDOM INDEX</div>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:10}}>
                    <div>
                      <div style={{fontSize:22, fontWeight:700, color:stage.color, ...mono}}>{freedomPct}%</div>
                      <div style={{fontSize:14, fontWeight:600, color:C.text, marginTop:2}}>{stage.label}</div>
                      <div style={{fontSize:11, color:C.muted, marginTop:2, maxWidth:200, lineHeight:1.5}}>{stage.desc}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:10, color:C.muted, ...mono, letterSpacing:1}}>PASSIVE + SIDE</div>
                      <div style={{fontSize:20, fontWeight:700, ...mono, color:stage.color}}>{sym}{freedomIncome.toLocaleString()}<span style={{fontSize:11, color:C.muted}}>/mo</span></div>
                      <div style={{fontSize:10, color:C.muted, marginTop:2}}>Goal: {sym}{d.freedomGoal||0}/mo</div>
                    </div>
                  </div>
                  <div style={{height:6, background:C.border, borderRadius:3, overflow:"hidden"}}>
                    <div className="bar" style={{"--w":`${freedomPct}%`, width:`${freedomPct}%`, height:"100%", borderRadius:3, background:`linear-gradient(90deg,${stage.color}88,${stage.color})`}} />
                  </div>
                  <div style={{display:"flex", justifyContent:"space-between", marginTop:5}}>
                    <span style={{fontSize:10, color:C.faint, ...mono}}>0 — RAT RACE</span>
                    <span style={{fontSize:10, color:C.faint, ...mono}}>100% — FREE</span>
                  </div>
                </div>

                {/* Empty state */}
                {totalIncome===0 && totalExp===0 ? (
                  <div style={{...card, textAlign:"center", padding:28}}>
                    <div style={{fontSize:28, marginBottom:12}}>◎</div>
                    <div style={{fontSize:15, fontWeight:600, color:C.text, marginBottom:8}}>Start tracking your finances</div>
                    <div style={{fontSize:13, color:C.muted, lineHeight:1.8, marginBottom:20}}>Add your income, expenses, assets and liabilities to see your progress.</div>
                    <button onClick={()=>setTab("income")} style={{...btn, background:`${C.accent}18`, color:C.accent, border:`1px solid ${C.accent}33`, padding:"10px 24px", borderRadius:10, fontSize:13}}>
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
                        <div key={i} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:`${r.big?"14px":"10px"} 18px`, borderTop:r.divider?`1px solid ${C.border}`:"none", background:r.big?(monthlyCashflow>=0?`${C.green}08`:`${C.red}08`):"transparent"}}>
                          <div>
                            <div style={{fontSize:r.big?14:13, fontWeight:r.bold?700:400, color:C.text}}>{r.label}</div>
                            {r.sub && <div style={{fontSize:10, color:C.faint, ...mono}}>{r.sub}</div>}
                          </div>
                          <div style={{fontSize:r.big?16:13, fontWeight:r.bold?700:500, ...mono, color:r.color}}>
                            {r.value>=0?"":"-"}{sym}{Math.abs(r.value).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:10, marginTop:20}}>BALANCE SHEET</div>
                    <div className="stat-grid" style={{marginBottom:12}}>
                      {[{label:"Assets",value:totalAssets,color:C.green},{label:"Liabilities",value:totalLiabilities,color:C.red}].map(s=>(
                        <div key={s.label} style={{...card, marginBottom:0, textAlign:"center", padding:14}}>
                          <div style={{fontSize:10, color:C.muted, ...mono, letterSpacing:1, marginBottom:6}}>{s.label.toUpperCase()}</div>
                          <div style={{fontSize:20, fontWeight:700, ...mono, color:s.color}}>{sym}{s.value.toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{...card, display:"flex", justifyContent:"space-between", alignItems:"center", background:netWorth>=0?`${C.green}08`:`${C.red}08`, border:`1px solid ${netWorth>=0?C.green+"22":C.red+"22"}`}}>
                      <div>
                        <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono}}>NET WORTH</div>
                        <div style={{fontSize:11, color:C.faint, marginTop:2}}>Buy assets. Avoid liabilities.</div>
                      </div>
                      <div style={{fontSize:24, fontWeight:700, ...mono, color:netWorth>=0?C.green:C.red}}>
                        {netWorth>=0?"":"-"}{sym}{Math.abs(netWorth).toLocaleString()}
                      </div>
                    </div>
                  </>
                )}

                {/* Freedom goal */}
                <div style={{...card, marginTop:4}}>
                  <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:10}}>FREEDOM TARGET</div>
                  <div style={{fontSize:12, color:C.muted, marginBottom:8}}>Monthly passive income needed to be free</div>
                  <input type="number" min="0" max="9999999" placeholder="Set your goal..." value={d.freedomGoal||""}
                    onChange={e=>update(n=>n.freedomGoal=safeNum(e.target.value))}
                    style={{...inp, fontSize:15, fontWeight:700, color:C.green}} />
                  {d.freedomGoal>0 && freedomIncome<d.freedomGoal && (
                    <div style={{fontSize:11, color:C.muted, ...mono, marginTop:8}}>{sym}{Math.max(0,d.freedomGoal-freedomIncome).toLocaleString()} still to go</div>
                  )}
                </div>

                {/* Pro teaser */}
                {!isPro && (
                  <div style={{...card, border:`1px solid ${C.purple}33`, background:`${C.purple}06`, cursor:"pointer"}} onClick={()=>setShowPaywall(true)}>
                    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:13, fontWeight:700, color:C.text, marginBottom:4}}>✦ Upgrade to Pro</div>
                        <div style={{fontSize:12, color:C.muted}}>AI assistant · Asset tracking · Spending charts</div>
                      </div>
                      <div style={{fontSize:16, fontWeight:800, ...mono, color:C.purple}}>€3.99<span style={{fontSize:11}}>/mo</span></div>
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
                    <div style={{fontSize:13, color:C.muted, lineHeight:1.8}}>
                      Passive income must exceed total expenses.<br/>
                      Now: <span style={{color:C.green, fontWeight:700}}>{sym}{freedomIncome}/mo</span> vs <span style={{color:C.red, fontWeight:700}}>{sym}{totalExp}/mo</span>
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
                        <div style={{fontSize:11, color:C.muted, marginBottom:6}}>
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
                    <button onClick={()=>openAdd("asset","assets")} style={{...btn, background:`${C.green}18`, color:C.green, fontSize:11, padding:"4px 10px", borderRadius:6}}>+ ADD</button>
                  </div>
                  {d.assets.length===0 ? <Empty onAdd={()=>openAdd("asset","assets")} label="asset" />
                    : d.assets.map(a=>(
                      <div key={a.id} onClick={()=>openEdit("asset","assets",a)} style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"9px 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer"}}>
                        <div>
                          <div style={{fontSize:13, color:C.text}}>{a.label}</div>
                          <div style={{fontSize:10, color:C.faint, ...mono, marginTop:2}}>{a.type}{a.note?` · ${a.note}`:""}</div>
                        </div>
                        <div style={{display:"flex", gap:6, alignItems:"center"}}>
                          <span style={{fontSize:13, ...mono, color:C.green, fontWeight:600}}>{SYM[a.currency]||sym}{safeNum(a.value).toLocaleString()}</span>
                          <span style={{fontSize:10, color:C.faint}}>✎</span>
                        </div>
                      </div>
                    ))
                  }
                  {d.assets.length>0 && <div style={{display:"flex", justifyContent:"flex-end", marginTop:10, paddingTop:8, borderTop:`1px solid ${C.border}`}}><span style={{fontSize:13, ...mono, color:C.green, fontWeight:700}}>TOTAL {sym}{totalAssets.toLocaleString()}</span></div>}
                </div>

                <div style={card}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
                    <span style={{fontSize:12, fontWeight:700, color:C.red, letterSpacing:1, ...mono}}>LIABILITIES</span>
                    <button onClick={()=>openAdd("liability","liabilities")} style={{...btn, background:`${C.red}18`, color:C.red, fontSize:11, padding:"4px 10px", borderRadius:6}}>+ ADD</button>
                  </div>
                  {d.liabilities.length===0 ? <Empty onAdd={()=>openAdd("liability","liabilities")} label="liability" />
                    : d.liabilities.map(l=>(
                      <div key={l.id} onClick={()=>openEdit("liability","liabilities",l)} style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", padding:"9px 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer"}}>
                        <div>
                          <div style={{fontSize:13, color:C.text}}>{l.label}</div>
                          {l.note && <div style={{fontSize:10, color:C.faint, ...mono, marginTop:2}}>{l.note}</div>}
                        </div>
                        <div style={{display:"flex", gap:6, alignItems:"center"}}>
                          <span style={{fontSize:13, ...mono, color:C.red, fontWeight:600}}>{SYM[l.currency]||sym}{safeNum(l.amount).toLocaleString()}</span>
                          <span style={{fontSize:10, color:C.faint}}>✎</span>
                        </div>
                      </div>
                    ))
                  }
                  {d.liabilities.length>0 && <div style={{display:"flex", justifyContent:"flex-end", marginTop:10, paddingTop:8, borderTop:`1px solid ${C.border}`}}><span style={{fontSize:13, ...mono, color:C.red, fontWeight:700}}>TOTAL {sym}{totalLiabilities.toLocaleString()}</span></div>}
                </div>

                <div style={{...card, background:netWorth>=0?`${C.green}08`:`${C.red}08`, border:`1px solid ${netWorth>=0?C.green+"22":C.red+"22"}`}}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono}}>NET WORTH</div>
                      <div style={{fontSize:11, color:C.faint, marginTop:2}}>Buy assets. Avoid liabilities.</div>
                    </div>
                    <div style={{fontSize:26, fontWeight:700, ...mono, color:netWorth>=0?C.green:C.red}}>
                      {netWorth>=0?"":"-"}{sym}{Math.abs(netWorth).toLocaleString()}
                    </div>
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
                    <div style={{fontSize:13, color:C.muted, lineHeight:2}}>Add income and expenses first.<br/><span style={{fontSize:12, color:C.faint}}>Cashflow will appear here.</span></div>
                  </div>
                ) : (
                  <>
                    <div style={{...card, marginBottom:16}}>
                      <div style={{fontSize:11, color:C.muted, ...mono, marginBottom:14}}>WHERE YOUR MONEY FLOWS</div>
                      {[
                        {label:"Active",      value:activeIncome,  total:totalIncome, color:C.blue},
                        {label:"Side Hustle", value:sideIncome,    total:totalIncome, color:C.yellow},
                        {label:"Passive",     value:passiveIncome, total:totalIncome, color:C.green},
                      ].map(bar=>(
                        <div key={bar.label} style={{marginBottom:10}}>
                          <div style={{display:"flex", justifyContent:"space-between", marginBottom:4}}>
                            <span style={{fontSize:12, color:C.muted}}>{bar.label}</span>
                            <span style={{fontSize:12, ...mono, color:bar.color}}>{sym}{bar.value.toLocaleString()}</span>
                          </div>
                          <div style={{height:5, background:C.border, borderRadius:3, overflow:"hidden"}}>
                            <div style={{width:`${totalIncome>0?Math.round((bar.value/totalIncome)*100):0}%`, height:"100%", background:bar.color, borderRadius:3, transition:"width 0.7s"}} />
                          </div>
                        </div>
                      ))}
                      <div style={{height:1, background:C.border, margin:"14px 0"}} />
                      {[
                        {label:"Fixed",    value:fixedExp, color:C.red},
                        {label:"Variable", value:varExp,   color:"#FB923C"},
                      ].map(bar=>(
                        <div key={bar.label} style={{marginBottom:10}}>
                          <div style={{display:"flex", justifyContent:"space-between", marginBottom:4}}>
                            <span style={{fontSize:12, color:C.muted}}>{bar.label}</span>
                            <span style={{fontSize:12, ...mono, color:bar.color}}>{sym}{bar.value.toLocaleString()}</span>
                          </div>
                          <div style={{height:5, background:C.border, borderRadius:3, overflow:"hidden"}}>
                            <div style={{width:`${totalExp>0?Math.round((bar.value/totalExp)*100):0}%`, height:"100%", background:bar.color, borderRadius:3, transition:"width 0.7s"}} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{...card, textAlign:"center", background:monthlyCashflow>=0?`${C.green}08`:`${C.red}08`, border:`1px solid ${monthlyCashflow>=0?C.green+"22":C.red+"22"}`}}>
                      <div style={{fontSize:10, color:C.muted, letterSpacing:2, ...mono, marginBottom:8}}>MONTHLY CASHFLOW</div>
                      <div style={{fontSize:42, fontWeight:700, ...mono, color:monthlyCashflow>=0?C.green:C.red, letterSpacing:"-1px"}}>
                        {monthlyCashflow>=0?"+":""}{sym}{monthlyCashflow.toLocaleString()}
                      </div>
                      <div style={{fontSize:12, color:C.muted, marginTop:6}}>
                        {monthlyCashflow>=0?`${sym}${monthlyCashflow.toLocaleString()} to invest or save`:`Spending ${sym}${Math.abs(monthlyCashflow).toLocaleString()} more than you earn`}
                      </div>
                    </div>

                    <div className="annual-grid" style={{marginTop:10}}>
                      {[
                        {label:"Annual Income",   value:totalIncome*12,     color:C.green},
                        {label:"Annual Expenses", value:totalExp*12,        color:C.red},
                        {label:"Annual Cashflow", value:monthlyCashflow*12, color:monthlyCashflow>=0?C.green:C.red},
                      ].map(s=>(
                        <div key={s.label} style={{...card, marginBottom:0, textAlign:"center", padding:12}}>
                          <div style={{fontSize:9, color:C.muted, ...mono, letterSpacing:1, marginBottom:5}}>{s.label}</div>
                          <div style={{fontSize:14, fontWeight:700, ...mono, color:s.color}}>{sym}{(s.value/1000).toFixed(1)}k</div>
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
                        <div style={{fontSize:13, color:C.text, fontWeight:600}}>{user.email}</div>
                        <div style={{fontSize:11, color:C.green, marginTop:3}}>✓ Data synced across devices</div>
                      </div>
                      <button onClick={handleLogout} style={{...btn, background:`${C.red}15`, color:C.red, border:`1px solid ${C.red}33`, padding:"7px 14px", borderRadius:8, fontSize:12}}>
                        Log out
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{fontSize:13, color:C.muted, marginBottom:12, lineHeight:1.6}}>Create a free account to sync your data across all your devices. No payment needed.</div>
                      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
                        <button onClick={()=>{setShowAuth(true);setAuthView("login");setAuthError("");}} style={{...btn, background:`${C.blue}18`, color:C.blue, border:`1px solid ${C.blue}33`, padding:"9px 12px", borderRadius:9, fontSize:12}}>
                          Log in
                        </button>
                        <button onClick={()=>{setShowAuth(true);setAuthView("signup");setAuthError("");}} style={{...btn, background:`${C.accent}18`, color:C.accent, border:`1px solid ${C.accent}33`, padding:"9px 12px", borderRadius:9, fontSize:12}}>
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

                {/* Pro subscription */}
                {!isPro ? (
                  <div style={{...card, border:`1px solid ${C.purple}33`, background:`${C.purple}06`}}>
                    <div style={{fontSize:12, fontWeight:700, color:C.purple, letterSpacing:1, ...mono, marginBottom:14}}>APINFLOW PRO</div>
                    <div style={{display:"grid", gap:8, marginBottom:16}}>
                      {["AI financial assistant (coming soon)","Live asset & stock tracking","Spending charts & trends","Priority support"].map(f=>(
                        <div key={f} style={{display:"flex", gap:8, alignItems:"center"}}>
                          <span style={{color:C.purple}}>✓</span>
                          <span style={{fontSize:13, color:C.text}}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
                      <a href={`${STRIPE.monthly}?client_reference_id=${d.referral.code}`} style={{textDecoration:"none"}}>
                        <button style={{...btn, width:"100%", background:`${C.purple}22`, color:C.purple, border:`1px solid ${C.purple}44`, padding:"12px 8px", borderRadius:10, lineHeight:1.4}}>
                          <div style={{fontSize:16, fontWeight:800}}>€3.99</div>
                          <div style={{fontSize:11, opacity:0.7}}>per month</div>
                        </button>
                      </a>
                      <a href={`${STRIPE.yearly}?client_reference_id=${d.referral.code}`} style={{textDecoration:"none"}}>
                        <button style={{...btn, width:"100%", background:C.purple, color:"#fff", border:"none", padding:"12px 8px", borderRadius:10, lineHeight:1.4, position:"relative"}}>
                          <div style={{fontSize:10, ...mono, position:"absolute", top:-10, right:8, background:C.yellow, color:"#000", padding:"3px 8px", borderRadius:10}}>SAVE 37%</div>
                          <div style={{fontSize:16, fontWeight:800}}>€29.99</div>
                          <div style={{fontSize:11, opacity:0.8}}>per year</div>
                        </button>
                      </a>
                    </div>
                    <div style={{fontSize:11, color:C.faint, textAlign:"center", marginTop:10, ...mono}}>Secure payment via Stripe · No ads · Cancel anytime</div>
                  </div>
                ) : (
                  <div style={{...card, border:`1px solid ${C.purple}33`, background:`${C.purple}06`}}>
                    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:13, fontWeight:700, color:C.purple}}>✦ Pro Active</div>
                        {d.proExpiry && <div style={{fontSize:11, color:C.muted, marginTop:3}}>Renews {new Date(d.proExpiry).toLocaleDateString()}</div>}
                      </div>
                      <span style={{fontSize:10, ...mono, background:`${C.purple}22`, color:C.purple, padding:"4px 10px", borderRadius:20}}>ACTIVE</span>
                    </div>
                  </div>
                )}

                {/* Referral */}
                <div style={card}>
                  <div style={{fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1, ...mono, marginBottom:6}}>REFER A FRIEND</div>
                  <div style={{fontSize:12, color:C.muted, marginBottom:14, lineHeight:1.6}}>Share your link. When a friend subscribes you both get <strong style={{color:C.text}}>1 month Pro free</strong>.</div>
                  <div style={{background:C.inputBg, border:`1px solid ${C.border}`, borderRadius:9, padding:"10px 13px", marginBottom:10}}>
                    <div style={{fontSize:10, color:C.faint, ...mono, marginBottom:3}}>YOUR REFERRAL LINK</div>
                    <div style={{fontSize:12, color:C.text, wordBreak:"break-all"}}>{referralLink}</div>
                  </div>
                  <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
                    <button onClick={copyReferral} style={{...btn, background:referralCopied?`${C.green}22`:`${C.accent}18`, color:referralCopied?C.green:C.accent, border:`1px solid ${referralCopied?C.green:C.accent}33`, padding:"9px 12px", borderRadius:9, fontSize:12}}>
                      {referralCopied?"✓ Copied!":"Copy link"}
                    </button>
                    <button onClick={()=>{ if(navigator.share) navigator.share({title:"Apinflow",text:"Track your path to financial freedom",url:referralLink}); else copyReferral(); }}
                      style={{...btn, background:`${C.blue}18`, color:C.blue, border:`1px solid ${C.blue}33`, padding:"9px 12px", borderRadius:9, fontSize:12}}>
                      Share
                    </button>
                  </div>
                </div>

                {/* Appearance */}
                <div style={card}>
                  <div style={{fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1, ...mono, marginBottom:14}}>APPEARANCE</div>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:13, color:C.text, fontWeight:600}}>{d.darkMode?"Dark mode":"Light mode"}</div>
                      <div style={{fontSize:11, color:C.muted, marginTop:2}}>More themes coming for Pro</div>
                    </div>
                    <button onClick={()=>update(n=>n.darkMode=!n.darkMode)}
                      style={{...btn, background:d.darkMode?C.green:`${C.green}22`, color:d.darkMode?"#000":C.green, border:`1px solid ${C.green}44`, padding:"8px 16px", borderRadius:10, fontSize:13}}>
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
                  <div style={{fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1, ...mono, marginBottom:6}}>FREEDOM GOAL</div>
                  <div style={{fontSize:12, color:C.muted, marginBottom:12}}>Monthly passive income needed to be free.</div>
                  <input type="number" min="0" max="9999999" placeholder="0" value={d.freedomGoal||""}
                    onChange={e=>update(n=>n.freedomGoal=safeNum(e.target.value))}
                    style={{...inp, fontSize:16, fontWeight:700, color:C.green}} />
                </div>

                {/* Danger zone */}
                <div style={{...card, border:`1px solid ${C.red}33`, background:`${C.red}05`}}>
                  <div style={{fontSize:12, fontWeight:700, color:C.red, letterSpacing:1, ...mono, marginBottom:10}}>DANGER ZONE</div>
                  <div style={{fontSize:12, color:C.muted, marginBottom:14}}>Reset everything to zero. Cannot be undone.</div>
                  <button onClick={()=>{ if(window.confirm("Reset all data? This cannot be undone.")){ localStorage.removeItem(STORAGE_KEY); setD(makeInit()); setTab("freedom"); } }}
                    style={{...btn, background:`${C.red}15`, color:C.red, border:`1px solid ${C.red}33`, padding:"10px 20px", borderRadius:9, fontSize:13, width:"100%"}}>
                    Reset all data
                  </button>
                </div>

                <div style={{textAlign:"center", padding:"16px 0", fontSize:11, color:C.faint, ...mono}}>
                  APINFLOW v1.3 · {user?"Data synced to cloud":"Data stored locally on your device"}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* BOTTOM NAV */}
      <div className="bottom-nav" style={{position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", background:C.navBg, backdropFilter:"blur(20px)", borderTop:`1px solid ${C.border}`, padding:"8px 4px 10px", display:"flex", zIndex:40}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1, background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"4px 0"}}>
            <span style={{fontSize:16, opacity:tab===t.id?1:0.3, transition:"opacity 0.15s"}}>{t.icon}</span>
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
              {modal.item && <button onClick={deleteItem} style={{...btn, background:`${C.red}15`, color:C.red, fontSize:11, padding:"5px 10px", borderRadius:6}}>DELETE</button>}
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
              <button onClick={saveItem} style={{...btn, background:`${C.green}18`, color:C.green, border:`1px solid ${C.green}33`, padding:14, borderRadius:10, fontSize:14, width:"100%"}}>
                {modal.item?"SAVE CHANGES":"ADD"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAYWALL MODAL */}
      {showPaywall && (
        <div style={{position:"fixed", inset:0, background:C.overlay, backdropFilter:"blur(12px)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center"}} onClick={()=>setShowPaywall(false)}>
          <div style={{background:d.darkMode?"#13131A":C.surface, borderRadius:"24px 24px 0 0", padding:"28px 24px 40px", width:"100%", maxWidth:520, border:`1px solid ${C.border}`, position:"relative"}} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setShowPaywall(false)} style={{...btn, position:"absolute", top:16, right:16, background:C.surface2, border:`1px solid ${C.border}`, color:C.muted, width:30, height:30, borderRadius:8, fontSize:14}}>✕</button>
            <div style={{width:36, height:4, borderRadius:2, background:C.border, margin:"0 auto 24px"}} />
            <div style={{textAlign:"center", marginBottom:20}}>
              <div style={{fontSize:11, color:C.purple, ...mono, letterSpacing:2, marginBottom:8}}>APINFLOW PRO</div>
              {paywallFeature && <div style={{fontSize:13, color:C.muted, marginBottom:12}}>Unlock <strong style={{color:C.text}}>{paywallFeature}</strong> and more</div>}
              <div style={{display:"grid", gap:8, textAlign:"left", marginBottom:20}}>
                {["AI financial assistant (coming soon)","Live asset & stock tracking","Spending charts & trends","Priority support"].map(f=>(
                  <div key={f} style={{display:"flex", gap:10, alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.border}`}}>
                    <span style={{color:C.purple}}>✓</span>
                    <span style={{fontSize:14, color:C.text}}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
              <a href={`${STRIPE.monthly}?client_reference_id=${d.referral.code}`} style={{textDecoration:"none"}}>
                <button style={{...btn, width:"100%", background:`${C.purple}22`, color:C.purple, border:`1px solid ${C.purple}44`, padding:"14px 8px", borderRadius:12, lineHeight:1.5}}>
                  <div style={{fontSize:20, fontWeight:800}}>€3.99</div>
                  <div style={{fontSize:12, opacity:0.7}}>per month</div>
                </button>
              </a>
              <a href={`${STRIPE.yearly}?client_reference_id=${d.referral.code}`} style={{textDecoration:"none"}}>
                <button style={{...btn, width:"100%", background:C.purple, color:"#fff", border:"none", padding:"14px 8px", borderRadius:12, lineHeight:1.5, position:"relative"}}>
                  <div style={{fontSize:10, ...mono, position:"absolute", top:-10, right:8, background:C.yellow, color:"#000", padding:"3px 8px", borderRadius:10}}>SAVE 37%</div>
                  <div style={{fontSize:20, fontWeight:800}}>€29.99</div>
                  <div style={{fontSize:12, opacity:0.8}}>per year</div>
                </button>
              </a>
            </div>
            <div style={{fontSize:11, color:C.faint, textAlign:"center", ...mono}}>Secure payment via Stripe · No ads · Cancel anytime</div>
          </div>
        </div>
      )}

      {/* AUTH MODAL */}
      {showAuth && <AuthModal />}

    </div>
  );
}