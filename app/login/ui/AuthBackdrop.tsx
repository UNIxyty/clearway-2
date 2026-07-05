import type { ReactNode } from "react";

// Animated auth backdrop from the Claude Design "Sign In" handoff: a navy
// gradient mesh with five drifting blur blobs, a slow conic light sweep, a
// faint dot grid and a centre-out vignette. Purely decorative — content
// renders in a centered column above it. Only transform/opacity animate, and
// everything decorative goes static under prefers-reduced-motion.
//
// Shared so the parked signup/account-flow redesigns can sit on the same
// backdrop later.

export default function AuthBackdrop({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        overflow: "hidden",
        background: "linear-gradient(140deg,#0a1330 0%,#132a63 52%,#0c1f4b 100%)",
        fontFamily: "'Public Sans', system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes cwfadeup{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        @keyframes cwshake{10%,90%{transform:translateX(-1px)}20%,80%{transform:translateX(2px)}30%,50%,70%{transform:translateX(-4px)}40%,60%{transform:translateX(4px)}}
        @keyframes cwdrift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(70px,50px) scale(1.18)}}
        @keyframes cwdrift2{0%,100%{transform:translate(0,0) scale(1.1)}50%{transform:translate(-60px,-40px) scale(1)}}
        @keyframes cwdrift3{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-50px,60px) scale(1.2)}}
        @keyframes cwdrift4{0%,100%{transform:translate(0,0) scale(1.15)}50%{transform:translate(55px,-55px) scale(1)}}
        @keyframes cwrotate{to{transform:rotate(360deg)}}
        @keyframes cwspin{to{transform:rotate(360deg)}}
        .cw-blob{position:absolute;border-radius:50%;filter:blur(46px);will-change:transform}
        .cw-b1{animation:cwdrift1 24s ease-in-out infinite}
        .cw-b2{animation:cwdrift2 30s ease-in-out infinite}
        .cw-b3{animation:cwdrift3 27s ease-in-out infinite}
        .cw-b4{animation:cwdrift4 33s ease-in-out infinite}
        .cw-b5{animation:cwdrift2 21s ease-in-out infinite}
        .cw-sweep{position:absolute;inset:-45%;background:conic-gradient(from 0deg,transparent 0deg,rgba(255,255,255,.07) 55deg,transparent 130deg,rgba(120,180,255,.06) 210deg,transparent 300deg);animation:cwrotate 50s linear infinite;will-change:transform}
        .cw-fadeup{animation:cwfadeup .3s ease both}
        .cw-shake{animation:cwshake .4s ease}
        .cw-auth-in{transition:border-color .14s ease, box-shadow .14s ease}
        .cw-auth-in:focus-within{border-color:#2563eb !important;box-shadow:0 0 0 3px rgba(37,99,235,.16)}
        .cw-auth-btn{transition:background .15s ease, transform .1s ease}
        .cw-auth-btn:hover:enabled{background:#1d4ed8 !important}
        .cw-auth-btn:active:enabled{transform:translateY(1px)}
        .cw-auth-link{transition:color .14s ease}
        .cw-auth-link:hover{color:#1d4ed8}
        @media (prefers-reduced-motion: reduce){
          .cw-b1,.cw-b2,.cw-b3,.cw-b4,.cw-b5,.cw-sweep,.cw-fadeup,.cw-shake{animation:none !important}
        }
        @media (max-width: 480px){
          .cw-auth-logos{gap:16px !important}
          .cw-auth-logos img:first-child{height:32px !important}
          .cw-auth-logos img:last-child{height:15px !important}
        }
      `}</style>

      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }} aria-hidden="true">
        <div className="cw-blob cw-b1" style={{ width: 520, height: 520, left: -90, top: -120, background: "radial-gradient(circle,rgba(37,99,235,.85),transparent 62%)" }} />
        <div className="cw-blob cw-b2" style={{ width: 560, height: 560, right: -120, top: -80, background: "radial-gradient(circle,rgba(109,40,217,.72),transparent 62%)" }} />
        <div className="cw-blob cw-b3" style={{ width: 600, height: 600, left: "8%", bottom: -220, background: "radial-gradient(circle,rgba(14,159,110,.6),transparent 62%)" }} />
        <div className="cw-blob cw-b4" style={{ width: 520, height: 520, right: "2%", bottom: -160, background: "radial-gradient(circle,rgba(56,189,248,.7),transparent 62%)" }} />
        <div className="cw-blob cw-b5" style={{ width: 440, height: 440, left: "38%", top: "34%", background: "radial-gradient(circle,rgba(139,92,246,.55),transparent 62%)" }} />
        <div className="cw-sweep" />
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,.045) 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(6,11,28,.55) 100%)" }} />
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 16px",
        }}
      >
        {children}
      </div>
    </div>
  );
}
