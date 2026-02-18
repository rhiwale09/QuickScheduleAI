import { useState } from "react";
import axios from "axios";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";

function App() {
  const [rawText, setRawText] = useState("");
  const [events, setEvents] = useState([]);
  const [file, setFile] = useState(null);
  const [token, setToken] = useState("");

  // Parse text into events
  const parseTextToEvents = (text) => {
    const lines = text.split("\n").filter(l => l.trim() !== "");
    const parsed = [];

    for (let line of lines) {
      // Example: Math Test - Feb 20 2026 10:00 AM to Feb 20 2026 11:00 AM
      const parts = line.split(" - ");
      if (!parts[1]) continue;

      const times = parts[1].split(" to ");
      if (times.length !== 2) continue;

      parsed.push({
        title: parts[0].trim(),
        start: new Date(times[0].trim()).toISOString(),
        end: new Date(times[1].trim()).toISOString()
      });
    }

    setEvents(parsed);
  };

  // Upload file (pdf/image/email)
  const uploadFile = async () => {
    if (!file) return alert("Select a file first");

    const formData = new FormData();
    formData.append("file", file);

    const res = await axios.post("http://localhost:5000/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });

    setRawText(res.data.text);
    parseTextToEvents(res.data.text);
  };

  // Create Google Calendar events
  const createCalendarEvents = async () => {
    if (!token) return alert("Login with Google first");

    await axios.post("http://localhost:5000/create-events", {
      token,
      events
    });

    alert("Events added to Google Calendar!");
  };

  return (
    <GoogleOAuthProvider clientId="YOUR_GOOGLE_CLIENT_ID">
      <div style={{ padding: 20 }}>
        <h2>⚡ QuickScheduleAI</h2>

        <h4>1️⃣ Paste events</h4>
        <textarea
          rows="8"
          cols="70"
          placeholder="Math Test - Feb 20 2026 10:00 AM to Feb 20 2026 11:00 AM"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />

        <br /><br />
        <button onClick={() => parseTextToEvents(rawText)}>
          Parse Events
        </button>

        <hr />

        <h4>2️⃣ OR Upload file (PDF / Image / Email)</h4>
        <input type="file" onChange={(e) => setFile(e.target.files[0])} />
        <button onClick={uploadFile}>Upload & Extract</button>

        <hr />

        <h4>3️⃣ Preview Events</h4>
        {events.length === 0 && <p>No events parsed yet</p>}
        <ul>
          {events.map((e, i) => (
            <li key={i}>
              <b>{e.title}</b><br />
              {new Date(e.start).toLocaleString()} → {new Date(e.end).toLocaleString()}
            </li>
          ))}
        </ul>

        <hr />

        <h4>4️⃣ Login with Google</h4>
        <GoogleLogin
          onSuccess={(res) => setToken(res.access_token)}
          onError={() => alert("Login failed")}
        />

        <br /><br />

        <button onClick={createCalendarEvents}>
          🚀 Create Calendar Events
        </button>
      </div>
    </GoogleOAuthProvider>
  );
}

export default App;
