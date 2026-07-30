"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import {
  Mail, ShieldCheck, ArrowRight, Eye, EyeOff, CheckCircle2,
  Activity, GitBranch, Cloud, Server, Zap, Lock, User
} from "lucide-react";

/* ─── Logo mark ─────────────────────────────────────────── */
const LogoMark = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="10" fill="url(#llg)" />
    {/* Hexagonal Ops Shield */}
    <path d="M20 7L31 13.5V26.5L20 33L9 26.5V13.5L20 7Z" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(255,255,255,0.06)"/>
    {/* AI Incident Resolution Waveform Pulse */}
    <path d="M12 20H16.5L18.5 15L21.5 25L23.5 18L25 20H28" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="20" cy="20" r="2" fill="white" />
    <defs>
      <linearGradient id="llg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#0ea5e9"/>
        <stop offset="0.5" stopColor="#6366f1"/>
        <stop offset="1" stopColor="#8b5cf6"/>
      </linearGradient>
    </defs>
  </svg>
);

/* ─── Shared input style ─────────────────────────────────── */
const inputCls = `w-full px-3.5 py-2.5 rounded-xl text-sm text-slate-200
  placeholder:text-slate-600 bg-[#0d1425] border border-white/[0.08]
  focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/25
  transition-all duration-150`;

/* ─── Register flow ─────────────────────────────────────── */
function RegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState("details");
  const [fullName, setFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [regRole, setRegRole] = useState("user");
  const [adminSecret, setAdminSecret] = useState("");
  const [showPw, setShowPw] = useState(false);

  const handleRequestOtp = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      await fetchApi("/request-otp", { method: "POST", body: JSON.stringify({ email: regEmail, full_name: fullName }) });
      setSuccess(`OTP sent to ${regEmail}`);
      setStep("otp");
    } catch (err) { setError(err.message || "Failed to send OTP."); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      await fetchApi("/register", { method: "POST", body: JSON.stringify({ email: regEmail, password: regPassword, full_name: fullName, otp_code: otpCode, role: regRole, admin_secret: adminSecret }) });
      const loginData = await fetchApi("/login", { method: "POST", body: JSON.stringify({ email: regEmail, password: regPassword }) });
      if (loginData.token) { localStorage.setItem("jwt_token", loginData.token); router.push("/"); }
    } catch (err) { setError(err.message || "Registration failed."); }
    finally { setLoading(false); }
  };

  return (
    <>
      {error   && <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm mb-4">{error}</div>}
      {success && <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm mb-4">{success}</div>}

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-6">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === "otp" ? "bg-emerald-500 text-white" : "bg-sky-500 text-white"}`}>
          {step === "otp" ? "✓" : "1"}
        </div>
        <div className={`flex-1 h-px transition-colors ${step === "otp" ? "bg-sky-500/50" : "bg-white/10"}`} />
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === "otp" ? "bg-sky-500 text-white" : "bg-white/10 text-slate-500"}`}>
          2
        </div>
      </div>

      {step === "details" && (
        <form onSubmit={handleRequestOtp} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Full Name</label>
            <input className={inputCls} placeholder="John Doe" value={fullName} onChange={e => setFullName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Work Email</label>
            <input className={inputCls} type="email" placeholder="admin@company.com" value={regEmail} onChange={e => setRegEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Account Role</label>
            <div className="relative">
              <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
              <select className={inputCls + " pl-9 appearance-none"} value={regRole} onChange={e => {setRegRole(e.target.value); setAdminSecret("");}} required>
                <option value="user">Standard User</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
          </div>
          
          {regRole === "admin" && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck size={12} className="text-amber-500" /> Admin Invite Code
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
                <input className={inputCls + " pl-9 border-amber-500/30 focus:border-amber-500/50 focus:ring-amber-500/25"} 
                  type="password" placeholder="Enter secure invite code" value={adminSecret} onChange={e => setAdminSecret(e.target.value)} required={regRole === "admin"} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Password</label>
            <div className="relative">
              <input className={inputCls + " pr-10"} type={showPw ? "text" : "password"} placeholder="Min. 8 characters" value={regPassword} onChange={e => setRegPassword(e.target.value)} required />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ boxShadow: "0 0 30px rgba(56,189,248,0.25)" }}>
            {loading ? "Sending..." : <><Mail size={15}/> Send Verification Code <ArrowRight size={15}/></>}
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleRegister} className="space-y-4">
          <p className="text-center text-sm text-slate-400">Enter the 6-digit code sent to <br/><span className="text-white font-semibold">{regEmail}</span></p>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Verification Code</label>
            <input className={inputCls + " text-center text-2xl font-mono tracking-[0.5em]"} placeholder="000000"
              value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g,"").slice(0,6))} maxLength={6} required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ boxShadow: "0 0 30px rgba(56,189,248,0.25)" }}>
            {loading ? "Creating Account..." : <><ShieldCheck size={15}/> Verify & Create Account</>}
          </button>
          <button type="button" onClick={() => { setStep("details"); setError(""); setSuccess(""); }}
            className="w-full text-slate-500 hover:text-slate-300 text-sm transition-colors text-center">
            ← Change email or resend OTP
          </button>
        </form>
      )}
    </>
  );
}

/* ─── Main Login Page ───────────────────────────────────── */
export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const data = await fetchApi("/login", { method: "POST", body: JSON.stringify({ email, password }) });
      if (data.token) { localStorage.setItem("jwt_token", data.token); router.push("/"); }
    } catch (err) { setError(err.message || "Invalid credentials."); }
    finally { setLoading(false); }
  };

  const features = [
    { icon: <Activity size={16}/>, text: "AI Root Cause Analysis" },
    { icon: <GitBranch size={16}/>, text: "GitHub Pipeline Intelligence" },
    { icon: <Cloud size={16}/>, text: "Azure & AWS Resource Intelligence" },
    { icon: <Zap size={16}/>, text: "Predictive Cost & Risk Insights" },
    { icon: <Server size={16}/>, text: "Architecture Diagram Generation" },
  ];

  return (
    <div className="flex min-h-screen" style={{ background: "#06091a" }}>

      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex w-[45%] flex-col justify-center p-16 relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0a1628 0%, #070d1c 100%)", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
        {/* Dot grid */}
        <div className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: "radial-gradient(rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        {/* Glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full blur-3xl pointer-events-none"
          style={{ background: "rgba(56,189,248,0.07)" }} />
        <div className="absolute bottom-1/4 right-0 w-56 h-56 rounded-full blur-3xl pointer-events-none"
          style={{ background: "rgba(99,102,241,0.06)" }} />
        {/* Top accent */}
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(56,189,248,0.4), transparent)" }} />

        <div className="relative z-10 max-w-sm">
          <div className="flex items-center gap-3 mb-10">
            <LogoMark size={42} />
            <div>
              <h1 className="font-black text-lg tracking-tight text-white leading-none">ResolveOps AI</h1>
              <p className="text-[10px] text-sky-400/70 uppercase tracking-[0.2em] font-semibold mt-0.5">Command Center</p>
            </div>
          </div>

          <h2 className="text-3xl font-black text-white leading-tight mb-3">
            Autonomous SRE<br/>
            <span style={{ background: "linear-gradient(135deg,#38bdf8,#818cf8)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
              Intelligence Platform
            </span>
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed mb-10">
            AI-powered incident resolution, pipeline diagnostics, and cloud intelligence — unified in one command center.
          </p>

          <div className="space-y-3.5">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg shrink-0" style={{ background: "rgba(56,189,248,0.1)", color: "#38bdf8" }}>
                  {f.icon}
                </div>
                <span className="text-sm text-slate-300 font-medium">{f.text}</span>
              </div>
            ))}
          </div>

          <div className="mt-12 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-slate-500 font-mono">All systems operational</span>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <LogoMark size={36} />
            <h1 className="font-black text-base text-white">ResolveOps AI</h1>
          </div>

          {/* Card */}
          <div className="rounded-2xl p-7" style={{
            background: "linear-gradient(180deg, #0d1424 0%, #0a1020 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.02) inset, 0 25px 60px rgba(0,0,0,0.5)"
          }}>
            {/* Top border glow */}
            <div className="absolute top-0 left-0 right-0 h-px rounded-t-2xl"
              style={{ background: "linear-gradient(90deg, transparent, rgba(56,189,248,0.3), transparent)" }} />

            {/* Tab switcher */}
            <div className="flex rounded-xl p-1 mb-7" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }}>
              {["login", "register"].map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                    tab === t
                      ? "bg-sky-500 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-300"
                  }`}>
                  {t}
                </button>
              ))}
            </div>

            {/* Login form */}
            {tab === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                {error && <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">{error}</div>}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Email</label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
                    <input className={inputCls + " pl-9"} type="email" placeholder="admin@company.com"
                      value={email} onChange={e => setEmail(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
                    <a href="#" className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold">Forgot?</a>
                  </div>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" />
                    <input className={inputCls + " pl-9 pr-10"} type={showPw ? "text" : "password"}
                      value={password} onChange={e => setPassword(e.target.value)} required />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                      {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-2.5 mt-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60"
                  style={{ background: loading ? "#0ea5e9" : "linear-gradient(90deg,#0ea5e9,#6366f1)", boxShadow: "0 0 30px rgba(56,189,248,0.2)" }}>
                  {loading ? "Authenticating..." : "Sign In to Command Center"}
                </button>
              </form>
            )}

            {/* Register form */}
            {tab === "register" && <RegisterForm />}
          </div>

          <p className="text-center text-[10px] text-slate-600 mt-5 font-mono">
            © {new Date().getFullYear()} ResolveOps AI — All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
}
