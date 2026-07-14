import { useState, useRef, useEffect } from "react";
import {
  IconPlus, IconList, IconDownload, IconPrinter,
  IconCheck, IconEdit, IconTrash, IconClipboardText,
  IconX, IconUpload, IconFilter, IconChevronDown
} from "@tabler/icons-react";

const KOERPERTEILE = [
  "Kopf","Nacken","Schulter links","Schulter rechts","Arm links","Arm rechts",
  "Brust","Rücken oben","Rücken unten","Bauch","Hüfte links","Hüfte rechts",
  "Bein links","Bein rechts","Knie links","Knie rechts","Fuß links","Fuß rechts",
  "Hand links","Hand rechts","Sonstiges"
];

const BEEINTRAECHTIGUNGEN = ["Schlaf","Arbeit","Bewegung","Konzentration","Stimmung"];

const SCHMERZCHARAKTER_DEFAULT = ["ziehend", "drückend"];

interface Entry {
  id: number;
  datetime: string;
  intensity: number;
  koerperteile: string[];
  schmerzcharakter: string;
  medikation: string;
  beeintraechtigung: string[];
  kommentar: string;
}

interface Filter {
  dateFrom: string;
  dateTo: string;
  intensityMin: number;
  intensityMax: number;
  beeintraechtigung: string;
}

const intensityColor = (v: number) => {
  if (v <= 3) return { bg: "#eaf3de", text: "#3B6D11", border: "#97C459" };
  if (v <= 6) return { bg: "#FAEEDA", text: "#854F0B", border: "#EF9F27" };
  return { bg: "#FCEBEB", text: "#A32D2D", border: "#E24B4A" };
};

const nowStr = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE") + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
};

const emptyForm = (): Omit<Entry, "id"> => ({
  datetime: nowStr(), intensity: 5, koerperteile: [],
  schmerzcharakter: "", medikation: "", beeintraechtigung: [], kommentar: ""
});

const emptyFilter = (): Filter => ({
  dateFrom: "", dateTo: "", intensityMin: 1, intensityMax: 10, beeintraechtigung: ""
});

const apiFetch = (path: string, options?: RequestInit) =>
  fetch(path, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });

export default function App() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [view, setView] = useState<"form" | "table">("form");
  const [editId, setEditId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>(emptyFilter());
  const [showFilter, setShowFilter] = useState(false);
  const [showKtDropdown, setShowKtDropdown] = useState(false);
  const [showBtDropdown, setShowBtDropdown] = useState(false);
  const [schmerzcharakterOptionen, setSchmerzcharakterOptionen] = useState<string[]>(SCHMERZCHARAKTER_DEFAULT);
  const [showAddCharakter, setShowAddCharakter] = useState(false);
  const [newCharakter, setNewCharakter] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/entries").then(r => r.json()),
      apiFetch("/api/charakter").then(r => r.json()),
    ]).then(([loadedEntries, loadedCharakter]) => {
      setEntries(loadedEntries);
      setSchmerzcharakterOptionen(loadedCharakter);
      if (loadedEntries.length > 0) setView("table");
    }).catch(() => setApiError(true)).finally(() => setLoading(false));
  }, []);

  const addCharakter = () => {
    const val = newCharakter.trim();
    if (!val || schmerzcharakterOptionen.includes(val)) return;
    const updated = [...schmerzcharakterOptionen, val];
    setSchmerzcharakterOptionen(updated);
    apiFetch("/api/charakter", { method: "PUT", body: JSON.stringify(updated) });
    setF("schmerzcharakter", val);
    setNewCharakter("");
    setShowAddCharakter(false);
  };

  const setF = (k: keyof typeof form, v: string | number | string[]) =>
    setForm(f => ({ ...f, [k]: v }));

  const toggleKoerperteil = (kt: string) => {
    const cur = form.koerperteile;
    setF("koerperteile", cur.includes(kt) ? cur.filter(k => k !== kt) : [...cur, kt]);
  };

  const toggleBeeintraechtigung = (b: string) => {
    const cur = form.beeintraechtigung as string[];
    setF("beeintraechtigung", cur.includes(b) ? cur.filter(x => x !== b) : [...cur, b]);
  };

  const save = async () => {
    setSaveError(null);
    try {
      if (editId !== null) {
        const updated = { ...form, id: editId };
        const res = await apiFetch(`/api/entries/${editId}`, { method: "PUT", body: JSON.stringify(updated) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setEntries(entries.map(e => e.id === editId ? updated : e));
      } else {
        const newEntry = { ...form, id: Date.now() };
        const res = await apiFetch("/api/entries", { method: "POST", body: JSON.stringify(newEntry) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setEntries([...entries, newEntry]);
      }
      setEditId(null);
      setForm(emptyForm());
      setView("table");
    } catch (err) {
      setSaveError(`Fehler beim Speichern: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`);
    }
  };

  const del = async (id: number) => {
    await apiFetch(`/api/entries/${id}`, { method: "DELETE" });
    setEntries(entries.filter(e => e.id !== id));
  };

  const startEdit = (e: Entry) => {
    setForm({ ...e });
    setEditId(e.id);
    setView("form");
  };

  const cancelEdit = () => { setEditId(null); setForm(emptyForm()); setView("table"); };

  const setFlt = (k: keyof Filter, v: string | number) =>
    setFilter(f => ({ ...f, [k]: v }));

  const isFilterActive = filter.dateFrom || filter.dateTo ||
    filter.intensityMin > 1 || filter.intensityMax < 10 || filter.beeintraechtigung;

  const filtered = [...entries]
    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
    .filter(e => {
      if (filter.dateFrom && e.datetime < filter.dateFrom) return false;
      if (filter.dateTo && e.datetime > filter.dateTo + "T23:59") return false;
      if (e.intensity < filter.intensityMin || e.intensity > filter.intensityMax) return false;
      if (filter.beeintraechtigung && !(e.beeintraechtigung as string[]).includes(filter.beeintraechtigung)) return false;
      return true;
    });

  const exportCSV = () => {
    const header = "Datum/Uhrzeit,Schmerzintensität,Körperteile,Schmerzcharakter,Medikation,Beeinträchtigung,Kommentar";
    const rows = filtered.map(e =>
      [fmtDate(e.datetime), e.intensity,
        `"${e.koerperteile.join("; ")}"`,
        e.schmerzcharakter ?? "", e.medikation, `"${(e.beeintraechtigung as string[]).join("; ")}"`, `"${e.kommentar}"`].join(",")
    );
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "schmerzprotokoll.csv";
    a.click();
  };

  const importCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const lines = (ev.target?.result as string).split("\n").slice(1).filter(Boolean);
        const imported: Entry[] = lines.map((line, i) => {
          const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) ?? [];
          const get = (n: number) => (cols[n] ?? "").replace(/^"|"$/g, "").trim();
          const rawDate = get(0);
          const [datePart, timePart] = rawDate.split(" ");
          const [d, m, y] = datePart.split(".");
          const datetime = `${y}-${m?.padStart(2,"0")}-${d?.padStart(2,"0")}T${timePart ?? "00:00"}`;
          return {
            id: Date.now() + i,
            datetime,
            intensity: Math.min(10, Math.max(1, Number(get(1)) || 5)),
            koerperteile: get(2).split(";").map(s => s.trim()).filter(Boolean),
            schmerzcharakter: get(3),
            medikation: get(4),
            beeintraechtigung: get(5).split(";").map(s => s.trim()).filter(s => s && s !== "Keine"),
            kommentar: get(6),
          };
        });
        await Promise.all(imported.map(entry =>
          apiFetch("/api/entries", { method: "POST", body: JSON.stringify(entry) })
        ));
        setEntries(prev => [...prev, ...imported]);
        setView("table");
        alert(`${imported.length} Einträge erfolgreich importiert.`);
      } catch { alert("Fehler beim Importieren. Bitte prüfe das CSV-Format."); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const ic = intensityColor(form.intensity);

  if (loading) return (
    <div style={{ fontFamily: "sans-serif", padding: "4rem 1rem", textAlign: "center", color: "#aaa" }}>
      Lade Daten…
    </div>
  );

  if (apiError) return (
    <div style={{ fontFamily: "sans-serif", padding: "4rem 1rem", textAlign: "center", color: "#c0392b" }}>
      <p style={{ fontSize: 16, fontWeight: 500 }}>API nicht erreichbar</p>
      <p style={{ fontSize: 13, color: "#888", marginTop: 8 }}>Backend antwortet nicht. Bitte prüfe ob der Stack läuft.</p>
      <button style={{ marginTop: 16, padding: "8px 18px", borderRadius: 6, border: "1px solid #ccc",
        background: "#f4f4f2", cursor: "pointer", fontFamily: "inherit" }}
        onClick={() => window.location.reload()}>
        Erneut versuchen
      </button>
    </div>
  );

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem 1rem", maxWidth: 820, margin: "0 auto" }}>
      <style>{`
        @media print { .no-print { display: none !important; } body { background: white; } }
        input[type=text], input[type=datetime-local], input[type=date], select, textarea {
          font-family: inherit; font-size: 14px; border: 1px solid #ccc;
          border-radius: 6px; padding: 7px 10px; background: #fff;
          color: #222; outline: none; width: 100%; box-sizing: border-box;
        }
        input:focus, select:focus, textarea:focus { border-color: #888; }
        .btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 7px 14px; font-size: 13px; font-family: inherit;
          border: 1px solid #ccc; border-radius: 6px;
          background: #f4f4f2; color: #222; cursor: pointer; white-space: nowrap;
        }
        .btn:hover { background: #e8e8e5; }
        .btn-primary { background: #222; color: #fff; border-color: #222; }
        .btn-primary:hover { background: #444; }
        .btn-ghost { background: transparent; border-color: transparent; padding: 4px 6px; }
        .btn-ghost:hover { background: #f0f0ee; }
        .btn-active { background: #222; color: #fff; border-color: #222; }
        tr.entry-row:hover td { background: #f9f9f7; }
        .kt-option {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 10px; cursor: pointer; font-size: 13px; white-space: nowrap;
        }
        .kt-option:hover { background: #f4f4f2; }
        .kt-checkbox {
          width: 15px; height: 15px; border: 1px solid #ccc;
          border-radius: 3px; display: flex; align-items: center;
          justify-content: center; flex-shrink: 0;
        }
        .kt-checkbox.checked { background: #222; border-color: #222; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: 8 }} className="no-print">
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500 }}>Schmerzprotokoll</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#666" }}>
            {filtered.length !== entries.length
              ? `${filtered.length} von ${entries.length} Einträgen`
              : `${entries.length} ${entries.length === 1 ? "Eintrag" : "Einträge"}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => { setEditId(null); setForm(emptyForm()); setView("form"); }}>
            <IconPlus size={15} /> Neu
          </button>
          <button className={`btn ${view === "table" ? "btn-active" : ""}`} onClick={() => setView("table")}>
            <IconList size={15} /> Tabelle
          </button>
          <button className={`btn ${showFilter ? "btn-active" : ""}`} onClick={() => setShowFilter(s => !s)}>
            <IconFilter size={15} /> Filter{isFilterActive ? " ●" : ""}
          </button>
          {entries.length > 0 && <>
            <button className="btn" onClick={exportCSV}>
              <IconDownload size={15} /> CSV Export
            </button>
            <button className="btn" onClick={() => window.print()}>
              <IconPrinter size={15} /> Drucken
            </button>
          </>}
          <label className="btn" style={{ cursor: "pointer" }}>
            <IconUpload size={15} /> CSV Import
            <input type="file" accept=".csv" onChange={importCSV} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilter && (
        <div style={{ background: "#fff", border: "1px solid #e0e0dc", borderRadius: 10, padding: "1.25rem", marginBottom: "1.25rem" }} className="no-print">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Filter</span>
            {isFilterActive && (
              <button className="btn btn-ghost" onClick={() => setFilter(emptyFilter())} style={{ fontSize: 12, color: "#c0392b" }}>
                <IconX size={13} /> Zurücksetzen
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Datum von</label>
              <input type="date" value={filter.dateFrom} onChange={e => setFlt("dateFrom", e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Datum bis</label>
              <input type="date" value={filter.dateTo} onChange={e => setFlt("dateTo", e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Beeinträchtigung</label>
              <select value={filter.beeintraechtigung} onChange={e => setFlt("beeintraechtigung", e.target.value)}>
                <option value="">Alle</option>
                {BEEINTRAECHTIGUNGEN.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 6 }}>
                Intensität: {filter.intensityMin} – {filter.intensityMax}
              </label>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#aaa" }}>1</span>
                <input type="range" min="1" max="10" step="1" value={filter.intensityMin}
                  onChange={e => setFlt("intensityMin", Math.min(Number(e.target.value), filter.intensityMax))}
                  style={{ flex: 1, border: "none", padding: 0, background: "transparent" }} />
                <span style={{ fontSize: 12, color: "#aaa" }}>–</span>
                <input type="range" min="1" max="10" step="1" value={filter.intensityMax}
                  onChange={e => setFlt("intensityMax", Math.max(Number(e.target.value), filter.intensityMin))}
                  style={{ flex: 1, border: "none", padding: 0, background: "transparent" }} />
                <span style={{ fontSize: 12, color: "#aaa" }}>10</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      {view === "form" && (
        <div style={{ background: "#fff", border: "1px solid #e0e0dc", borderRadius: 10, padding: "1.5rem" }} className="no-print">
          <h2 style={{ margin: "0 0 1.25rem", fontSize: 15, fontWeight: 500, color: "#555" }}>
            {editId !== null ? "Eintrag bearbeiten" : "Neuer Eintrag"}
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Datum & Uhrzeit</label>
              <input type="datetime-local" value={form.datetime} onChange={e => setF("datetime", e.target.value)} />
            </div>

            {/* Multi-Select Körperteile */}
            <div style={{ position: "relative" }}>
              <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>
                Körperteile {form.koerperteile.length > 0 && <span style={{ color: "#888" }}>({form.koerperteile.length} ausgewählt)</span>}
              </label>
              <button type="button" onClick={() => setShowKtDropdown(s => !s)}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 10px", border: "1px solid #ccc", borderRadius: 6,
                  background: "#fff", cursor: "pointer", fontSize: 14, fontFamily: "inherit", color: "#222" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }}>
                  {form.koerperteile.length === 0 ? "Bitte wählen..." : form.koerperteile.join(", ")}
                </span>
                <IconChevronDown size={14} color="#888" />
              </button>
              {showKtDropdown && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                  background: "#fff", border: "1px solid #ccc", borderRadius: 6,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.1)", maxHeight: 260, overflowY: "auto", marginTop: 2 }}>
                  {KOERPERTEILE.map(kt => (
                    <div key={kt} className="kt-option" onClick={() => toggleKoerperteil(kt)}>
                      <div className={`kt-checkbox${form.koerperteile.includes(kt) ? " checked" : ""}`}>
                        {form.koerperteile.includes(kt) && <IconCheck size={10} color="#fff" />}
                      </div>
                      {kt}
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid #eee", padding: "6px 10px" }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12, color: "#c0392b", padding: "4px 6px" }}
                      onClick={() => { setF("koerperteile", []); setShowKtDropdown(false); }}>
                      <IconX size={12} /> Auswahl leeren
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 6px", marginLeft: 4 }}
                      onClick={() => setShowKtDropdown(false)}>
                      <IconCheck size={12} /> Fertig
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 6 }}>
                Schmerzintensität &nbsp;
                <span style={{ padding: "2px 10px", borderRadius: 6, fontSize: 13, fontWeight: 500,
                  background: ic.bg, color: ic.text, border: `1px solid ${ic.border}` }}>
                  {form.intensity} / 10
                </span>
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>Kein Schmerz</span>
                <input type="range" min="1" max="10" step="1" value={form.intensity}
                  onChange={e => setF("intensity", Number(e.target.value))}
                  style={{ flex: 1, width: "auto", border: "none", padding: 0, background: "transparent" }} />
                <span style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>Stärkster Schmerz</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aaa",
                marginTop: 2, paddingLeft: 84, paddingRight: 90 }}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => <span key={n}>{n}</span>)}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Medikation</label>
              <input type="text" placeholder="z.B. Ibuprofen 400mg" value={form.medikation}
                onChange={e => setF("medikation", e.target.value)} />
            </div>

            <div>
              <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Schmerzcharakter</label>
              <select value={form.schmerzcharakter} onChange={e => setF("schmerzcharakter", e.target.value)}>
                <option value="">Bitte wählen…</option>
                {schmerzcharakterOptionen.map(o => <option key={o}>{o}</option>)}
              </select>
              {showAddCharakter ? (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <input type="text" placeholder="Neue Option…" value={newCharakter}
                    onChange={e => setNewCharakter(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addCharakter()}
                    style={{ flex: 1 }} />
                  <button className="btn" onClick={addCharakter} title="Hinzufügen">
                    <IconPlus size={13} />
                  </button>
                  <button className="btn btn-ghost" onClick={() => { setShowAddCharakter(false); setNewCharakter(""); }}>
                    <IconX size={13} />
                  </button>
                </div>
              ) : (
                <button className="btn btn-ghost" style={{ marginTop: 4, fontSize: 12 }}
                  onClick={() => setShowAddCharakter(true)}>
                  <IconPlus size={12} /> Option hinzufügen
                </button>
              )}
            </div>

            {/* Multi-Select Beeinträchtigung */}
            <div style={{ position: "relative" }}>
              <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>
                Beeinträchtigung {(form.beeintraechtigung as string[]).length > 0 && <span style={{ color: "#888" }}>(({(form.beeintraechtigung as string[]).length} ausgewählt)</span>}
              </label>
              <button type="button" onClick={() => setShowBtDropdown(s => !s)}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 10px", border: "1px solid #ccc", borderRadius: 6,
                  background: "#fff", cursor: "pointer", fontSize: 14, fontFamily: "inherit", color: "#222" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }}>
                  {(form.beeintraechtigung as string[]).length === 0 ? "Keine" : (form.beeintraechtigung as string[]).join(", ")}
                </span>
                <IconChevronDown size={14} color="#888" />
              </button>
              {showBtDropdown && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                  background: "#fff", border: "1px solid #ccc", borderRadius: 6,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.1)", marginTop: 2 }}>
                  {BEEINTRAECHTIGUNGEN.map(b => (
                    <div key={b} className="kt-option" onClick={() => toggleBeeintraechtigung(b)}>
                      <div className={`kt-checkbox${(form.beeintraechtigung as string[]).includes(b) ? " checked" : ""}`}>
                        {(form.beeintraechtigung as string[]).includes(b) && <IconCheck size={10} color="#fff" />}
                      </div>
                      {b}
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid #eee", padding: "6px 10px" }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12, color: "#c0392b", padding: "4px 6px" }}
                      onClick={() => { setF("beeintraechtigung", []); setShowBtDropdown(false); }}>
                      <IconX size={12} /> Auswahl leeren
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 6px", marginLeft: 4 }}
                      onClick={() => setShowBtDropdown(false)}>
                      <IconCheck size={12} /> Fertig
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Kommentar</label>
              <textarea placeholder="Freier Kommentar..." value={form.kommentar}
                onChange={e => setF("kommentar", e.target.value)} rows={3}
                style={{ resize: "vertical" }} />
            </div>
          </div>

          {saveError && (
            <div style={{ marginTop: "1rem", padding: "8px 12px", borderRadius: 6,
              background: "#FCEBEB", color: "#A32D2D", border: "1px solid #E24B4A", fontSize: 13 }}>
              {saveError}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: "1.25rem", justifyContent: "flex-end" }}>
            {editId !== null && (
              <button className="btn" onClick={cancelEdit}><IconX size={14} /> Abbrechen</button>
            )}
            <button className="btn btn-primary" onClick={save}>
              <IconCheck size={14} /> {editId !== null ? "Speichern" : "Eintrag hinzufügen"}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {view === "table" && (
        <div ref={tableRef}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#aaa" }} className="no-print">
              <IconClipboardText size={40} style={{ marginBottom: 12 }} />
              <p>{entries.length === 0 ? 'Noch keine Einträge. Klicke auf „Neu" um zu beginnen.' : "Keine Einträge entsprechen dem Filter."}</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f4f4f2", borderBottom: "1px solid #e0e0dc" }}>
                    {["Datum / Uhrzeit","Intensität","Körperteile","Charakter","Medikation","Beeintr.","Kommentar",""].map((h, i) => (
                      <th key={i} style={{ textAlign: "left", padding: "8px 10px", fontWeight: 500,
                        fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => {
                    const c = intensityColor(e.intensity);
                    return (
                      <tr key={e.id} className="entry-row" style={{ borderBottom: "1px solid #f0f0ee" }}>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: "#666" }}>{fmtDate(e.datetime)}</td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 6,
                            background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                            fontWeight: 500, fontSize: 12 }}>{e.intensity}/10</span>
                        </td>
                        <td style={{ padding: "8px 10px", maxWidth: 180 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                            {(e.koerperteile ?? []).map(kt => (
                              <span key={kt} style={{ fontSize: 11, padding: "1px 7px", borderRadius: 4,
                                background: "#f0f0ee", color: "#555", border: "1px solid #e0e0dc" }}>{kt}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap", color: e.schmerzcharakter ? "#222" : "#bbb" }}>
                          {e.schmerzcharakter || "–"}
                        </td>
                        <td style={{ padding: "8px 10px", color: e.medikation ? "#222" : "#bbb" }}>
                          {e.medikation || "–"}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          {(e.beeintraechtigung as string[]).length > 0
                            ? <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                {(e.beeintraechtigung as string[]).map(b => (
                                  <span key={b} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5,
                                    background: "#FAEEDA", color: "#854F0B", border: "1px solid #EF9F27", whiteSpace: "nowrap" }}>
                                    {b}</span>
                                ))}
                              </div>
                            : <span style={{ color: "#bbb" }}>–</span>}
                        </td>
                        <td style={{ padding: "8px 10px", maxWidth: 180, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#666" }}>
                          {e.kommentar || "–"}
                        </td>
                        <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }} className="no-print">
                          <button className="btn btn-ghost" onClick={() => startEdit(e)} title="Bearbeiten">
                            <IconEdit size={15} color="#888" />
                          </button>
                          <button className="btn btn-ghost" onClick={() => del(e.id)} title="Löschen">
                            <IconTrash size={15} color="#c0392b" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div style={{ marginTop: "1.25rem", display: "flex", gap: 12, flexWrap: "wrap" }} className="no-print">
              {[
                { label: "Einträge", val: filtered.length },
                { label: "Ø Intensität", val: (filtered.reduce((s, e) => s + e.intensity, 0) / filtered.length).toFixed(1) },
                { label: "Max. Intensität", val: Math.max(...filtered.map(e => e.intensity)) },
              ].map(m => (
                <div key={m.label} style={{ background: "#f4f4f2", borderRadius: 8, padding: "10px 18px", minWidth: 90 }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{m.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 500 }}>{m.val}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
