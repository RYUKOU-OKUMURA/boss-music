import React, { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import clsx from 'clsx';
import { useTrackPageUi, type TrackPageUiPattern } from '../context/TrackPageUiContext';

type MenuPlacement = 'nav' | 'track';

const LABELS: Record<TrackPageUiPattern, string> = {
  vinyl: 'レコード',
  illustration: 'イラスト',
};

interface TrackPagePatternMenuProps {
  placement?: MenuPlacement;
  className?: string;
}

/** 再生ページの UI パターン（vinyl / illustration）を選ぶポップオーバー。Navigation と TrackPage の両方で使用 */
export const TrackPagePatternMenu: React.FC<TrackPagePatternMenuProps> = ({
  placement = 'nav',
  className,
}) => {
  const { pattern, setPattern } = useTrackPageUi();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const select = (p: TrackPageUiPattern) => {
    setPattern(p);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="再生画面の表示パターン"
        className="text-zen-mist/60 hover:text-zen-mist transition-colors"
      >
        <Settings className="w-5 h-5" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="再生画面のレイアウト"
          className={clsx(
            'absolute z-[100] mt-2 min-w-[11rem] rounded-lg border border-white/10 bg-surface py-2 shadow-xl',
            placement === 'nav' ? 'right-0' : 'right-0'
          )}
        >
          <p className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-zen-mist/45">
            再生画面
          </p>
          <div className="flex flex-col gap-0.5 px-1">
            {(['vinyl', 'illustration'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => select(p)}
                className={clsx(
                  'rounded-md px-3 py-2 text-left text-sm transition-colors',
                  pattern === p
                    ? 'bg-white/10 text-white'
                    : 'text-zen-mist/75 hover:bg-white/5 hover:text-white'
                )}
              >
                {LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
