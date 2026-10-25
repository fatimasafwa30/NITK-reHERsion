import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, CircleAlert, Info, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { DISTANCE, EASE } from '../motion/tokens';

const ToastContext = createContext(null);

const ICONS = { success: Check, error: CircleAlert, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message, { tone = 'success', detail, duration = 4500 } = {}) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((list) => [...list.slice(-2), { id, message, detail, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-4 pb-20 sm:items-end sm:pb-6 sm:pr-6"
        data-print="hide"
      >
        {/* Announced to screen readers; politeness keeps it out of the way. */}
        <div aria-live="polite" aria-atomic="false" className="sr-only">
          {toasts.map((t) => (
            <p key={t.id}>{t.detail ? `${t.message}. ${t.detail}` : t.message}</p>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = ICONS[t.tone] || Info;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: DISTANCE.shift }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 2, transition: { duration: 0.14, ease: EASE.inOut } }}
                transition={{ duration: 0.18, ease: EASE.out }}
                className={cn(
                  'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border bg-paper px-4 py-3 shadow-lift',
                  t.tone === 'error' ? 'border-alert/35' : 'border-lilac',
                )}
              >
                <Icon
                  aria-hidden="true"
                  strokeWidth={1.5}
                  className={cn('mt-0.5 size-4 shrink-0', t.tone === 'error' ? 'text-alert' : 'text-violet-deep')}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-plum">{t.message}</p>
                  {t.detail ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.detail}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="-m-2 grid size-9 place-items-center rounded-sm text-muted transition-colors hover:text-plum"
                  aria-label={`Dismiss: ${t.message}`}
                >
                  <X aria-hidden="true" strokeWidth={1.5} className="size-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx?.toast || (() => {});
}
