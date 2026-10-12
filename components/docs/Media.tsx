"use client";

import { useState } from "react";
import MaskIcon from "@/components/portal/Icon";

// Screenshot and video (design: Docs Media). Every state is honest: no file → the slim "to come" row (never a broken
// image or an empty player); a file that fails in the browser → "didn't load" with Try again.
// Screenshots are taken at 2x and shown at half their natural width, capped at the column and 520px high, so a whole
// screen fills the column and a single button sits at its real size. Nothing depends on what is in the picture.
// `demo` holds a state still, for the component sheet (/developer/docs-components); pages never pass it.

function Missing({ video, title, body }: { video: boolean; title: string; body: string }) {
  return (
    <div className="dx-media-missing" data-media-state="missing">
      <span className="dx-media-missing-ic"><MaskIcon name={video ? "clapperboard" : "image"} size={17} /></span>
      <span className="dx-media-missing-t"><span className="t">{title}</span><span className="b">{body}</span></span>
    </div>
  );
}

export function Shot({ src, caption, fig, demo }: { src: string | null; caption: string; fig: string; demo?: "loading" | "failed" }) {
  const [live, setState] = useState<"loading" | "ready" | "failed">("loading");
  const state = demo ?? live;
  const [w, setW] = useState(0);
  const [attempt, setAttempt] = useState(0);
  if (!src) return <figure className="dx-media"><Missing video={false} title="Screenshot to come" body={caption || "The steps describe what you will see."} /></figure>;
  return (
    <figure className="dx-media" data-media-state={state}>
      {state === "failed" ? (
        <div className="dx-media-failed">
          <MaskIcon name="circle-alert" size={22} />
          <span className="t">This screenshot didn’t load</span>
          <span className="b">The steps describe what you will see.</span>
          <button type="button" className="dx-btn" onClick={() => { setState("loading"); setAttempt((a) => a + 1); }}><MaskIcon name="rotate-cw" size={14} />Try again</button>
        </div>
      ) : (
        <div className={`dx-media-stage${state === "loading" ? " loading" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the natural width decides the size (half of it) */}
          {demo !== "loading" && <img key={attempt} src={attempt ? `${src}?retry=${attempt}` : src} alt={caption} style={{ width: w ? Math.round(w / 2) : undefined }}
            onLoad={(e) => { setW((e.target as HTMLImageElement).naturalWidth); setState("ready"); }} onError={() => setState("failed")} />}
        </div>
      )}
      {caption && state !== "failed" && <figcaption>{fig && <span className="fig">Fig. {fig}</span>}<span>{caption}</span></figcaption>}
    </figure>
  );
}

export function Video({ src, poster, title, length, demo }: { src: string | null; poster: string | null; title: string; length: string; demo?: "idle" | "loading" | "failed" }) {
  const [live, setState] = useState<"idle" | "loading" | "playing" | "failed">("idle");
  const state = demo ?? live;
  if (!src) return <figure className="dx-media"><Missing video title={`Video to come${length ? ` · about ${length}` : ""}`} body="Everything it will show is written out below." /></figure>;
  if (state === "failed") {
    return (
      <figure className="dx-media"><div className="dx-media-failed video">
        <MaskIcon name="circle-alert" size={22} />
        <span className="t">This video didn’t play</span>
        <span className="b">Check your connection and try again. The steps below cover the same thing.</span>
        <button type="button" className="dx-btn" onClick={() => setState("loading")}><MaskIcon name="rotate-cw" size={14} />Try again</button>
      </div></figure>
    );
  }
  if (state === "idle") {
    return (
      <figure className="dx-media">
        <button type="button" className="dx-video-poster" onClick={() => { if (!demo) setState("loading"); }} aria-label={`Play: ${title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {poster && <img src={poster} alt="" />}
          <span className="scrim" />
          <span className="play"><MaskIcon name="play" size={24} /></span>
          <span className="chips"><span className="chip">{title}</span><span className="sp" />{length && <span className="chip dx-mono">{length}</span>}</span>
        </button>
      </figure>
    );
  }
  return (
    <figure className="dx-media">
      <div className={`dx-video-frame${state === "loading" ? " loading" : ""}`}>
        {!demo && <video src={src} poster={poster ?? undefined} controls autoPlay playsInline onPlaying={() => setState("playing")} onError={() => setState("failed")} />}
        {state === "loading" && <span className="dx-video-spin"><MaskIcon name="loader-circle" size={20} /></span>}
      </div>
    </figure>
  );
}
