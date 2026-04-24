import React, { useEffect, useRef, type RefObject } from 'react';

const BAR_COUNT = 56;
const IDLE_LEVEL = 0.04;
/** Retina で canvas バックバッファを抑え、本番の GPU/帯域負荷を下げる */
const SPECTRUM_CANVAS_DPR_MAX = 1.5;
const PEAK_DECAY_PER_SECOND = 0.34;

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
  const idleTimeoutRef = useRef<number>(0);
  const dataRef = useRef<Uint8Array | null>(null);
  const targetLevelsRef = useRef<Float32Array | null>(null);
  const smoothLevelsRef = useRef<Float32Array | null>(null);
  const peakLevelsRef = useRef<Float32Array | null>(null);
  const lastFrameAtRef = useRef(0);
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
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const ensureLevelBuffers = () => {
      if (targetLevelsRef.current?.length === BAR_COUNT) return;
      targetLevelsRef.current = new Float32Array(BAR_COUNT);
      smoothLevelsRef.current = new Float32Array(BAR_COUNT);
      peakLevelsRef.current = new Float32Array(BAR_COUNT);
    };

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
    ensureLevelBuffers();

    const roundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
      const r = Math.min(radius, width / 2, height / 2);
      ctx2d.beginPath();
      ctx2d.moveTo(x + r, y);
      ctx2d.lineTo(x + width - r, y);
      ctx2d.quadraticCurveTo(x + width, y, x + width, y + r);
      ctx2d.lineTo(x + width, y + height - r);
      ctx2d.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      ctx2d.lineTo(x + r, y + height);
      ctx2d.quadraticCurveTo(x, y + height, x, y + height - r);
      ctx2d.lineTo(x, y + r);
      ctx2d.quadraticCurveTo(x, y, x + r, y);
    };

    const barSlot = (w: number, i: number) => {
      const margin = w * 0.1;
      const innerW = w * 0.8;
      const gapPx = Math.max(1.2, w * 0.003);
      const xa = margin + (innerW * i) / BAR_COUNT;
      const xb = margin + (innerW * (i + 1)) / BAR_COUNT;
      const rawW = xb - xa;
      const barW = Math.max(2.25, rawW - gapPx);
      const x = xa + gapPx * 0.5;
      return { x, barW };
    };

    /** 画面表示中は毎フレーム描画し、動きの滑らかさは値の補間で制御する */
    const scheduleDraw = () => {
      if (cancelled) return;
      if (document.hidden) {
        if (idleTimeoutRef.current) window.clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = window.setTimeout(() => {
          idleTimeoutRef.current = 0;
          scheduleDraw();
        }, 400);
        return;
      }
      rafRef.current = requestAnimationFrame(drawFrame);
    };

    const drawFrame = (now: number) => {
      if (cancelled) return;
      ensureLevelBuffers();
      const analyser = analyserRef.current;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) {
        scheduleDraw();
        return;
      }

      const lastFrameAt = lastFrameAtRef.current || now;
      const deltaSeconds = Math.min(0.05, Math.max(0.001, (now - lastFrameAt) / 1000));
      lastFrameAtRef.current = now;

      const targetLevels = targetLevelsRef.current!;
      const smoothLevels = smoothLevelsRef.current!;
      const peakLevels = peakLevelsRef.current!;
      const reducedMotion = reducedMotionQuery.matches;

      const halfH = h * 0.52;
      const floorY = halfH + h * 0.08;
      const barAreaH = halfH * 0.92;

      const playing = isPlayingRef.current;
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
          const ratioLo = i / BAR_COUNT;
          const ratioHi = (i + 1) / BAR_COUNT;
          const hzLo = minHz * Math.pow(maxHz / minHz, ratioLo);
          const hzHi = minHz * Math.pow(maxHz / minHz, ratioHi);
          const start = Math.max(0, Math.min(n - 1, Math.floor(hzLo / hzPerBin)));
          const end = Math.max(start + 1, Math.min(n, Math.ceil(hzHi / hzPerBin)));
          let sum = 0;
          for (let j = start; j < end; j++) sum += buf[j]!;
          targetLevels[i] = sum / (255 * (end - start));
        }
      } else {
        const t = now * 0.001;
        for (let i = 0; i < BAR_COUNT; i++) {
          const idle = IDLE_LEVEL + Math.sin(t * 1.2 + i * 0.15) * 0.02;
          targetLevels[i] = Math.max(0, idle);
        }
      }

      /** 右寄りほど表示ゲイン（ピーク割りは max がノイズだと右が再び横一線になるため使わない） */
      const lastIdx = BAR_COUNT - 1;
      const displayAmp = (i: number) => {
        const v = targetLevels[i]!;
        const idx = lastIdx > 0 ? i / lastIdx : 0;
        const hf = 1 + 0.82 * Math.pow(idx, 1.16);
        const lowLift = 1 + 0.22 * (1 - idx);
        return Math.min(1, v * 1.56 * hf * lowLift);
      };

      const attack = reducedMotion ? 1 : 1 - Math.exp(-deltaSeconds * 24);
      const release = reducedMotion ? 1 : 1 - Math.exp(-deltaSeconds * 9);
      let bassPulse = 0;
      let energy = 0;
      for (let i = 0; i < BAR_COUNT; i++) {
        const target = displayAmp(i);
        const current = smoothLevels[i]!;
        const coeff = target > current ? attack : release;
        const next = current + (target - current) * coeff;
        smoothLevels[i] = next;
        peakLevels[i] = Math.max(next, peakLevels[i]! - PEAK_DECAY_PER_SECOND * deltaSeconds);
        energy += next;
        if (i < 8) bassPulse += next;
      }
      energy /= BAR_COUNT;
      bassPulse /= 8;

      ctx2d.clearRect(0, 0, w, h);

      const bg = ctx2d.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, 'rgba(34, 211, 238, 0.045)');
      bg.addColorStop(0.52, 'rgba(168, 85, 247, 0.055)');
      bg.addColorStop(1, 'rgba(236, 72, 153, 0.035)');
      ctx2d.fillStyle = bg;
      ctx2d.fillRect(0, 0, w, h);

      const beam = ctx2d.createRadialGradient(w / 2, floorY, 8, w / 2, floorY, Math.max(w, h) * 0.56);
      beam.addColorStop(0, `rgba(236, 72, 153, ${0.16 + bassPulse * 0.14})`);
      beam.addColorStop(0.42, `rgba(34, 211, 238, ${0.05 + energy * 0.06})`);
      beam.addColorStop(1, 'rgba(34, 211, 238, 0)');
      ctx2d.fillStyle = beam;
      ctx2d.fillRect(0, 0, w, h);

      // 床の同心円
      const cx = w / 2;
      const ringY = floorY;
      for (let r = 3; r >= 0; r--) {
        const rr = 28 + r * (22 + bassPulse * 5);
        ctx2d.beginPath();
        ctx2d.ellipse(cx, ringY, rr, rr * 0.28, 0, 0, Math.PI * 2);
        ctx2d.strokeStyle = `rgba(236, 72, 153, ${0.12 + r * 0.055 + bassPulse * 0.08})`;
        ctx2d.lineWidth = 2;
        ctx2d.stroke();
      }

      ctx2d.save();
      ctx2d.globalAlpha = 0.45 + energy * 0.25;
      ctx2d.strokeStyle = 'rgba(34, 211, 238, 0.3)';
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.moveTo(w * 0.08, floorY + 0.5);
      ctx2d.lineTo(w * 0.92, floorY + 0.5);
      ctx2d.stroke();
      ctx2d.restore();

      const barGradient = ctx2d.createLinearGradient(0, floorY, 0, floorY - barAreaH);
      barGradient.addColorStop(0, 'rgba(236, 72, 153, 0.96)');
      barGradient.addColorStop(0.46, 'rgba(168, 85, 247, 0.94)');
      barGradient.addColorStop(1, 'rgba(34, 211, 238, 0.98)');

      const glowGradient = ctx2d.createLinearGradient(0, floorY, 0, floorY - barAreaH);
      glowGradient.addColorStop(0, 'rgba(236, 72, 153, 0.2)');
      glowGradient.addColorStop(0.5, 'rgba(168, 85, 247, 0.16)');
      glowGradient.addColorStop(1, 'rgba(34, 211, 238, 0.2)');

      const drawBars = (flip: 1 | -1, alpha: number) => {
        ctx2d.save();
        ctx2d.globalAlpha = alpha;
        if (flip === -1) {
          ctx2d.translate(0, floorY * 2);
          ctx2d.scale(1, -1);
        }

        for (let i = 0; i < BAR_COUNT; i++) {
          const { x, barW } = barSlot(w, i);
          const raw = smoothLevels[i]!;
          const shaped = Math.pow(Math.max(raw, 1e-6), 0.42);
          const bh = barAreaH * (0.012 + Math.min(1, shaped) * 0.988);
          const y = floorY - bh;
          const radius = Math.min(5, barW * 0.45);

          ctx2d.shadowColor = flip === 1 ? 'rgba(34, 211, 238, 0.38)' : 'rgba(236, 72, 153, 0.22)';
          ctx2d.shadowBlur = flip === 1 ? 12 : 5;
          ctx2d.fillStyle = glowGradient;
          roundedRect(x - barW * 0.16, y - 1, barW * 1.32, bh + 2, radius + 2);
          ctx2d.fill();

          ctx2d.shadowBlur = flip === 1 ? 6 : 0;
          ctx2d.fillStyle = barGradient;
          roundedRect(x, y, barW, bh, radius);
          ctx2d.fill();

          ctx2d.shadowBlur = 0;
          ctx2d.fillStyle = 'rgba(255, 255, 255, 0.45)';
          roundedRect(x + barW * 0.22, y + 1, Math.max(1, barW * 0.18), Math.max(2, bh * 0.72), radius);
          ctx2d.fill();

          if (flip === 1 && !reducedMotion) {
            const peakY = floorY - barAreaH * (0.012 + Math.pow(Math.max(peakLevels[i]!, 1e-6), 0.42) * 0.988);
            ctx2d.fillStyle = 'rgba(255, 255, 255, 0.72)';
            roundedRect(x + barW * 0.1, peakY - 5, barW * 0.8, 2.2, 1.5);
            ctx2d.fill();
          }
          ctx2d.shadowBlur = 0;
        }
        ctx2d.restore();
      };

      drawBars(1, 1);
      drawBars(-1, 0.22);

      scheduleDraw();
    };

    scheduleDraw();

    return () => {
      cancelled = true;
      if (idleTimeoutRef.current) window.clearTimeout(idleTimeoutRef.current);
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
