import React, { useState } from "react";
import axios from "axios";

function App() {
  const [file, setFile] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

 // Send timezone ONCE at startup
  useEffect(() => {
    (async () => {
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        await axios.post("http://localhost:5000/api/set-timezone", { timeZone });
        console.log("🌍 Timezone sent:", timeZone);
      } catch (e) {
        console.warn("Timezone send failed:", e?.message || e);
      }
    })();
  }, []);

  // ================= UPLOAD FILE =================
  const handleUpload = async () => {
    if (!file) return alert("Please choose a file");

    const formData = new FormData();
    formData.append("file", file);

    try {
      setLoading(true);
      setMessage("");

      const res = await axios.post("http://localhost:5000/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = res.data;

      setTextInput(data.rawText);

      const evts = data.events.map((e) => ({
        ...e,
        selected: true,
      }));

      setEvents(evts);
      setSelectedIds(evts.map((e) => e.id));
    } catch (err) {
      console.error("UPLOAD ERROR:", err.response?.data || err.message);
      alert("Upload failed. See console for details.");
    } finally {
      setLoading(false);
    }
  };

  // ================= PARSE TEXT =================
  const handleParseText = async () => {
    if (!textInput.trim()) return alert("Please paste some text");

    try {
      setLoading(true);
      setMessage("");

      const res = await axios.post("http://localhost:5000/parse-text", {
        text: textInput,
      });

      const evts = res.data.events.map((e) => ({ ...e, selected: true }));
      setEvents(evts);
      setSelectedIds(evts.map((e) => e.id));
    } catch (err) {
      console.error("PARSE ERROR:", err);
      alert("Failed to parse text");
    } finally {
      setLoading(false);
    }
  };
  

  // ================= UPDATE EVENT TIME ================= // IMPORTANT: this converts local to UTC; ok only if your server/calendar uses timezone explicitly.
  const updateEventTime = (id, field, value) => {
    setEvents(
      events.map((e) =>
        e.id === id
          ? { ...e, [field]: new Date(value).toISOString(), ambiguous: false }
          : e
      )
    );
  };

  // ================= UPDATE EVENT FIELD =================
  const updateField = (id, field, value) => {
    setEvents(events.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  // ================= TOGGLE SELECT =================
  const toggleSelect = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  // ================= DELETE EVENT =================
  const deleteEvent = (id) => {
    setEvents(events.filter((e) => e.id !== id));
    setSelectedIds(selectedIds.filter((x) => x !== id));
  };

  // ================= CREATE CALENDAR EVENTS =================
  const handleCreateEvents = async () => {
    const selectedEvents = events.filter((e) => selectedIds.includes(e.id));

    if (selectedEvents.length === 0) {
      return alert("Please select at least one event");
    }

    try {
      setLoading(true);
      const res = await axios.post("http://localhost:5000/create-events", {
        events: selectedEvents,
      });

      setMessage(res.data.message);
      setEvents([]);
      setTextInput("");
      setFile(null);
      setSelectedIds([]);
    } catch (err) {
      console.error("CREATE ERROR:", err);
      alert("Failed to create events");
    } finally {
      setLoading(false);
    }
  };

  // ================= EXPORT ICS =================
  const handleExportICS = async () => {
    const selectedEvents = events.filter((e) => selectedIds.includes(e.id));

    if (selectedEvents.length === 0) {
      return alert("Please select at least one event");
    }

    try {
      const res = await axios.post(
        "http://localhost:5000/export-ics",
        { events: selectedEvents },
        { responseType: "blob" }
      );

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "events.ics");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("EXPORT ERROR:", err);
      alert("Failed to export .ics file");
    }
  };

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.start) - new Date(b.start)
  );

  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h2>📅 QuickScheduleAI</h2>

      <div style={{ marginBottom: 20 }}>
        <h4>📎 Upload File</h4>
        <input
          type="file"
          accept=".txt,.pdf,.doc,.docx,.png,.jpg,.jpeg,.PNG,.JPG,.JPEG,.DOC,.DOCX"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <button onClick={handleUpload} disabled={loading}>
          {loading ? "Processing..." : "Upload & Extract"}
        </button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h4>📝 Or Paste Email/Text</h4>
        <textarea
          rows="8"
          cols="80"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Paste your email or meeting text here..."
          style={{ width: "100%", padding: 10 }}
        />
        <br />
        <button onClick={handleParseText} disabled={loading}>
          {loading ? "Parsing..." : "Parse Text"}
        </button>
      </div>

      {sortedEvents.length > 0 && (
        <>
          <h3>📋 Detected Events (Review & Edit)</h3>
          <table border="1" cellPadding="8" style={{ width: "100%" }}>
            <thead>
              <tr style={{ backgroundColor: "#f0f0f0" }}>
                <th>✓</th>
                <th>Title</th>
                <th>Start</th>
                <th>End</th>
                <th>Location</th>
                <th>Recurring</th>
                <th>Status</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {sortedEvents.map((e) => (
                <tr key={e.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(e.id)}
                      onChange={() => toggleSelect(e.id)}
                    />
                  </td>

                  <td>
                    <input
                      value={e.title}
                      onChange={(ev) =>
                        updateField(e.id, "title", ev.target.value)
                      }
                      style={{ width: "100%" }}
                    />
                  </td>

                  <td>
                    {e.ambiguous ? (
                      <input
                        type="datetime-local"
                        onChange={(ev) =>
                          updateEventTime(e.id, "start", ev.target.value)
                        }
                      />
                    ) : (
                      new Date(e.start).toLocaleString()
                    )}
                  </td>

                  <td>
                    {e.ambiguous ? (
                      <input
                        type="datetime-local"
                        onChange={(ev) =>
                          updateEventTime(e.id, "end", ev.target.value)
                        }
                      />
                    ) : (
                      new Date(e.end).toLocaleString()
                    )}
                  </td>

                  <td>
                    <input
                      value={e.location || ""}
                      onChange={(ev) =>
                        updateField(e.id, "location", ev.target.value)
                      }
                      style={{ width: "100%" }}
                    />
                  </td>

                  <td>{e.recurrence ? "✅ Yes" : "No"}</td>
                  <td>{e.ambiguous ? "⚠️ Fix Time" : "✅ OK"}</td>
                  <td>
                    <button onClick={() => deleteEvent(e.id)}>❌</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 20 }}>
            <button
              onClick={handleCreateEvents}
              disabled={loading}
              style={{ marginRight: 10, padding: "10px 20px" }}
            >
              {loading ? "Creating..." : "📅 Create Calendar Events"}
            </button>

            <button
              onClick={handleExportICS}
              style={{ padding: "10px 20px" }}
            >
              💾 Export .ics File
            </button>
          </div>
        </>
      )}

      {message && (
        <p style={{ color: "green", marginTop: 20, fontWeight: "bold" }}>
          ✅ {message}
        </p>
      )}
    </div>
  );
}

export default App;
