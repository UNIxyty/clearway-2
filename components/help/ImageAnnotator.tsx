"use client";

// Draw-on-image annotator (item 4): freehand pen, rectangle and arrow with a
// colour choice, undo, and a discard that keeps the original. "The red circle
// around the thing that's wrong" is the most useful part of a bug report —
// this makes it a first-class step instead of a round trip through an editor.

import { useEffect, useRef, useState } from "react";

type Tool = "pen" | "rect" | "arrow";
type Stroke = { tool: Tool; color: string; points: Array<{ x: number; y: number }> };

const COLORS = ["#e5484d", "#f59e0b", "#2563eb", "#16a34a"];
const MAX_EDGE = 1600;

export default function ImageAnnotator({
  src,
  onCancel,
  onSave,
}: {
  src: string;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [saving, setSaving] = useState(false);
  const drawing = useRef<Stroke | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      setReady(true);
    };
    img.src = src;
  }, [src]);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const lineW = Math.max(3, Math.round(canvas.width / 300));
    for (const s of [...strokes, ...(drawing.current ? [drawing.current] : [])]) {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = lineW;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const pts = s.points;
      if (!pts.length) continue;
      if (s.tool === "pen") {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        const a = pts[0];
        const b = pts[pts.length - 1];
        if (s.tool === "rect") {
          ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        } else {
          // arrow: shaft + head
          const angle = Math.atan2(b.y - a.y, b.x - a.x);
          const head = lineW * 4;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 6), b.y - head * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 6), b.y - head * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  });

  const posOf = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    };
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(23,24,28,.55)] p-6" onClick={onCancel}>
      <div
        className="flex max-h-full max-w-[min(1000px,94vw)] flex-col gap-3 rounded-[14px] border border-cw-border bg-white p-4 shadow-[0_24px_60px_rgba(16,18,22,.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-cw-ink">Annotate</span>
          <div className="mx-2 h-5 w-px bg-cw-border" />
          {(["pen", "rect", "arrow"] as Tool[]).map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              className="flex h-9 cursor-pointer items-center rounded-[9px] border px-3 text-[13px] font-semibold"
              style={tool === t ? { background: "#17181c", borderColor: "#17181c", color: "#fff" } : { background: "#fff", borderColor: "#e6e7ea", color: "#3a3d44" }}
            >
              {t === "pen" ? "✎ Pen" : t === "rect" ? "▭ Rectangle" : "→ Arrow"}
            </button>
          ))}
          <div className="mx-2 h-5 w-px bg-cw-border" />
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={c}
              className="h-9 w-9 cursor-pointer rounded-[9px] border-2"
              style={{ background: c, borderColor: color === c ? "#17181c" : "transparent" }}
            />
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setStrokes((s) => s.slice(0, -1))}
              disabled={!strokes.length}
              className="h-9 cursor-pointer rounded-[9px] border border-cw-border bg-white px-3 text-[13px] font-semibold text-cw-body disabled:opacity-40"
            >
              Undo
            </button>
            <button
              onClick={() => setStrokes([])}
              disabled={!strokes.length}
              className="h-9 cursor-pointer rounded-[9px] border border-cw-border bg-white px-3 text-[13px] font-semibold text-cw-body disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-auto rounded-[10px] border border-cw-border bg-cw-page">
          <canvas
            ref={canvasRef}
            className="block max-w-full cursor-crosshair touch-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drawing.current = { tool, color, points: [posOf(e)] };
              setStrokes((s) => [...s]); // repaint
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              if (drawing.current.tool === "pen") drawing.current.points.push(posOf(e));
              else drawing.current.points = [drawing.current.points[0], posOf(e)];
              setStrokes((s) => [...s]); // repaint with live stroke
            }}
            onPointerUp={() => {
              if (drawing.current && drawing.current.points.length > 1) {
                const done = drawing.current;
                drawing.current = null;
                setStrokes((s) => [...s, done]);
              } else {
                drawing.current = null;
                setStrokes((s) => [...s]);
              }
            }}
          />
        </div>

        <div className="flex items-center gap-2.5">
          <span className="flex-1 text-[12px] text-cw-faint">
            The original stays untouched — annotating again always starts from it.
          </span>
          <button onClick={onCancel} className="h-9 cursor-pointer rounded-[9px] border border-cw-border bg-white px-3.5 text-[13px] font-semibold text-cw-muted">
            Discard annotation
          </button>
          <button
            disabled={!strokes.length || saving}
            onClick={() => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              setSaving(true);
              canvas.toBlob((blob) => {
                if (blob) onSave(blob);
                else setSaving(false);
              }, "image/png");
            }}
            className="h-9 cursor-pointer rounded-[9px] border-none bg-cw-primary px-4 text-[13px] font-bold text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save annotation"}
          </button>
        </div>
      </div>
    </div>
  );
}
