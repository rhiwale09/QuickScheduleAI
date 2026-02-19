import React, { useState } from "react";
import axios from "axios";

function App() {
  const [file, setFile] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return alert("Choose a file");

    const formData = new FormData();
    formData.append("file", file);

    try {
      setLoading(true);
      const res = await axios.post("http://localhost:5000/upload", formData);
      setEvents(res.data.events);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  const handleParseText = async () => {
    if (!textInput) return alert("Paste text");

    try {
      setLoading(true);
      const res = await axios.post("http://localhost:5000/parse-text", { text: textInput });
      setEvents(res.data.events);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  const updateEventTime = (idx, field, value) => {
    const copy = [...events];
    copy[idx][field] = new Date(value).toISOString();
    copy[idx].ambiguous = false;
    setEvents(copy);
  };

  const handleCreateEvents = async () => {
    try {
      setLoading(true);
      const res = await axios.post("http://localhost:5000/create-events", { events });
      setMessage(res.data.message);
      setEvents([]);
      setTextInput("");
      setFile(null);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>QuickScheduleAI</h2>

      <h4>Upload file</h4>
      <input type="file" onChange={e => setFile(e.target.files[0])} />
      <button onClick={handleUpload} disabled={loading}>Upload</button>

      <h4>Or paste text</h4>
      <textarea
        rows="6"
        cols="80"
        value={textInput}
        onChange={e => setTextInput(e.target.value)}
      />
      <br />
      <button onClick={handleParseText} disabled={loading}>Parse Text</button>

      {events.length > 0 && (
        <>
          <h3>Detected Events</h3>
          <table border="1" cellPadding="5">
            <thead>
              <tr>
                <th>Title</th>
                <th>Start</th>
                <th>End</th>
                <th>Fix Time?</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i}>
                  <td>{e.title}</td>
                  <td>
                    {e.ambiguous ? (
                      <input type="datetime-local" onChange={ev => updateEventTime(i, "start", ev.target.value)} />
                    ) : new Date(e.start).toLocaleString()}
                  </td>
                  <td>
                    {e.ambiguous ? (
                      <input type="datetime-local" onChange={ev => updateEventTime(i, "end", ev.target.value)} />
                    ) : new Date(e.end).toLocaleString()}
                  </td>
                  <td>{e.ambiguous ? "⚠️ Yes" : "OK"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button onClick={handleCreateEvents} disabled={loading}>Create Calendar Events</button>
        </>
      )}

      {message && <p>{message}</p>}
    </div>
  );
}

export default App;
