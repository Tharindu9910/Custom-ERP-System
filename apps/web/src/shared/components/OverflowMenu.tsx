import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

export interface OverflowMenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  /** Red, for destructive actions such as Cancel */
  danger?: boolean;
}

const MENU_WIDTH = 176;

/** A three-dots button that opens a small menu of secondary actions. Rendered in a portal so table scroll areas never clip it. */
export function OverflowMenu({ items, label = 'More actions' }: { items: OverflowMenuItem[]; label?: string }): ReactNode {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  if (items.length === 0) return null;

  const toggle = () => {
    if (pos) return setPos(null);
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.bottom + 4 + items.length * 40 + 8 <= window.innerHeight;
    setPos({
      top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - items.length * 40 - 8),
      left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    });
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        title={label}
        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      >
        <Icon name="moreVertical" className="h-5 w-5" />
      </button>
      {pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setPos(null)} />
            <div
              role="menu"
              style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
              className="fixed z-50 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            >
              {items.map((it) => (
                <button
                  key={it.label}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setPos(null);
                    it.onSelect();
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold transition-colors ${
                    it.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {it.icon && <Icon name={it.icon} className="h-4 w-4" />}
                  {it.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
