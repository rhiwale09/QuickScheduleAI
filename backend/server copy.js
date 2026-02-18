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

// Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// ✅ Set refresh token from .env once
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

// Route to start OAuth flow (optional if you already have refresh token)
app.get("/auth", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline", // REQUIRED to get refresh token
    prompt: "consent",      // force refresh token
    scope: ["https://www.googleapis.com/auth/calendar"], // full calendar access
  });
  res.redirect(authUrl);
});

// Callback route (optional if you already have refresh token)
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oauth2Client.getToken(code);

    console.log("TOKENS:", tokens);
    res.send({
      message: "Login successful",
      tokens: tokens,
    });
  } catch (err) {
    console.error("OAUTH ERROR:", err);
    res.status(500).send("Authentication failed");
  }
});

// ================= FILE UPLOAD =================
const upload = multer({ dest: "uploads/" });

app.post("/upload", upload.single("file"), async (req, res) => {
  const filePath = req.file.path;
  const mimeType = req.file.mimetype;
  let text = "";

  try {
    if (mimeType === "application/pdf") {
      const data = await pdfParse(fs.readFileSync(filePath));
      text = data.text;
    } else if (mimeType.startsWith("image/")) {
      const result = await Tesseract.recognize(filePath, "eng");
      text = result.data.text;
    } else if (mimeType === "text/plain" || req.file.originalname.endsWith(".eml")) {
      text = fs.readFileSync(filePath, "utf8");
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    fs.unlinkSync(filePath);
    res.json({ text });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ error: "Failed to extract text", details: err.message });
  }
});

// ================= CREATE CALENDAR EVENTS =================
/* ================= CREATE CALENDAR EVENTS ================= */
app.post("/create-events", async (req, res) => {
  try {
    const { events } = req.body;

    if (!events || !events.length) {
      return res.status(400).json({ error: "No events provided" });
    }

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const results = [];

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

      results.push({ title: e.title, eventId: response.data.id });
    }

    res.json({
      message: "Events created successfully!",
      created: results,
    });
  } catch (err) {
    console.error("CALENDAR ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
