import React, { useState } from "react";
import axios from "axios";

function App() {
  const [file, setFile] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
const handleUpload = async () => {
  if (!file) return alert("Choose a file");

  const formData = new FormData();
  formData.append("file", file);

  try {
    setLoading(true);

    const res = await axios.post(
      "http://localhost:5000/upload",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );

    // ✅ AXIOS FIX
    const data = res.data;

    setTextInput(data.rawText);   // populate textarea

    const evts = data.events.map(e => ({
      ...e,
      selected: true
    }));

    setEvents(evts);
    setSelectedIds(evts.map(e => e.id));

  } catch (err) {
    console.error("UPLOAD ERROR:", err.response?.data || err.message);
  } finally {
    setLoading(false);
  }
};


  const handleParseText = async () => {
    if (!textInput) return alert("Paste text");

    try {
      setLoading(true);
      const res = await axios.post("http://localhost:5000/parse-text", { text: textInput });
      const evts = res.data.events.map(e => ({ ...e, selected: true }));
      setEvents(evts);
      setSelectedIds(evts.map(e => e.id));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateEventTime = (id, field, value) => {
    setEvents(events.map(e => e.id === id ? { ...e, [field]: new Date(value).toISOString(), ambiguous: false } : e));
  };

  const updateField = (id, field, value) => {
    setEvents(events.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const toggleSelect = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const deleteEvent = (id) => {
    setEvents(events.filter(e => e.id !== id));
    setSelectedIds(selectedIds.filter(x => x !== id));
  };

  const handleCreateEvents = async () => {
    try {
      setLoading(true);
      const selectedEvents = events.filter(e => selectedIds.includes(e.id));
      const res = await axios.post("http://localhost:5000/create-events", { events: selectedEvents });
      setMessage(res.data.message);
      setEvents([]);
      setTextInput("");
      setFile(null);
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportICS = async () => {
    try {
      const selectedEvents = events.filter(e => selectedIds.includes(e.id));
      const res = await axios.post("http://localhost:5000/export-ics", { events: selectedEvents }, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "events.ics");
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      console.error(err);
    }
  };

  const sortedEvents = [...events].sort((a, b) => new Date(a.start) - new Date(b.start));

  return (
    <div style={{ padding: 20 }}>
      <h2>QuickScheduleAI</h2>

      <h4>Upload file</h4>
      <input type="file" accept=".txt,.pdf,.doc,.docx,.png,.jpg,.jpeg,.PNG,.JPG,.JPEG" onChange={e => setFile(e.target.files[0])}/>
     
      <button onClick={handleUpload} disabled={loading}>Upload</button>

      <h4>Or paste text</h4>
      <textarea rows="6" cols="80" value={textInput} onChange={e => setTextInput(e.target.value)} />
      <br />
      <button onClick={handleParseText} disabled={loading}>Parse Text</button>

      {sortedEvents.length > 0 && (
        <>
          <h3>Detected Events (Calendar Preview)</h3>
          <table border="1" cellPadding="5">
            <thead>
              <tr>
                <th>Use</th>
                <th>Title</th>
                <th>Start</th>
                <th>End</th>
                <th>Location</th>
                <th>Recurring</th>
                <th>Fix Time?</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {sortedEvents.map(e => (
                <tr key={e.id}>
                  <td>
                    <input type="checkbox" checked={selectedIds.includes(e.id)} onChange={() => toggleSelect(e.id)} />
                  </td>

                  <td>
                    <input value={e.title} onChange={ev => updateField(e.id, "title", ev.target.value)} />
                  </td>

                  <td>
                    {e.ambiguous ? (
                      <input type="datetime-local" onChange={ev => updateEventTime(e.id, "start", ev.target.value)} />
                    ) : new Date(e.start).toLocaleString()}
                  </td>

                  <td>
                    {e.ambiguous ? (
                      <input type="datetime-local" onChange={ev => updateEventTime(e.id, "end", ev.target.value)} />
                    ) : new Date(e.end).toLocaleString()}
                  </td>

                  <td>
                    <input value={e.location || ""} onChange={ev => updateField(e.id, "location", ev.target.value)} />
                  </td>

                  <td>{e.recurrence ? "Yes" : "No"}</td>
                  <td>{e.ambiguous ? "⚠️ Yes" : "OK"}</td>
                  <td>
                    <button onClick={() => deleteEvent(e.id)}>❌</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <br />

          <button onClick={handleCreateEvents} disabled={loading}>Create Calendar Events</button>
          <button onClick={handleExportICS}>Export .ics</button>
        </>
      )}

      {message && <p>{message}</p>}
    </div>
  );
}

export default App;
