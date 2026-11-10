import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { House, LogOut, Settings } from 'lucide-react';
import { api } from '../api';

/** Gemeinsamer Rahmen: Kopfzeile mit Logo + Navigation, Inhalt darunter. */
export default function AppShell({ children }: { children: ReactNode }) {
  const nav = useNavigate();

  async function abmelden() {
    try { await api('/logout', { method: 'POST' }); } catch { /* egal — Cookie fällt back */ }
    location.href = '/login';
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-lv-kante bg-lv-karte/70 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <span className="w-9 h-9 rounded-xl bg-lv-bg border border-lv-kante grid place-items-center">
              <House className="text-lv-limette" size={18} />
            </span>
            <span>
              <span className="block font-semibold leading-tight">AnwesenTwin</span>
              <span className="block text-[11px] text-lv-blass leading-tight">GPS + Bild → 3D-Zwilling</span>
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <NavLink to="/" end className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg ${isActive ? 'bg-lv-limette/15 text-lv-limette' : 'text-lv-blass hover:text-lv-text'}`}>
              Projekte
            </NavLink>
            <NavLink to="/einstellungen" className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${isActive ? 'bg-lv-limette/15 text-lv-limette' : 'text-lv-blass hover:text-lv-text'}`}>
              <Settings size={14} /> Einstellungen
            </NavLink>
            <button onClick={abmelden} title="Abmelden"
              className="px-3 py-1.5 rounded-lg text-lv-blass hover:text-lv-text">
              <LogOut size={14} />
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
