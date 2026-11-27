import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { SUPABASE_URL, supabase, must } from "../lib/supabase.js";
import { useLive } from "../lib/live.js";
import { errText } from "../lib/util.js";
import { useToast } from "../toast.jsx";
import { ConfirmButton, ErrorNote, Icon, Loading } from "../ui.jsx";

const SUGGEST = [
  "Sigirning sutini qanday oshirsam bo'ladi?",
  "Qishda qo'ylarni nima bilan boqish kerak?",
  "Sigir kuyikkanini qanday bilaman?",
  "Buzoq tug'ilgach birinchi kunlarda nima qilish kerak?",
  "Qo'zilarga qachon emlash qilinadi?",
  "Buqani so'yishga qanday semirtiraman?",
];

async function ask(message) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("not_authenticated");
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" }, // qo'shimcha CORS so'rovisiz
      body: JSON.stringify({ token, message }),
    });
  } catch {
    throw new Error("Failed to fetch");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Server xatosi (${res.status})`);
  return body;
}

/** AI maslahatchi: chorvachilik bo'yicha savol-javob. */
export default function Ai() {
  const { uid } = useAuth();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // javob kutilayotgan savol
  const [left, setLeft] = useState(null);
  const end = useRef(null);

  const msgs = useLive(
    async () => must(await supabase.from("ai_messages").select("id, role, content, created_at").eq("user_id", uid)
      .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(200)),
    [uid],
  );
  const list = msgs.data || [];

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [list.length, pending]);

  async function send(q) {
    const m = (q ?? text).trim();
    if (!m || busy) return;
    setBusy(true); setPending(m); setText("");
    try {
      const r = await ask(m);
      if (typeof r.left === "number") setLeft(r.left);
      await msgs.reload();
    } catch (e) {
      toast(errText(e));
      setText(m);
      await msgs.reload();
    }
    setPending(null); setBusy(false);
  }

  async function clear() {
    try { must(await supabase.from("ai_messages").delete().eq("user_id", uid)); msgs.reload(); toast("Suhbat tozalandi"); }
    catch (e) { toast(errText(e)); }
  }

  return (
    <>
      <h1>AI maslahatchi</h1>
      <p className="lead">Boqish, parvarish, ko'paytirish va sog'liq haqida savol bering. Javob bir necha soniyada keladi.</p>
      <div className="note">AI veterinar o'rnini bosmaydi. Hayvon og'ir kasal bo'lsa, darhol <Link to="/new">veterinarga ariza yuboring</Link>.</div>
      <ErrorNote error={msgs.error} onRetry={msgs.reload} />

      {msgs.loading && !msgs.data ? <Loading /> : (
        <div className="aichat">
          {list.length === 0 && !pending && (
            <>
              <span className="label">Masalan:</span>
              <div className="chips">
                {SUGGEST.map((s) => <button key={s} className="chip" disabled={busy} onClick={() => send(s)}>{s}</button>)}
              </div>
            </>
          )}
          {list.map((m) => (
            <div key={m.id} className={`msg ${m.role === "user" ? "me" : "them"}`} style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
          ))}
          {pending && <div className="msg me" style={{ whiteSpace: "pre-wrap" }}>{pending}</div>}
          {pending && <div className="msg them typing">Javob yozilmoqda…</div>}
          <div ref={end} />
        </div>
      )}

      <div className="sticky-cta">
        <div className="composer" style={{ gridTemplateColumns: "1fr auto", marginTop: 0 }}>
          <textarea rows={2} style={{ minHeight: 48 }} value={text} maxLength={2000} placeholder="Savolingizni yozing…" aria-label="Savol"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="btn dark" disabled={busy || !text.trim()} onClick={() => send()} aria-label="Yuborish"><Icon name="send" size={20} /></button>
        </div>
        {left !== null && <div className="meta" style={{ marginTop: 4 }}>Bugun yana {left} ta savol berishingiz mumkin.</div>}
      </div>
      {list.length > 0 && (
        <ConfirmButton className="btn ghost wide" confirmText="Ha, tozalash" disabled={busy} onConfirm={clear}>Suhbatni tozalash</ConfirmButton>
      )}
    </>
  );
}
