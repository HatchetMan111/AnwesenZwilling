import { useEffect, useState } from 'react';

interface Toast { msg: string; ok: boolean; id: number; }

export default function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const h = (e: Event) => {
      const { msg, ok } = (e as CustomEvent).detail;
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { msg, ok, id }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
    };
    window.addEventListener('lv-toast', h);
    return () => window.removeEventListener('lv-toast', h);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2.5 rounded-xl text-sm shadow-lg border ${
            t.ok
              ? 'bg-lv-karte border-lv-limette/50 text-lv-text'
              : 'bg-red-950/90 border-red-800 text-red-200'
          }`}
        >
          {t.ok ? '✓ ' : '⚠ '}{t.msg}
        </div>
      ))}
    </div>
  );
}
