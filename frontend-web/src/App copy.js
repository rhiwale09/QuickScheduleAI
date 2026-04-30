import React, { useState, useEffect } from "react";
import axios from "axios";

const API = process.env.REACT_APP_API_URL;

const blankRow = () => ({
  id: Date.now() + Math.random(),
  title: "",
  start: "",
  end: "",
  location: "",
  description: "",
  ambiguous: false,
  recurrence: null,
  manual: true,
});

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:wght@700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Sans', sans-serif;
    background: #f0f4f8;
    color: #1a1f2e;
    min-height: 100vh;
  }

  .app-shell { min-height: 100vh; background: linear-gradient(135deg, #f0f4f8 0%, #e8edf5 100%); }

  .header {
    background: linear-gradient(135deg, #1a1f2e 0%, #2d3561 100%);
    padding: 28px 40px;
    display: flex; align-items: center; gap: 16px;
    box-shadow: 0 4px 24px rgba(26,31,46,0.18);
  }
  .header-icon {
    width: 48px; height: 48px;
    background: linear-gradient(135deg, #4f8ef7, #7c5cf6);
    border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 24px;
    box-shadow: 0 4px 12px rgba(79,142,247,0.4);
  }
  .header-title { font-family: 'Playfair Display', serif; font-size: 26px; color: #fff; letter-spacing: -0.5px; }
  .header-sub { font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 2px; font-weight: 300; }
  .header-badge {
    margin-left: auto;
    background: rgba(79,142,247,0.2); border: 1px solid rgba(79,142,247,0.4);
    color: #7eb3ff; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 500;
  }

  .main { max-width: 1140px; margin: 0 auto; padding: 36px 24px 60px; }

  .card {
    background: #fff; border-radius: 16px; padding: 28px 32px; margin-bottom: 24px;
    box-shadow: 0 2px 16px rgba(26,31,46,0.07); border: 1px solid rgba(26,31,46,0.06);
    transition: box-shadow 0.2s;
  }
  .card:hover { box-shadow: 0 4px 28px rgba(26,31,46,0.11); }
  .card-google { border-left: 4px solid #4f8ef7; }
  .card-manual { border-left: 4px solid #a855f7; }
  .card-paste  { border-left: 4px solid #f59e0b; }
  .card-upload { border-left: 4px solid #22c55e; }
  .card-events { border-left: 4px solid #ef4444; }
  .card-info   { border-left: 4px solid #06b6d4; background: #f0fdfe; }

  .card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
  .card-label { font-size: 11px; font-weight: 600; letter-spacing: 1.2px; text-transform: uppercase; color: #8892a4; margin-bottom: 2px; }
  .card-title { font-size: 17px; font-weight: 600; color: #1a1f2e; }
  .pill { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; margin-left: auto; }
  .pill-blue   { background: #eff6ff; color: #2563eb; }
  .pill-green  { background: #f0fdf4; color: #16a34a; }
  .pill-yellow { background: #fffbeb; color: #d97706; }
  .pill-purple { background: #faf5ff; color: #7c3aed; }
  .pill-cyan   { background: #ecfeff; color: #0891b2; }

  .input-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

  input[type="email"], input[type="text"], textarea {
    font-family: 'DM Sans', sans-serif; font-size: 14px;
    padding: 10px 14px; border: 1.5px solid #e2e8f0; border-radius: 10px;
    background: #f8fafc; color: #1a1f2e; outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  input[type="email"]:focus, input[type="text"]:focus, textarea:focus {
    border-color: #4f8ef7; box-shadow: 0 0 0 3px rgba(79,142,247,0.12); background: #fff;
  }
  textarea { width: 100%; resize: vertical; min-height: 120px; }
  input[type="file"] { font-family: 'DM Sans', sans-serif; font-size: 13px; color: #4a5568; }

  .btn {
    font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
    padding: 10px 22px; border-radius: 10px; border: none; cursor: pointer;
    transition: all 0.18s; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap;
  }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn-primary { background: linear-gradient(135deg, #4f8ef7, #6366f1); color: #fff; box-shadow: 0 2px 10px rgba(79,142,247,0.35); }
  .btn-primary:hover:not(:disabled) { box-shadow: 0 4px 18px rgba(79,142,247,0.5); transform: translateY(-1px); }
  .btn-green { background: linear-gradient(135deg, #22c55e, #16a34a); color: #fff; box-shadow: 0 2px 10px rgba(34,197,94,0.3); }
  .btn-green:hover:not(:disabled) { transform: translateY(-1px); }
  .btn-yellow { background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; box-shadow: 0 2px 10px rgba(245,158,11,0.3); }
  .btn-yellow:hover:not(:disabled) { transform: translateY(-1px); }
  .btn-purple { background: linear-gradient(135deg, #a855f7, #7c3aed); color: #fff; box-shadow: 0 2px 10px rgba(168,85,247,0.3); }
  .btn-purple:hover:not(:disabled) { transform: translateY(-1px); }
  .btn-cyan { background: linear-gradient(135deg, #06b6d4, #0891b2); color: #fff; box-shadow: 0 2px 10px rgba(6,182,212,0.3); }
  .btn-cyan:hover:not(:disabled) { transform: translateY(-1px); }
  .btn-outline { background: #fff; color: #4a5568; border: 1.5px solid #e2e8f0; }
  .btn-outline:hover { background: #f8fafc; border-color: #cbd5e1; }
  .btn-danger { background: #fff0f0; color: #ef4444; border: 1.5px solid #fecaca; padding: 6px 10px; font-size: 13px; }
  .btn-danger:hover { background: #fef2f2; }
  .btn-ghost { background: #f1f5f9; color: #475569; font-size: 13px; padding: 7px 14px; }
  .btn-ghost:hover { background: #e2e8f0; }

  .connected-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: #f0fdf4; border: 1px solid #bbf7d0; color: #16a34a;
    padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 500;
  }

  /* ICS info box */
  .ics-info {
    background: #f0fdfe; border: 1px solid #a5f3fc; border-radius: 12px;
    padding: 16px 20px; margin-top: 14px;
  }
  .ics-info-title { font-size: 13px; font-weight: 600; color: #0891b2; margin-bottom: 8px; }
  .ics-steps { list-style: none; padding: 0; }
  .ics-steps li {
    font-size: 12px; color: #164e63; padding: 4px 0;
    display: flex; gap: 8px; align-items: flex-start;
  }
  .ics-steps li::before { content: '→'; color: #06b6d4; font-weight: 600; flex-shrink: 0; }
  .ics-platform { font-weight: 600; color: #0e7490; }

  /* Manual table */
  .manual-table { width: 100%; border-collapse: separate; border-spacing: 0 6px; font-size: 13px; }
  .manual-table thead th {
    font-size: 11px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase;
    color: #8892a4; padding: 8px 10px; text-align: left; border-bottom: 2px solid #f1f5f9;
  }
  .manual-table tbody tr { background: #f8fafc; }
  .manual-table tbody td { padding: 6px 8px; vertical-align: middle; }
  .manual-table tbody td:first-child { border-radius: 10px 0 0 10px; padding-left: 14px; }
  .manual-table tbody td:last-child  { border-radius: 0 10px 10px 0; padding-right: 10px; }
  .manual-table input[type="text"], .manual-table input[type="datetime-local"] {
    width: 100%; padding: 7px 10px; font-size: 12.5px; border-radius: 8px;
  }
  .row-num { font-size: 12px; font-weight: 600; color: #a0aec0; width: 24px; text-align: center; }

  /* Events table */
  .events-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; flex-wrap: wrap; gap: 12px; }
  .events-title { font-size: 18px; font-weight: 600; color: #1a1f2e; }
  .events-count { font-size: 13px; color: #8892a4; font-weight: 400; }

  .events-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .events-table thead tr { background: #f8fafc; border-bottom: 2px solid #e2e8f0; }
  .events-table thead th {
    padding: 12px 14px; text-align: left; font-size: 11px; font-weight: 600;
    letter-spacing: 0.8px; text-transform: uppercase; color: #64748b;
  }
  .events-table tbody tr { border-bottom: 1px solid #f1f5f9; transition: background 0.15s; }
  .events-table tbody tr:hover { background: #f8fafc; }
  .events-table tbody tr.manual-row { background: #fdf8ff; }
  .events-table tbody tr.manual-row:hover { background: #faf0ff; }
  .events-table tbody td { padding: 10px 14px; vertical-align: middle; }
  .events-table input[type="text"], .events-table input[type="datetime-local"] {
    width: 100%; padding: 6px 10px; font-size: 12.5px; border-radius: 8px;
  }
  .events-table input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: #4f8ef7; }

  .status-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 12px; white-space: nowrap; }
  .status-ok     { background: #f0fdf4; color: #16a34a; }
  .status-warn   { background: #fffbeb; color: #d97706; }
  .status-manual { background: #faf5ff; color: #7c3aed; }
  .status-upload { background: #f0fdf4; color: #15803d; }
  .status-paste  { background: #fffbeb; color: #b45309; }

  .source-tag {
    font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 8px;
    display: inline-block; margin-left: 4px;
  }
  .src-manual { background: #faf5ff; color: #7c3aed; }
  .src-paste  { background: #fffbeb; color: #d97706; }
  .src-upload { background: #f0fdf4; color: #16a34a; }

  .action-bar { display: flex; gap: 12px; margin-top: 24px; flex-wrap: wrap; align-items: center; }

  .success-msg {
    background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d;
    padding: 14px 20px; border-radius: 12px; font-weight: 500; margin-top: 20px;
    display: flex; align-items: center; gap: 10px;
  }

  .section-divider { display: flex; align-items: center; gap: 14px; margin: 8px 0 24px; }
  .section-divider span { font-size: 12px; color: #a0aec0; font-weight: 500; white-space: nowrap; }
  .section-divider::before, .section-divider::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }

  .hint { font-size: 12px; color: #94a3b8; margin-top: 6px; }

  .append-btn-row { display: flex; gap: 10px; margin-top: 14px; align-items: center; }
  .append-count { font-size: 12px; color: #10b981; font-weight: 500; }

  @media (max-width: 640px) {
    .header { padding: 20px; }
    .main { padding: 20px 16px 40px; }
    .card { padding: 20px 18px; }
    .header-badge { display: none; }
  }
`;

function App() {
  const [userEmail, setUserEmail] = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [file, setFile] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [manualRows, setManualRows] = useState([blankRow()]);
  const [showIcsGuide, setShowIcsGuide] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        await axios.post(`${API}/api/set-timezone`, { timeZone });
      } catch (e) {}
    })();
  }, []);

  // ── GOOGLE ──
  const handleGoogleConnect = () => {
    if (!userEmail) return alert("Please enter your Google email");
    const width = 500, height = 600;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    const popup = window.open(
      `${API}/auth/google?userEmail=${encodeURIComponent(userEmail)}`,
      "Connect Google Calendar",
      `width=${width},height=${height},left=${left},top=${top}`
    );
    window.addEventListener("message", function receiveMessage(event) {
      if (event.data.success) {
        setGoogleConnected(true);
        popup.close();
        window.removeEventListener("message", receiveMessage);
      }
    });
  };

  // ── APPEND HELPER ──
  const appendEvents = (newEvts, source) => {
    const tagged = newEvts.map((e) => ({ ...e, source }));
    const merged = [...events, ...tagged];
    setEvents(merged);
    setSelectedIds(merged.map((e) => e.id));
    return tagged.length;
  };

  // ── UPLOAD ──
  const handleUpload = async () => {
    if (!file) return alert("Please choose a file");
    const formData = new FormData();
    formData.append("file", file);
    try {
      setLoading(true); setMessage("");
      const res = await axios.post(`${API}/upload`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      const evts = res.data.events.map((e) => ({ ...e, selected: true }));
      const count = appendEvents(evts, "upload");
      setTextInput(res.data.rawText);
      setMessage(`${count} event(s) from document added to the table below.`);
      setFile(null);
    } catch (err) { alert("Upload failed. See console for details."); }
    finally { setLoading(false); }
  };

  // ── PARSE TEXT ──
  const handleParseText = async () => {
    if (!textInput.trim()) return alert("Please paste some text");
    try {
      setLoading(true); setMessage("");
      const res = await axios.post(`${API}/parse-text`, { text: textInput });
      const evts = res.data.events.map((e) => ({ ...e, selected: true }));
      const count = appendEvents(evts, "paste");
      setMessage(`${count} event(s) from text added to the table below.`);
      setTextInput("");
    } catch (err) { alert("Failed to parse text"); }
    finally { setLoading(false); }
  };

  // ── MANUAL ROWS ──
  const updateManualRow = (id, field, value) =>
    setManualRows(manualRows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const addManualRow = () => setManualRows([...manualRows, blankRow()]);
  const removeManualRow = (id) => { if (manualRows.length > 1) setManualRows(manualRows.filter((r) => r.id !== id)); };

  const handleAddManualEvents = () => {
    const filled = manualRows.filter((r) => r.title.trim() && r.start);
    if (filled.length === 0) return alert("Fill in at least a title and start date for one row");
    const normalized = filled.map((r) => ({
      ...r,
      source: "manual",
      start: new Date(r.start).toISOString(),
      end: r.end ? new Date(r.end).toISOString() : new Date(new Date(r.start).getTime() + 3600000).toISOString(),
      ambiguous: false,
    }));
    const merged = [...events, ...normalized];
    setEvents(merged);
    setSelectedIds(merged.map((e) => e.id));
    setManualRows([blankRow()]);
    setMessage(`${normalized.length} manual event(s) added to the table below.`);
  };

  // ── EVENT TABLE ──
  const updateEventTime = (id, field, value) =>
    setEvents(events.map((e) => e.id === id ? { ...e, [field]: new Date(value).toISOString(), ambiguous: false } : e));
  const updateField = (id, field, value) =>
    setEvents(events.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  const toggleSelect = (id) =>
    setSelectedIds(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  const toggleAll = () =>
    setSelectedIds(selectedIds.length === events.length ? [] : events.map((e) => e.id));
  const deleteEvent = (id) => {
    setEvents(events.filter((e) => e.id !== id));
    setSelectedIds(selectedIds.filter((x) => x !== id));
  };

  // ── CREATE CALENDAR ──
  const handleCreateEvents = async () => {
    if (!googleConnected) return alert("Please connect Google Calendar first");
    const selectedEvents = events.filter((e) => selectedIds.includes(e.id));
    if (selectedEvents.length === 0) return alert("Please select at least one event");
    try {
      setLoading(true);
      const res = await axios.post(`${API}/create-events`, { events: selectedEvents, userEmail });
      setMessage(res.data.message);
      setEvents([]); setTextInput(""); setFile(null); setSelectedIds([]);
    } catch (err) { alert("Failed to create events"); }
    finally { setLoading(false); }
  };

  // ── EXPORT ICS ──
  const handleExportICS = async () => {
    const selectedEvents = events.filter((e) => selectedIds.includes(e.id));
    if (selectedEvents.length === 0) return alert("Please select at least one event");
    try {
      const res = await axios.post(`${API}/export-ics`, { events: selectedEvents }, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url; link.setAttribute("download", "events.ics");
      document.body.appendChild(link); link.click(); link.remove();
      setShowIcsGuide(true);
    } catch (err) { alert("Failed to export .ics file"); }
  };

  const sortedEvents = [...events].sort((a, b) => new Date(a.start) - new Date(b.start));

  const sourceTag = (src) => {
    if (src === "manual") return <span className="source-tag src-manual">manual</span>;
    if (src === "paste")  return <span className="source-tag src-paste">text scan</span>;
    if (src === "upload") return <span className="source-tag src-upload">upload</span>;
    return null;
  };

  return (
    <>
      <style>{styles}</style>
      <div className="app-shell">

        {/* HEADER */}
        <header className="header">
          <div className="header-icon">📅</div>
          <div>
            <div className="header-title">QuickScheduleAI</div>
            <div className="header-sub">Smart calendar event extraction & scheduling</div>
          </div>
          <div className="header-badge">AI-Powered</div>
        </header>

        <main className="main">

          {/* STEP 1 — GOOGLE CONNECT */}
          <div className="card card-google">
            <div className="card-header">
              <div>
                <div className="card-label">Step 1 — Optional</div>
                <div className="card-title">Connect Google Calendar</div>
              </div>
              <span className="pill pill-blue">OAuth2</span>
            </div>
            <div className="input-row">
              <input type="email" placeholder="your@gmail.com" value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)} style={{ width: 280 }} />
              {googleConnected
                ? <span className="connected-badge">✅ Google Calendar connected</span>
                : <button className="btn btn-primary" onClick={handleGoogleConnect}>🔗 Connect Google Calendar</button>
              }
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              Don't have Google Calendar or prefer not to connect?  No problem — add your events below, then use the
              <strong> Export .ics File</strong> button at the bottom to download and import into Google, Outlook, Apple Calendar, or any calendar app.
            </p>
          </div>

          <div className="section-divider"><span>Step 2 — Add your events using any or all methods below</span></div>

          {/* OPTION A — MANUAL ENTRY */}
          <div className="card card-manual">
            <div className="card-header">
              <div>
                <div className="card-label">Option A</div>
                <div className="card-title">Enter events manually</div>
              </div>
              <span className="pill pill-purple">Row by row</span>
            </div>
            <p className="hint" style={{ marginBottom: 16 }}>
              Type events directly. Title and start date required. End time defaults to +1 hour if empty. Blank rows are ignored.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="manual-table">
                <thead>
                  <tr>
                    <th>#</th><th>Title *</th><th>Start *</th><th>End</th>
                    <th>Location</th><th>Notes</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {manualRows.map((row, idx) => (
                    <tr key={row.id}>
                      <td><span className="row-num">{idx + 1}</span></td>
                      <td><input type="text" value={row.title} placeholder="Event title"
                        onChange={(e) => updateManualRow(row.id, "title", e.target.value)} /></td>
                      <td><input type="datetime-local" value={row.start}
                        onChange={(e) => updateManualRow(row.id, "start", e.target.value)} /></td>
                      <td><input type="datetime-local" value={row.end}
                        onChange={(e) => updateManualRow(row.id, "end", e.target.value)} /></td>
                      <td><input type="text" value={row.location} placeholder="Room / link"
                        onChange={(e) => updateManualRow(row.id, "location", e.target.value)} /></td>
                      <td><input type="text" value={row.description} placeholder="Optional notes"
                        onChange={(e) => updateManualRow(row.id, "description", e.target.value)} /></td>
                      <td><button className="btn btn-danger" onClick={() => removeManualRow(row.id)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="append-btn-row">
              <button className="btn btn-ghost" onClick={addManualRow}>+ Add row</button>
              <button className="btn btn-purple" onClick={handleAddManualEvents}>
                Add to event table ↓
              </button>
            </div>
          </div>

          {/* OPTION B — PASTE TEXT */}
          <div className="card card-paste">
            <div className="card-header">
              <div>
                <div className="card-label">Option B</div>
                <div className="card-title">Scan email or text with AI</div>
              </div>
              <span className="pill pill-yellow">Text scan</span>
            </div>
            <textarea value={textInput} onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste your email, meeting invite, or any text with dates and times. AI will extract all events automatically..." />
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-yellow" onClick={handleParseText} disabled={loading}>
                {loading ? "⏳ Scanning..." : "✨ Scan & Add to Table"}
              </button>
            </div>
            <p className="hint">Extracted events are appended to the event table below — existing events are kept.</p>
          </div>

          {/* OPTION C — UPLOAD DOCS */}
          <div className="card card-upload">
            <div className="card-header">
              <div>
                <div className="card-label">Option C</div>
                <div className="card-title">Upload a document</div>
              </div>
              <span className="pill pill-green">PDF · DOCX · Image</span>
            </div>
            <div className="input-row">
              <input type="file" accept=".txt,.pdf,.doc,.docx,.png,.jpg,.jpeg,.PNG,.JPG,.JPEG,.DOC,.DOCX"
                onChange={(e) => setFile(e.target.files[0])} />
              <button className="btn btn-green" onClick={handleUpload} disabled={loading}>
                {loading ? "⏳ Processing..." : "⬆ Upload & Add to Table"}
              </button>
            </div>
            <p className="hint">AI scans the document and appends all found events to the table below — existing events are kept.</p>
          </div>

          {/* SUCCESS MESSAGE */}
          {message && (
            <div className="success-msg">✅ {message}</div>
          )}

          {/* EVENTS TABLE */}
          {sortedEvents.length > 0 && (
            <div className="card card-events">
              <div className="events-header">
                <div>
                  <div className="events-title">
                    All Events
                    <span className="events-count"> — {sortedEvents.length} total</span>
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={toggleAll}>
                  {selectedIds.length === events.length ? "Deselect all" : "Select all"}
                </button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="events-table">
                  <thead>
                    <tr>
                      <th>✓</th><th>Title</th><th>Start</th><th>End</th>
                      <th>Location</th><th>Source</th><th>Status</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEvents.map((e) => (
                      <tr key={e.id} className={e.source === "manual" ? "manual-row" : ""}>
                        <td><input type="checkbox" checked={selectedIds.includes(e.id)} onChange={() => toggleSelect(e.id)} /></td>
                        <td><input type="text" value={e.title} onChange={(ev) => updateField(e.id, "title", ev.target.value)} /></td>
                        <td>
                          {e.ambiguous
                            ? <input type="datetime-local" onChange={(ev) => updateEventTime(e.id, "start", ev.target.value)} />
                            : <span style={{ fontSize: 12, color: "#4a5568" }}>{new Date(e.start).toLocaleString()}</span>}
                        </td>
                        <td>
                          {e.ambiguous
                            ? <input type="datetime-local" onChange={(ev) => updateEventTime(e.id, "end", ev.target.value)} />
                            : <span style={{ fontSize: 12, color: "#4a5568" }}>{new Date(e.end).toLocaleString()}</span>}
                        </td>
                        <td><input type="text" value={e.location || ""} placeholder="—"
                          onChange={(ev) => updateField(e.id, "location", ev.target.value)} /></td>
                        <td>{sourceTag(e.source)}</td>
                        <td>
                          {e.ambiguous
                            ? <span className="status-badge status-warn">⚠ Fix time</span>
                            : <span className="status-badge status-ok">✓ Ready</span>}
                        </td>
                        <td><button className="btn btn-danger" onClick={() => deleteEvent(e.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ACTION BAR */}
              <div className="action-bar">
                <button className="btn btn-primary" onClick={handleCreateEvents} disabled={loading || !googleConnected}
                  title={!googleConnected ? "Connect Google Calendar first" : ""}>
                  {loading ? "⏳ Creating..." : "📅 Create Calendar Events"}
                </button>
                <button className="btn btn-cyan" onClick={handleExportICS}>
                  💾 Export .ics File
                </button>
                <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>
                  {selectedIds.length} of {events.length} selected
                </span>
              </div>

              {/* GOOGLE NOT CONNECTED HINT */}
              {!googleConnected && (
                <p style={{ fontSize: 12, color: "#f59e0b", marginTop: 10, fontWeight: 500 }}>
                  ⚠ Google Calendar not connected — use <strong>Export .ics File</strong> to download your events and import them manually.
                </p>
              )}

              {/* ICS IMPORT GUIDE — shown after export */}
              {showIcsGuide && (
                <div className="ics-info" style={{ marginTop: 18 }}>
                  <div className="ics-info-title">📥 How to import your events.ics file</div>
                  <ul className="ics-steps">
                    <li><span><span className="ics-platform">Google Calendar:</span> Open calendar.google.com → Settings (gear) → Import & Export → Import → select events.ics → Import</span></li>
                    <li><span><span className="ics-platform">Outlook (web):</span> Open outlook.com → Calendar → Add calendar → Upload from file → select events.ics</span></li>
                    <li><span><span className="ics-platform">Apple Calendar (Mac):</span> Open Calendar app → File → Import → select events.ics</span></li>
                    <li><span><span className="ics-platform">Apple Calendar (iPhone):</span> AirDrop or email the .ics file to yourself → tap the file → tap Add All Events</span></li>
                    <li><span><span className="ics-platform">Yahoo Calendar:</span> Open Yahoo Calendar → Actions → Import events → select events.ics</span></li>
                  </ul>
                  <button className="btn btn-ghost" style={{ marginTop: 12, fontSize: 12 }} onClick={() => setShowIcsGuide(false)}>
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )}

        </main>
      </div>
    </>
  );
}

export default App;