const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const chrono = require("chrono-node");
const { google } = require("googleapis");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 5000;

// Google OAuth
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Multer
const upload = multer({ dest: "uploads/" });

// ================= FILE UPLOAD =================
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

    const events = await aiExtractEvents(text);

    res.json({
      rawText: text,
      events,
      needsConfirmation: events.some((e) => e.ambiguous),
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= TEXT PARSE =================
app.post("/parse-text", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided" });

  try {
    const events = await aiExtractEvents(text);

    res.json({
      rawText: text,
      events,
      needsConfirmation: events.some((e) => e.ambiguous),
    });
  } catch (err) {
    console.error("PARSE TEXT ERROR:", err);
    res.status(500).json({ error: "Failed to parse text." });
  }
});

// ================= CREATE EVENTS =================
app.post("/create-events", async (req, res) => {
  const { events } = req.body;
  if (!events || !events.length) {
    return res.status(400).json({ error: "No events provided" });
  }

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    for (let e of events) {
      await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: e.title,
          start: { dateTime: e.start },
          end: { dateTime: e.end },
          location: e.location || "",
          description: e.description || "",
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 7 * 24 * 60 }, // 1 week
              { method: "popup", minutes: 24 * 60 },     // 1 day
              { method: "popup", minutes: 60 },          // 1 hour
            ],
          },
        },
      });
    }

    res.json({ message: "Events created successfully!" });
  } catch (err) {
    console.error("CALENDAR ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= AI PARSER =================
async function aiExtractEvents(text) {
  try {
    // Call OpenAI to extract title, start, end, location
    const prompt = `
Extract all events from the following text. 
Return JSON with "title", "start", "end", "location", "description" fields.
Use full text as description. Detect dates and times accurately.

Text:
${text}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    // Parse AI response
    const aiText = response.data.choices[0].message.content;

    try {
      const aiEvents = JSON.parse(aiText);
      return aiEvents.map((e, idx) => ({
        id: idx + 1,
        title: e.title || `Event ${idx + 1}`,
        start: e.start || new Date().toISOString(),
        end: e.end || new Date(new Date().getTime() + 60 * 60 * 1000).toISOString(),
        location: e.location || "",
        description: e.description || text,
        ambiguous: false,
      }));
    } catch (parseErr) {
      console.warn("AI JSON parse failed, falling back to chrono-node.");
      return parseEventsFromText(text);
    }
  } catch (err) {
    console.warn("OpenAI parse failed, using chrono-node fallback:", err.message);
    return parseEventsFromText(text);
  }
}

// ================= CHRONO FALLBACK PARSER =================
function parseEventsFromText(text) {
  const results = chrono.parse(text);
  const events = [];

  results.forEach((r, idx) => {
    const startDate = r.start?.date();
    let endDate = r.end?.date();

    if (!endDate && startDate) {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // default 1 hr
    }

    const ambiguous = !r.start.isCertain("hour") || !r.start.isCertain("minute");

    // Basic title/location extraction
    const surroundingText = r.text || "";
    let title = surroundingText.split(" ").slice(0, 6).join(" ");
    
    let location = "";
    const locMatch = surroundingText.match(/\b(?:at|in)\s+([A-Za-z0-9 ,.-]+)/i);
    if (locMatch) location = locMatch[1];
  //  let title = extractTitle(text);
    //let location = extractLocation(text);
    events.push({
      id: idx + 1,
      title: title || `Event ${idx + 1}`,
      start: startDate?.toISOString(),
      end: endDate?.toISOString(),
      description: text, // full original text
      location,
      ambiguous,
    });
  });

  return events;
}

app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
function extractLocation(text) {
  const locationRegex = /\b(?:at|in|on|@)\s+([A-Z][a-zA-Z0-9\s]+)/;
  const match = text.match(locationRegex);
  return match ? match[1].trim() : null;
}
function extractTitle(text) {
  const titleRegex = /^(.+?)(?:\b(at|in|on|@|tomorrow|today|\d|\bMonday|\bTuesday|\bWednesday|\bThursday|\bFriday|\bSaturday|\bSunday))/i;
  const match = text.match(titleRegex);
  return match ? match[1].trim() : text.slice(0, 40);
}
