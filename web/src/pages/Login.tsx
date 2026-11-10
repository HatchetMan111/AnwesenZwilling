import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { House } from 'lucide-react';

export default function Login() {
  const [passwort, setPasswort] = useState('');
  const [fehler, setFehler] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFehler('');
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwort }),
      });
      if (!r.ok) throw new Error('Falsches Passwort');
      nav('/');
    } catch (err: any) {
      setFehler(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center">
      <form onSubmit={submit} className="karte w-96 max-w-[90vw] space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-lv-bg grid place-items-center border border-lv-kante">
            <House className="text-lv-limette" size={22} />
          </div>
          <div>
            <h1 className="text-lg font-semibold">AnwesenTwin</h1>
            <p className="text-xs text-lv-blass">Digitaler Zwilling aus GPS &amp; Bildern</p>
          </div>
        </div>
        <input
          type="password"
          placeholder="Passwort"
          value={passwort}
          onChange={(e) => setPasswort(e.target.value)}
          autoFocus
          className="w-full"
        />
        {fehler && <p className="text-sm text-red-400">{fehler}</p>}
        <button className="btn-primaer w-full justify-center" disabled={busy}>
          {busy ? 'Prüfe …' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}
