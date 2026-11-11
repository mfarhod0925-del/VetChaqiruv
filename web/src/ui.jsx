import { useState } from "react";
import { REGIONS, VET_STATUS } from "./lib/constants.js";
import { useSignedUrl } from "./lib/photos.js";
import { fmtPhone, initials, telHref } from "./lib/util.js";
import { useToast } from "./toast.jsx";

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="5"/>',
  list: '<path d="M8 4h8l3 3v13H5V4z"/><path d="M9 11h6M9 15h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
  pharm: '<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M8 9V5h8v4M12 12v6M9 15h6"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  cam: '<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>',
  send: '<path d="M4 12l16-8-6 16-2-7z"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  vet: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
  farm: '<path d="M3 21V10l9-6 9 6v11"/><path d="M9 21v-6h6v6"/>',
};

export function Icon({ name, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

export function RawIcon({ paths, size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: paths }} />
  );
}

export const Pill = ({ s }) => (s ? <span className={`pill ${s[1]}`}>{s[0]}</span> : null);

export function Avatar({ name, status }) {
  const st = VET_STATUS[status];
  const color = st ? `var(--${st[1] === "mute" ? "muted" : st[1]})` : null;
  return <div className="ava">{initials(name)}{color && <i style={{ background: color }} />}</div>;
}

export function Loading({ text = "Yuklanmoqda…" }) {
  return <div className="empty">{text}</div>;
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="note bad">
      Ma'lumotni yuklab bo'lmadi. Internetni tekshiring.
      {onRetry && <> <button className="linkbtn" onClick={onRetry}>Qayta urinish</button></>}
    </div>
  );
}

export function RegionSelect({ region, district, onChange, idPrefix = "rg", compact = false }) {
  const r = REGIONS[region] ? region : Object.keys(REGIONS)[0];
  const ds = REGIONS[r];
  const d = ds.includes(district) ? district : ds[0];
  const regionSel = (
    <select id={`${idPrefix}R`} className={compact ? "" : "field"} aria-label="Viloyat" value={r}
      onChange={(e) => onChange(e.target.value, REGIONS[e.target.value][0])}>
      {Object.keys(REGIONS).map((x) => <option key={x}>{x}</option>)}
    </select>
  );
  const distSel = (
    <select id={`${idPrefix}D`} className={compact ? "" : "field"} aria-label="Tuman" value={d}
      onChange={(e) => onChange(r, e.target.value)}>
      {ds.map((x) => <option key={x}>{x}</option>)}
    </select>
  );
  if (compact) return <div className="region"><Icon name="pin" size={20} />{regionSel}{distSel}</div>;
  return (
    <div className="grid2">
      <div><label className="label" htmlFor={`${idPrefix}R`}>Viloyat</label>{regionSel}</div>
      <div><label className="label" htmlFor={`${idPrefix}D`}>Tuman</label>{distSel}</div>
    </div>
  );
}

export function StorageImage({ path, alt = "Rasm", className = "thumb" }) {
  const { url, failed } = useSignedUrl(path);
  if (!path) return null;
  if (failed) return <div className="meta">Rasmni yuklab bo'lmadi</div>;
  if (!url) return <div className={className} style={{ height: 160 }} />;
  return <a href={url} target="_blank" rel="noreferrer"><img className={className} src={url} alt={alt} loading="lazy" /></a>;
}

export function PhoneLine({ phone, label }) {
  const toast = useToast();
  if (!phone) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(fmtPhone(phone)); toast("Nusxalandi"); } catch { toast(fmtPhone(phone)); }
  };
  return (
    <div style={{ marginTop: 10 }}>
      {label && <span className="meta">{label}</span>}
      <div className="phone" style={{ userSelect: "all" }}>{fmtPhone(phone)}</div>
      <div className="grid2" style={{ marginTop: 6 }}>
        <button className="btn ghost sm" onClick={copy}>Nusxalash</button>
        <a className="btn dark sm" href={telHref(phone)}><Icon name="phone" size={18} />Qo'ng'iroq</a>
      </div>
    </div>
  );
}

/** Ikki bosqichli tasdiqlash tugmasi (brauzer oynasisiz). */
export function ConfirmButton({ children, confirmText = "Rostdan ham?", onConfirm, className = "btn danger wide", disabled }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className={className} disabled={disabled} onClick={() => setAsk(true)}>{children}</button>;
  return (
    <div className="grid2" style={{ marginTop: 14 }}>
      <button className="btn ghost" onClick={() => setAsk(false)}>Yo'q</button>
      <button className="btn danger" disabled={disabled} onClick={async () => { setAsk(false); await onConfirm(); }}>{confirmText}</button>
    </div>
  );
}
