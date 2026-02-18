const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;

// ================== GOOGLE OAUTH ==================
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// ✅ Use refresh token automatically
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

// ================= FILE UPLOAD =================
const upload = multer({ dest: "uploads/" });

app.post("/upload", upload.single("file"), async (req, res) => {
  const filePath = req.file.path;
  const mimeType = req.file.mimetype;
  let text = "";

  try {
    // PDF
    if (mimeType === "application/pdf") {
      const data = await pdfParse(fs.readFileSync(filePath));
      text = data.text;
    }
    // IMAGE OCR
    else if (mimeType.startsWith("image/")) {
      const result = await Tesseract.recognize(filePath, "eng");
      text = result.data.text;
    }
    // TEXT / EMAIL
    else if (mimeType === "text/plain" || req.file.originalname.endsWith(".eml")) {
      text = fs.readFileSync(filePath, "utf8");
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    fs.unlinkSync(filePath);

    // ================= PARSE TEXT TO EVENTS =================
    // For simplicity, assume each line in text is an event in format:
    // Title | startISO | endISO | location | description
    // Example line: "Meeting|2026-02-18T10:00:00-06:00|2026-02-18T11:00:00-06:00|Office|Discuss Q1 targets"
    const lines = text.split("\n").filter(line => line.trim() !== "");
    const events = lines.map(line => {
      const parts = line.split("|").map(p => p.trim());
      return {
        title: parts[0] || "Untitled Event",
        start: parts[1],
        end: parts[2],
        location: parts[3] || "",
        description: parts[4] || "",
      };
    });

    if (!events.length) return res.status(400).json({ error: "No events parsed from file" });

    // ================= CREATE EVENTS IN GOOGLE CALENDAR =================
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const createdEvents = [];

    for (let e of events) {
      const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: e.title,
          start: { dateTime: e.start },
          end: { dateTime: e.end },
          location: e.location || undefined,
          description: e.description || undefined,
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 10080 }, // 1 week
              { method: "popup", minutes: 1440 },  // 1 day
              { method: "popup", minutes: 60 },    // 1 hour
            ],
          },
        },
      });
      createdEvents.push({ title: e.title, eventId: response.data.id });
    }

    res.json({
      message: "Events created successfully from uploaded file!",
      created: createdEvents,
    });

  } catch (err) {
    console.error("UPLOAD / CALENDAR ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= CREATE EVENTS DIRECTLY (optional) =================
app.post("/create-events", async (req, res) => {
  try {
    const { events } = req.body;
    if (!events || !events.length) {
      return res.status(400).json({ error: "No events provided" });
    }

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const createdEvents = [];

    for (let e of events) {
      const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: e.title,
          start: { dateTime: e.start },
          end: { dateTime: e.end },
          location: e.location || undefined,
          description: e.description || undefined,
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 10080 },
              { method: "popup", minutes: 1440 },
              { method: "popup", minutes: 60 },
            ],
          },
        },
      });
      createdEvents.push({ title: e.title, eventId: response.data.id });
    }

    res.json({
      message: "Events created successfully!",
      created: createdEvents,
    });
  } catch (err) {
    console.error("CALENDAR ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
