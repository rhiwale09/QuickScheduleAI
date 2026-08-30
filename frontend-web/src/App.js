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
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:wght@600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', sans-serif;
    background: #f4f6fb;
    color: #1e2433;
    min-height: 100vh;
    font-size: 15px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  .app-shell { min-height: 100vh; }

  .header {
    background: linear-gradient(135deg, #1a2240 0%, #283779 100%);
    padding: 24px 40px;
    display: flex; align-items: center; gap: 16px;
    box-shadow: 0 4px 24px rgba(26,34,64,0.22);
  }
  .header-icon {
    width: 50px; height: 50px;
    background: linear-gradient(135deg, #4b82f5, #7c5cf6);
    border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 26px;
    box-shadow: 0 4px 14px rgba(75,130,245,0.45);
    flex-shrink: 0;
  }
  .header-title {
    font-family: 'Lora', serif;
    font-size: 24px; font-weight: 700;
    color: #ffffff; letter-spacing: -0.3px;
  }
  .header-sub {
    font-size: 13px; color: rgba(255,255,255,0.55);
    margin-top: 2px; font-weight: 400;
  }
  .header-badge {
    margin-left: auto;
    background: rgba(75,130,245,0.18); border: 1px solid rgba(75,130,245,0.4);
    color: #93b8fc; padding: 5px 14px; border-radius: 20px;
    font-size: 12px; font-weight: 600; letter-spacing: 0.5px;
  }

  .main { max-width: 1160px; margin: 0 auto; padding: 36px 24px 80px; }

  .card {
    background: #ffffff; border-radius: 14px; padding: 26px 30px; margin-bottom: 20px;
    box-shadow: 0 1px 12px rgba(26,34,64,0.07), 0 4px 24px rgba(26,34,64,0.04);
    border: 1px solid rgba(26,34,64,0.07);
    transition: box-shadow 0.2s;
  }
  .card:hover { box-shadow: 0 4px 24px rgba(26,34,64,0.12); }
  .card-manual { border-left: 4px solid #8b5cf6; }
  .card-paste  { border-left: 4px solid #f59e0b; }
  .card-upload { border-left: 4px solid #10b981; }
  .card-events { border-left: 4px solid #3b82f6; }
  .card-google { border-left: 4px solid #4b82f5; background: #fafbff; }
  .card-actions { border-left: 4px solid #ef4444; background: #fffafa; }

  .card-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 16px; }
  .card-label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #9aa3b8; margin-bottom: 3px; }
  .card-title { font-size: 16px; font-weight: 600; color: #1e2433; line-height: 1.3; }
  .card-desc { font-size: 13px; color: #6b7591; margin-top: 2px; }
  .pill { font-size: 11px; font-weight: 600; padding: 3px 11px; border-radius: 20px; margin-left: auto; flex-shrink: 0; letter-spacing: 0.3px; }
  .pill-purple { background: #f3f0ff; color: #6d28d9; }
  .pill-yellow { background: #fffbeb; color: #b45309; }
  .pill-green  { background: #ecfdf5; color: #065f46; }
  .pill-blue   { background: #eff6ff; color: #1d4ed8; }
  .pill-red    { background: #fff1f2; color: #be123c; }

  .input-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

  input[type="email"],
  input[type="text"],
  input[type="datetime-local"],
  textarea {
    font-family: 'Inter', sans-serif;
    font-size: 14px; font-weight: 400;
    padding: 9px 13px;
    border: 1.5px solid #dde2ef;
    border-radius: 9px;
    background: #f8f9fc;
    color: #1e2433;
    outline: none;
    transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
  }
  input[type="email"]:focus,
  input[type="text"]:focus,
  input[type="datetime-local"]:focus,
  textarea:focus {
    border-color: #4b82f5;
    box-shadow: 0 0 0 3px rgba(75,130,245,0.13);
    background: #fff;
  }
  textarea { width: 100%; resize: vertical; min-height: 110px; line-height: 1.6; }
  input[type="file"] { font-family: 'Inter', sans-serif; font-size: 13px; color: #4a5568; }

  .btn {
    font-family: 'Inter', sans-serif;
    font-size: 14px; font-weight: 600;
    padding: 10px 22px; border-radius: 9px; border: none; cursor: pointer;
    transition: all 0.17s ease;
    display: inline-flex; align-items: center; gap: 7px; white-space: nowrap;
    letter-spacing: 0.1px;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
  .btn-primary { background: linear-gradient(135deg, #4b82f5 0%, #6366f1 100%); color: #fff; box-shadow: 0 2px 10px rgba(75,130,245,0.35); }
  .btn-primary:hover:not(:disabled) { box-shadow: 0 5px 18px rgba(75,130,245,0.5); transform: translateY(-1px); }
  .btn-green { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; box-shadow: 0 2px 10px rgba(16,185,129,0.3); }
  .btn-green:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 5px 16px rgba(16,185,129,0.4); }
  .btn-yellow { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #fff; box-shadow: 0 2px 10px rgba(245,158,11,0.3); }
  .btn-yellow:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 5px 16px rgba(245,158,11,0.4); }
  .btn-purple { background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: #fff; box-shadow: 0 2px 10px rgba(139,92,246,0.3); }
  .btn-purple:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 5px 16px rgba(139,92,246,0.4); }
  .btn-cyan { background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); color: #fff; box-shadow: 0 2px 10px rgba(6,182,212,0.3); }
  .btn-cyan:hover:not(:disabled) { transform: translateY(-1px); }
  .btn-outline { background: #fff; color: #374151; border: 1.5px solid #dde2ef; font-weight: 500; }
  .btn-outline:hover { background: #f4f6fb; border-color: #bcc5da; }
  .btn-danger { background: #fff1f2; color: #e11d48; border: 1.5px solid #fecdd3; padding: 6px 10px; font-size: 12px; font-weight: 600; }
  .btn-danger:hover { background: #ffe4e6; }
  .btn-ghost { background: #f4f6fb; color: #4b5680; font-size: 13px; padding: 7px 14px; font-weight: 500; }
  .btn-ghost:hover { background: #e8ecf5; }

  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.7s linear infinite; flex-shrink: 0; }
  .spinner-dark { border-color: rgba(75,130,245,0.3); border-top-color: #4b82f5; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .connected-badge {
    display: inline-flex; align-items: center; gap: 7px;
    background: #ecfdf5; border: 1.5px solid #a7f3d0; color: #065f46;
    padding: 7px 16px; border-radius: 20px; font-size: 13px; font-weight: 600;
  }

  .section-divider { display: flex; align-items: center; gap: 14px; margin: 6px 0 22px; }
  .section-divider span { font-size: 11px; color: #9aa3b8; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; white-space: nowrap; }
  .section-divider::before, .section-divider::after { content: ''; flex: 1; height: 1px; background: #e4e8f3; }

  .manual-table { width: 100%; border-collapse: separate; border-spacing: 0 5px; }
  .manual-table thead th { font-size: 11px; font-weight: 700; letter-spacing: 0.9px; text-transform: uppercase; color: #9aa3b8; padding: 6px 10px; text-align: left; border-bottom: 2px solid #eef0f8; }
  .manual-table tbody tr { background: #f8f9fc; }
  .manual-table tbody td { padding: 5px 7px; vertical-align: middle; }
  .manual-table tbody td:first-child { border-radius: 9px 0 0 9px; padding-left: 12px; }
  .manual-table tbody td:last-child  { border-radius: 0 9px 9px 0; padding-right: 8px; }
  .manual-table input[type="text"], .manual-table input[type="datetime-local"] { width: 100%; }
  .row-num { font-size: 12px; font-weight: 700; color: #bcc5da; width: 22px; text-align: center; }

  .events-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
  .events-title { font-size: 17px; font-weight: 700; color: #1e2433; }
  .events-count { font-size: 13px; color: #9aa3b8; font-weight: 400; }

  .events-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .events-table thead tr { background: #f4f6fb; border-bottom: 2px solid #e4e8f3; }
  .events-table thead th { padding: 11px 13px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.9px; text-transform: uppercase; color: #6b7591; }
  .events-table tbody tr { border-bottom: 1px solid #eef0f8; transition: background 0.13s; }
  .events-table tbody tr:hover { background: #f8f9fc; }
  .events-table tbody tr.row-manual { background: #faf7ff; }
  .events-table tbody tr.row-manual:hover { background: #f3eeff; }
  .events-table tbody td { padding: 9px 13px; vertical-align: middle; }
  .events-table input[type="text"], .events-table input[type="datetime-local"] { width: 100%; font-size: 13px; }
  .events-table textarea.desc-edit { width: 100%; min-height: 52px; font-size: 12px; padding: 6px 9px; resize: vertical; line-height: 1.5; }
  .events-table input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: #4b82f5; }

  .status-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 10px; white-space: nowrap; letter-spacing: 0.2px; }
  .s-ok   { background: #ecfdf5; color: #065f46; }
  .s-warn { background: #fffbeb; color: #92400e; }

  .src-tag { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 8px; letter-spacing: 0.3px; display: inline-block; }
  .src-manual { background: #f3f0ff; color: #6d28d9; }
  .src-paste  { background: #fffbeb; color: #b45309; }
  .src-upload { background: #ecfdf5; color: #065f46; }

  .actions-row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 16px; }
  .actions-warn { font-size: 13px; color: #d97706; font-weight: 500; margin-top: 10px; }

  .ics-guide { background: #f0fdfe; border: 1.5px solid #a5f3fc; border-radius: 12px; padding: 18px 22px; margin-top: 18px; }
  .ics-guide-title { font-size: 14px; font-weight: 700; color: #0891b2; margin-bottom: 12px; }
  .ics-steps { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .ics-steps li { font-size: 13px; color: #164e63; display: flex; gap: 8px; align-items: flex-start; }
  .ics-steps li::before { content: '→'; color: #06b6d4; font-weight: 700; flex-shrink: 0; padding-top: 1px; }
  .ics-platform { font-weight: 700; color: #0e7490; }

  .success-msg { background: #ecfdf5; border: 1.5px solid #a7f3d0; color: #065f46; padding: 13px 18px; border-radius: 11px; font-weight: 600; margin-top: 18px; display: flex; align-items: center; gap: 10px; font-size: 14px; }
  .hint { font-size: 13px; color: #9aa3b8; margin-top: 8px; line-height: 1.6; }
  .hint strong { color: #6b7591; font-weight: 600; }

  .empty-state { text-align: center; padding: 40px 20px; color: #9aa3b8; font-size: 14px; line-height: 1.8; }
  .empty-state .icon { font-size: 36px; margin-bottom: 12px; }
  .empty-state .title { font-weight: 600; color: #6b7591; margin-bottom: 6px; font-size: 15px; }

  @media (max-width: 640px) {
    .header { padding: 18px 20px; }
    .main { padding: 20px 14px 60px; }
    .card { padding: 18px 16px; }
    .header-badge { display: none; }
  }
`;

function App() {
  const [userEmail, setUserEmail]           = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [file, setFile]                     = useState(null);
  const [textInput, setTextInput]           = useState("");
  const [events, setEvents]                 = useState([]);
  const [message, setMessage]               = useState("");
  const [selectedIds, setSelectedIds]       = useState([]);
  const [manualRows, setManualRows]         = useState([blankRow()]);
  const [showIcsGuide, setShowIcsGuide]     = useState(false);

  // ── SEPARATE LOADING STATES — one per action ──
  const [loadingUpload,  setLoadingUpload]  = useState(false);
  const [loadingParse,   setLoadingParse]   = useState(false);
  const [loadingCreate,  setLoadingCreate]  = useState(false);

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
    if (!userEmail) return alert("Please enter your Google email first.");
    const width = 500, height = 600;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top  = window.screenY + (window.innerHeight - height) / 2;
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

  // ── UPLOAD (own loading state) ──
  const handleUpload = async () => {
    if (!file) return alert("Please choose a file first.");
    const formData = new FormData();
    formData.append("file", file);
    try {
      setLoadingUpload(true);
      setMessage("");
      const res = await axios.post(`${API}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const evts = res.data.events.map((e) => ({ ...e, selected: true }));
      const count = appendEvents(evts, "upload");
      setTextInput(res.data.rawText);
      setMessage(`${count} event(s) from document added to the table below.`);
      setFile(null);
    } catch (err) {
      alert("Upload failed. See console for details.");
    } finally {
      setLoadingUpload(false);
    }
  };

  // ── PARSE TEXT (own loading state) ──
  const handleParseText = async () => {
    if (!textInput.trim()) return alert("Please paste some text first.");
    try {
      setLoadingParse(true);
      setMessage("");
      const res = await axios.post(`${API}/parse-text`, { text: textInput });
      const evts = res.data.events.map((e) => ({ ...e, selected: true }));
      const count = appendEvents(evts, "paste");
      setMessage(`${count} event(s) extracted from text and added to the table below.`);
      setTextInput("");
    } catch (err) {
      alert("Failed to parse text.");
    } finally {
      setLoadingParse(false);
    }
  };

  // ── MANUAL ROWS ──
  const updateManualRow = (id, field, value) =>
    setManualRows(manualRows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const addManualRow    = () => setManualRows([...manualRows, blankRow()]);
  const removeManualRow = (id) => {
    if (manualRows.length > 1) setManualRows(manualRows.filter((r) => r.id !== id));
  };
  const handleAddManualEvents = () => {
    const filled = manualRows.filter((r) => r.title.trim() && r.start);
    if (filled.length === 0) return alert("Please fill in at least a title and start date for one row.");
    const normalized = filled.map((r) => ({
      ...r, source: "manual",
      start: new Date(r.start).toISOString(),
      end:   r.end
        ? new Date(r.end).toISOString()
        : new Date(new Date(r.start).getTime() + 3600000).toISOString(),
      ambiguous: false,
    }));
    const merged = [...events, ...normalized];
    setEvents(merged);
    setSelectedIds(merged.map((e) => e.id));
    setManualRows([blankRow()]);
    setMessage(`${normalized.length} manual event(s) added to the table below.`);
  };

  // ── EVENT TABLE EDIT ──
  const toLocalDT = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const updateEventTime = (id, field, value) =>
    setEvents(events.map((e) =>
      e.id === id ? { ...e, [field]: new Date(value).toISOString(), ambiguous: false } : e
    ));
  const updateField  = (id, field, value) =>
    setEvents(events.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  const toggleSelect = (id) =>
    setSelectedIds(selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id]);
  const toggleAll    = () =>
    setSelectedIds(selectedIds.length === events.length ? [] : events.map((e) => e.id));
  const deleteEvent  = (id) => {
    setEvents(events.filter((e) => e.id !== id));
    setSelectedIds(selectedIds.filter((x) => x !== id));
  };

  // ── CREATE (own loading state) ──
  const handleCreateEvents = async () => {
    if (events.length === 0)
      return alert("No events yet. Please scan text, upload a document, or add events manually first.");
    if (!googleConnected)
      return alert("Please connect your Google Calendar first (see the section below the table).");
    const selectedEvents = events.filter((e) => selectedIds.includes(e.id));
    if (selectedEvents.length === 0)
      return alert("Please select at least one event using the checkboxes.");
    try {
      setLoadingCreate(true);
      const res = await axios.post(`${API}/create-events`, { events: selectedEvents, userEmail });
      setMessage("🎉 " + res.data.message);
      setEvents([]); setTextInput(""); setFile(null); setSelectedIds([]);
    } catch (err) {
      alert("Failed to create events. Please try again.");
    } finally {
      setLoadingCreate(false);
    }
  };

  // ── EXPORT ICS (no spinner needed — instant download) ──
  const handleExportICS = async () => {
    if (events.length === 0)
      return alert("No events yet. Please scan text, upload a document, or add events manually first.");
    const selectedEvents = events.filter((e) => selectedIds.includes(e.id));
    if (selectedEvents.length === 0)
      return alert("Please select at least one event using the checkboxes.");
    try {
      const res = await axios.post(`${API}/export-ics`, { events: selectedEvents }, { responseType: "blob" });
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url; link.setAttribute("download", "events.ics");
      document.body.appendChild(link); link.click(); link.remove();
      setShowIcsGuide(true);

      const skippedHeader = res.headers["x-skipped-events"];
      const skipped = skippedHeader ? Number(skippedHeader) : 0;
      setMessage(
        skipped > 0
          ? `events.ics downloaded — but ${skipped} event${skipped === 1 ? "" : "s"} without a valid date/time ${skipped === 1 ? "was" : "were"} left out. See the import guide below.`
          : "events.ics downloaded! See the import guide below."
      );
    } catch (err) {
      // error responses come back as a Blob because of responseType: "blob"
      let msg = "Failed to export .ics file.";
      try {
        const body = err.response?.data;
        const text = body instanceof Blob ? await body.text() : typeof body === "string" ? body : "";
        const parsed = text ? JSON.parse(text) : null;
        if (parsed?.error) msg = parsed.error;
      } catch (_) { /* keep default message */ }
      alert(msg);
    }
  };

  const sortedEvents = [...events].sort((a, b) => new Date(a.start) - new Date(b.start));

  const srcTag = (src) => {
    if (src === "manual") return <span className="src-tag src-manual">Manual</span>;
    if (src === "paste")  return <span className="src-tag src-paste">Text scan</span>;
    if (src === "upload") return <span className="src-tag src-upload">Upload</span>;
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
          <div className="header-badge">AI · Powered</div>
        </header>

        <main className="main">

          <div className="section-divider">
            <span>Add your events — use any or all methods below</span>
          </div>

          {/* ── OPTION A: MANUAL ── */}
          <div className="card card-manual">
            <div className="card-header">
              <div>
                <div className="card-label">Option A</div>
                <div className="card-title">Enter events manually</div>
                <div className="card-desc">Type events directly. Title and start date required.</div>
              </div>
              <span className="pill pill-purple">Manual</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="manual-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Title *</th>
                    <th>Start date &amp; time *</th>
                    <th>End date &amp; time</th>
                    <th>Location</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {manualRows.map((row, idx) => (
                    <tr key={row.id}>
                      <td><span className="row-num">{idx + 1}</span></td>
                      <td>
                        <input type="text" value={row.title} placeholder="Meeting title"
                          onChange={(e) => updateManualRow(row.id, "title", e.target.value)} />
                      </td>
                      <td>
                        <input type="datetime-local" value={row.start}
                          onChange={(e) => updateManualRow(row.id, "start", e.target.value)} />
                      </td>
                      <td>
                        <input type="datetime-local" value={row.end}
                          onChange={(e) => updateManualRow(row.id, "end", e.target.value)} />
                      </td>
                      <td>
                        <input type="text" value={row.location} placeholder="Room / Zoom link"
                          onChange={(e) => updateManualRow(row.id, "location", e.target.value)} />
                      </td>
                      <td>
                        <input type="text" value={row.description} placeholder="Optional notes"
                          onChange={(e) => updateManualRow(row.id, "description", e.target.value)} />
                      </td>
                      <td>
                        <button className="btn btn-danger" onClick={() => removeManualRow(row.id)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
              <button className="btn btn-ghost" onClick={addManualRow}>+ Add row</button>
              <button className="btn btn-purple" onClick={handleAddManualEvents}>
                Add to event table ↓
              </button>
            </div>
          </div>

          {/* ── OPTION B: TEXT SCAN ── */}
          <div className="card card-paste">
            <div className="card-header">
              <div>
                <div className="card-label">Option B</div>
                <div className="card-title">Scan email or text with AI</div>
                <div className="card-desc">Paste any text — AI extracts all dates and events automatically.</div>
              </div>
              <span className="pill pill-yellow">AI scan</span>
            </div>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Paste your email, meeting invite, or any text containing dates and times here..."
            />
            <div style={{ marginTop: 12 }}>
              <button
                className="btn btn-yellow"
                onClick={handleParseText}
                disabled={loadingParse}
              >
                {loadingParse
                  ? <><span className="spinner" /> Scanning...</>
                  : "✨ Scan & Add to Table"
                }
              </button>
            </div>
            <p className="hint">Events are <strong>appended</strong> to the table — existing events are not removed.</p>
          </div>

          {/* ── OPTION C: UPLOAD ── */}
          <div className="card card-upload">
            <div className="card-header">
              <div>
                <div className="card-label">Option C</div>
                <div className="card-title">Upload a document</div>
                <div className="card-desc">PDF, Word doc, or image — AI reads and extracts all events.</div>
              </div>
              <span className="pill pill-green">PDF · DOCX · Image</span>
            </div>
            <div className="input-row">
              <input
                type="file"
                accept=".txt,.pdf,.doc,.docx,.png,.jpg,.jpeg,.PNG,.JPG,.JPEG,.DOC,.DOCX"
                onChange={(e) => setFile(e.target.files[0])}
              />
              <button
                className="btn btn-green"
                onClick={handleUpload}
                disabled={loadingUpload}
              >
                {loadingUpload
                  ? <><span className="spinner" /> Processing document...</>
                  : "⬆ Upload & Add to Table"
                }
              </button>
            </div>
            <p className="hint">Events are <strong>appended</strong> to the table — existing events are not removed.</p>
          </div>

          {/* SUCCESS MESSAGE */}
          {message && <div className="success-msg">{message}</div>}

          {/* ── EVENTS TABLE ── */}
          <div className="card card-events">
            <div className="events-header">
              <div>
                <div className="events-title">
                  All Events
                  {sortedEvents.length > 0 &&
                    <span className="events-count"> — {sortedEvents.length} event{sortedEvents.length !== 1 ? "s" : ""}</span>
                  }
                </div>
              </div>
              {sortedEvents.length > 0 &&
                <button className="btn btn-ghost" onClick={toggleAll}>
                  {selectedIds.length === events.length ? "Deselect all" : "Select all"}
                </button>
              }
            </div>

            {sortedEvents.length === 0 ? (
              <div className="empty-state">
                <div className="icon">📋</div>
                <div className="title">No events yet</div>
                <div>Use one of the methods above to add events.<br />They will appear here for review and editing.</div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="events-table">
                  <thead>
                    <tr>
                      <th>✓</th>
                      <th>Title</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Location</th>
                      <th>Description</th>
                      <th>Source</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEvents.map((e) => (
                      <tr key={e.id} className={e.source === "manual" ? "row-manual" : ""}>
                        <td>
                          <input type="checkbox"
                            checked={selectedIds.includes(e.id)}
                            onChange={() => toggleSelect(e.id)} />
                        </td>
                        <td>
                          <input type="text" value={e.title}
                            onChange={(ev) => updateField(e.id, "title", ev.target.value)} />
                        </td>
                        <td>
                          <input type="datetime-local"
                            value={toLocalDT(e.start)}
                            onChange={(ev) => updateEventTime(e.id, "start", ev.target.value)} />
                        </td>
                        <td>
                          <input type="datetime-local"
                            value={toLocalDT(e.end)}
                            onChange={(ev) => updateEventTime(e.id, "end", ev.target.value)} />
                        </td>
                        <td>
                          <input type="text" value={e.location || ""} placeholder="—"
                            onChange={(ev) => updateField(e.id, "location", ev.target.value)} />
                        </td>
                        <td>
                          <textarea className="desc-edit"
                            value={e.description || ""}
                            placeholder="Notes..."
                            onChange={(ev) => updateField(e.id, "description", ev.target.value)} />
                        </td>
                        <td>{srcTag(e.source)}</td>
                        <td>
                          {e.ambiguous
                            ? <span className="status-badge s-warn">⚠ Fix time</span>
                            : <span className="status-badge s-ok">✓ Ready</span>}
                        </td>
                        <td>
                          <button className="btn btn-danger" onClick={() => deleteEvent(e.id)}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── GOOGLE CONNECT ── */}
          <div className="card card-google">
            <div className="card-header">
              <div>
                <div className="card-label">Optional — Connect before creating events</div>
                <div className="card-title">Connect Google Calendar</div>
                <div className="card-desc">Push events directly to Google Calendar. Not required — you can use Export .ics instead.</div>
              </div>
              <span className="pill pill-blue">Google OAuth</span>
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
              <strong>No Google account?</strong> Skip this — use <strong>Export .ics File</strong> below to download
              and import into Google Calendar, Outlook, Apple Calendar, or any other app.
            </p>
          </div>

          {/* ── ACTION CARD ── */}
          <div className="card card-actions">
            <div className="card-header">
              <div>
                <div className="card-label">Final step</div>
                <div className="card-title">Save your events</div>
                <div className="card-desc">Push to Google Calendar directly, or download an .ics file to import anywhere.</div>
              </div>
              <span className="pill pill-red">Action</span>
            </div>

            <div className="actions-row">
              <button
                className="btn btn-primary"
                onClick={handleCreateEvents}
                disabled={loadingCreate}
              >
                {loadingCreate
                  ? <><span className="spinner" /> Creating events...</>
                  : "📅 Create in Google Calendar"
                }
              </button>
              <button
                className="btn btn-cyan"
                onClick={handleExportICS}
              >
                💾 Export .ics File
              </button>
              {sortedEvents.length > 0 &&
                <span style={{ fontSize: 13, color: "#9aa3b8", marginLeft: "auto" }}>
                  {selectedIds.length} of {events.length} selected
                </span>
              }
            </div>

            {!googleConnected && (
              <p className="actions-warn">
                ⚠ Google Calendar not connected — use <strong>Export .ics File</strong> to download and import your events manually.
              </p>
            )}

            {/* ICS IMPORT GUIDE */}
            {showIcsGuide && (
              <div className="ics-guide">
                <div className="ics-guide-title">📥 How to import your events.ics file</div>
                <ul className="ics-steps">
                  <li><span><span className="ics-platform">Google Calendar: </span>Go to calendar.google.com → gear icon (Settings) → Import &amp; Export → Import → select events.ics → click Import.</span></li>
                  <li><span><span className="ics-platform">Outlook (web): </span>Go to outlook.com → Calendar → Add calendar → Upload from file → select events.ics → Import.</span></li>
                  <li><span><span className="ics-platform">Apple Calendar (Mac): </span>Open Calendar app → File menu → Import → select events.ics → choose which calendar to add to.</span></li>
                  <li><span><span className="ics-platform">iPhone / iPad: </span>Email or AirDrop the .ics file to yourself → tap the file → tap Add All Events.</span></li>
                  <li><span><span className="ics-platform">Yahoo Calendar: </span>Open Yahoo Calendar → Actions menu → Import events → select events.ics → Import.</span></li>
                </ul>
                <button className="btn btn-ghost" style={{ marginTop: 14, fontSize: 12 }}
                  onClick={() => setShowIcsGuide(false)}>
                  Dismiss
                </button>
              </div>
            )}
          </div>

        </main>
      </div>
    </>
  );
}

export default App;