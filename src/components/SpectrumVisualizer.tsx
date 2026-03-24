import React, { useEffect, useRef, type RefObject } from 'react';

const BAR_COUNT = 48;
const IDLE_LEVEL = 0.04;
/** Retina で canvas バックバッファを抑え、本番の GPU/帯域負荷を下げる */
const SPECTRUM_CANVAS_DPR_MAX = 1.5;
const BAR_SEGMENTS = 8;

interface SpectrumVisualizerProps {
  analyserRef: RefObject<AnalyserNode | null>;
  isPlaying: boolean;
  /** false のときは描画ループを開始しない（非表示パネルでの無駄な RAF を防ぐ） */
  panelActive?: boolean;
  className?: string;
}

/** Web Audio Analyser から周波数バーを Canvas に描画（ネオン風） */
export const SpectrumVisualizer: React.FC<SpectrumVisualizerProps> = ({
  analyserRef,
  isPlaying,
  panelActive = true,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array | null>(null);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    if (!panelActive) {
      return () => {};
    }

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    let cancelled = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, SPECTRUM_CANVAS_DPR_MAX);
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();

    const drawFrame = () => {
      if (cancelled) return;
      const analyser = analyserRef.current;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      const halfH = h * 0.52;
      const floorY = halfH + h * 0.08;
      const barAreaH = halfH * 0.92;

      const playing = isPlayingRef.current;
      let levels: number[] = [];
      if (analyser && playing) {
        const n = analyser.frequencyBinCount;
        if (!dataRef.current || dataRef.current.length !== n) {
          dataRef.current = new Uint8Array(n);
        }
        analyser.getByteFrequencyData(dataRef.current);
        const buf = dataRef.current;
        /**
         * 線形ビン分割だと右端が Nyquist 近傍になり、圧縮音源では実質 0。
         * 40Hz〜maxHz を均等に 48 本に割り、bin は sr/fft で Hz→index（右端は ~10–12kHz 帯）。
         */
        const sr = analyser.context.sampleRate;
        const fft = analyser.fftSize;
        const hzPerBin = sr / fft;
        const minHz = 40;
        const maxHz = Math.min(12000, sr * 0.45);
        for (let i = 0; i < BAR_COUNT; i++) {
          const hzLo = minHz + ((maxHz - minHz) * i) / BAR_COUNT;
          const hzHi = minHz + ((maxHz - minHz) * (i + 1)) / BAR_COUNT;
          const start = Math.max(0, Math.min(n - 1, Math.floor(hzLo / hzPerBin)));
          const end = Math.max(start + 1, Math.min(n, Math.ceil(hzHi / hzPerBin)));
          let sum = 0;
          for (let j = start; j < end; j++) sum += buf[j]!;
          levels.push(sum / (255 * (end - start)));
        }
      } else {
        const t = performance.now() * 0.001;
        for (let i = 0; i < BAR_COUNT; i++) {
          const idle = IDLE_LEVEL + Math.sin(t * 1.2 + i * 0.15) * 0.02;
          levels.push(Math.max(0, idle));
        }
      }

      /** 右寄りほど表示ゲイン（ピーク割りは max がノイズだと右が再び横一線になるため使わない） */
      const lastIdx = BAR_COUNT - 1;
      const displayAmp = (i: number) => {
        const v = levels[i]!;
        const idx = lastIdx > 0 ? i / lastIdx : 0;
        const hf = 1 + 1.15 * Math.pow(idx, 1.25);
        return Math.min(1, v * 1.4 * hf);
      };

      ctx2d.clearRect(0, 0, w, h);

      // 床の同心円（ピンク系）
      const cx = w / 2;
      const ringY = floorY;
      for (let r = 3; r >= 0; r--) {
        const rr = 28 + r * 22;
        ctx2d.beginPath();
        ctx2d.ellipse(cx, ringY, rr, rr * 0.28, 0, 0, Math.PI * 2);
        ctx2d.strokeStyle = `rgba(236, 72, 153, ${0.12 + r * 0.06})`;
        ctx2d.lineWidth = 2;
        ctx2d.stroke();
      }

      const margin = w * 0.14;
      const innerW = w * 0.72;
      const gapPx = Math.max(0.45, w * 0.0035);

      /** 横位置も線形（各バーが等幅で、右端が一本の横線に潰れない） */
      const barSlot = (i: number) => {
        const xa = margin + (innerW * i) / BAR_COUNT;
        const xb = margin + (innerW * (i + 1)) / BAR_COUNT;
        const rawW = xb - xa;
        const barW = Math.max(2, rawW - gapPx);
        const x = xa + gapPx * 0.35;
        return { x, barW };
      };

      const drawBars = (flip: 1 | -1, alpha: number) => {
        ctx2d.save();
        ctx2d.globalAlpha = alpha;
        if (flip === -1) {
          ctx2d.translate(0, floorY * 2);
          ctx2d.scale(1, -1);
        }

        for (let i = 0; i < BAR_COUNT; i++) {
          const { x, barW } = barSlot(i);
          const raw = displayAmp(i);
          const shaped = Math.pow(Math.max(raw, 1e-6), 0.42);
          const bh = barAreaH * (0.012 + Math.min(1, shaped) * 0.988);
          const y = floorY - bh;

          const g = ctx2d.createLinearGradient(x, y + bh, x, y);
          g.addColorStop(0, 'rgba(236, 72, 153, 0.95)');
          g.addColorStop(0.45, 'rgba(168, 85, 247, 0.9)');
          g.addColorStop(1, 'rgba(34, 211, 238, 0.98)');

          ctx2d.shadowColor = 'rgba(236, 72, 153, 0.55)';
          ctx2d.shadowBlur = flip === 1 ? 9 : 5;
          ctx2d.fillStyle = g;
          const segH = Math.max(4, bh / BAR_SEGMENTS);
          let sy = y + bh - segH;
          for (let s = 0; s < BAR_SEGMENTS && sy >= y - 0.5; s++) {
            const rw = barW * (0.92 + (s % 2) * 0.06);
            const rx = x + (barW - rw) / 2;
            const ry = sy;
            const rwd = rw;
            const rhd = segH - 1;
            const rad = 2;
            ctx2d.beginPath();
            ctx2d.moveTo(rx + rad, ry);
            ctx2d.lineTo(rx + rwd - rad, ry);
            ctx2d.quadraticCurveTo(rx + rwd, ry, rx + rwd, ry + rad);
            ctx2d.lineTo(rx + rwd, ry + rhd - rad);
            ctx2d.quadraticCurveTo(rx + rwd, ry + rhd, rx + rwd - rad, ry + rhd);
            ctx2d.lineTo(rx + rad, ry + rhd);
            ctx2d.quadraticCurveTo(rx, ry + rhd, rx, ry + rhd - rad);
            ctx2d.lineTo(rx, ry + rad);
            ctx2d.quadraticCurveTo(rx, ry, rx + rad, ry);
            ctx2d.closePath();
            ctx2d.fill();
            sy -= segH;
          }
          ctx2d.shadowBlur = 0;
        }
        ctx2d.restore();
      };

      drawBars(1, 1);
      drawBars(-1, 0.22);

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [analyserRef, panelActive]);

  return (
    <div ref={containerRef} className={className ?? 'h-[min(52vh,22rem)] w-full max-w-[min(100%,36rem)]'}>
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />
    </div>
  );
};
