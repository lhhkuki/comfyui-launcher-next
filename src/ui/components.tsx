import { Search } from "lucide-react";
import type * as React from "react";

export function SectionTitle({ label, action }: { label: string; action?: React.ReactNode }) {
  return <div className="section-title"><span>{label}</span>{action}</div>;
}

export function Panel({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`.trim()}><div className="panel-title"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action && <div className="panel-action">{action}</div>}</div>{children}</section>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Toggle({ label, checked, onChange, title }: { label: string; checked: boolean; onChange(value: boolean): void; title?: string }) {
  return <button role="switch" aria-checked={checked} className={checked ? "toggle checked" : "toggle"} title={title} onClick={() => onChange(!checked)}><span />{label}</button>;
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" | "warn" }) {
  return <div className={`stat ${tone || ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

export function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" | "warn" }) {
  return <div className={`mini-stat ${tone || ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

export function InfoTile({ label, value }: { label: string; value: string }) {
  return <div className="info-tile"><span>{label}</span><strong title={value}>{value}</strong></div>;
}

export function DiffList({ title, items, tone }: { title: string; items: string[]; tone?: "ok" | "bad" | "warn" }) {
  return <div className={`diff-list ${tone || ""}`}><strong>{title}</strong><div>{items.length ? items.slice(0, 80).map((item) => <span key={item}>{item}</span>) : <em>无</em>}</div></div>;
}

export function SearchBox({ value, onChange, placeholder = "搜索" }: { value: string; onChange(value: string): void; placeholder?: string }) {
  return <label className="search"><Search size={15} /><input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
