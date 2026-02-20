const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const chrono = require("chrono-node");
const { google } = require("googleapis");
const OpenAI = require("openai");
const { createEvents } = require("ics");

require("dotenv").config();

let LAST_EXTRACTED_EVENTS = null;
let LAST_RAW_TEXT = null;
const app = express();
app.use(cors());
app.use(express.json());

let CLIENT_TIMEZONE = "UTC";

app.post("/api/set-timezone", (req, res) => {
  const { timeZone } = req.body || {};
  if (!timeZone || typeof timeZone !== "string") {
    return res.status(400).json({ error: "Invalid timeZone" });
  }
  CLIENT_TIMEZONE = timeZone;
  console.log("🌍 Client timezone set to:", CLIENT_TIMEZONE);
  res.json({ ok: true, timeZone: CLIENT_TIMEZONE });
});

const PORT = process.env.PORT || 5000;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";


// ================= GOOGLE OAUTH SETUP =================
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

// ================= OPENAI SETUP =================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ================= MULTER SETUP =================
const upload = multer({ dest: "uploads/" });

// ================= FILE UPLOAD ENDPOINT =================
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const mimeType = req.file.mimetype;
  const originalName = req.file.originalname.toLowerCase();
  let text = "";

  try {
    // PDF
    if (mimeType === "application/pdf") {
      const data = await pdfParse(fs.readFileSync(filePath));
      text = data.text;
    }
    // IMAGE (OCR)
    else if (mimeType.startsWith("image/")) {
      const result = await Tesseract.recognize(filePath, "eng");
      text = result.data.text;
    }
    // WORD .DOCX
    else if (originalName.endsWith(".docx")) {
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    }
    // OLD WORD .DOC
    else if (originalName.endsWith(".doc")) {
      const textract = require("textract");
      text = await new Promise((resolve, reject) => {
        textract.fromFileWithPath(filePath, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
    }
    // TEXT / EMAIL
    else if (mimeType === "text/plain" || originalName.endsWith(".eml")) {
      text = fs.readFileSync(filePath, "utf8");
    }
    // EXCEL FILES
    else if (originalName.endsWith(".xls") || originalName.endsWith(".xlsx")) {
      const xlsx = require("xlsx");
      const workbook = xlsx.readFile(filePath);
      const sheets = workbook.SheetNames;
      text = sheets.map(name => xlsx.utils.sheet_to_txt(workbook.Sheets[name])).join("\n");
    }
    // FALLBACK
    else {
      text = fs.readFileSync(filePath, "utf8");
    }

    fs.unlinkSync(filePath);

    const events = await aiExtractEvents(text);
    LAST_EXTRACTED_EVENTS = events;
    LAST_RAW_TEXT = text;

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

// ================= TEXT PARSE ENDPOINT =================
app.post("/parse-text", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided" });

  try {
    const events = await aiExtractEvents(text);
    app.get("/api/last-events", (req, res) => {
    if (!LAST_EXTRACTED_EVENTS) {
      return res.status(404).json({ error: "No cached events yet" });
    }
      res.json({ events: LAST_EXTRACTED_EVENTS, rawText: LAST_RAW_TEXT });
    });
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

// ================= CREATE GOOGLE CALENDAR EVENTS =================
app.post("/create-events", async (req, res) => {
  const { events } = req.body;
  if (!events || !events.length) {
    return res.status(400).json({ error: "No events provided" });
  }

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  console.log("TZ:", CLIENT_TIMEZONE);
  try {
    for (let e of events) {
      await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: e.title,
          start: { dateTime: e.start, timeZone: CLIENT_TIMEZONE},
          end: { dateTime: e.end, timeZone: CLIENT_TIMEZONE },
          location: e.location || "",
          description: e.description || "",
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 7 * 24 * 60 }, // 1 week
              { method: "popup", minutes: 24 * 60 }, // 1 day
              { method: "popup", minutes: 60 }, // 1 hour
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

// ================= EXPORT ICS FILE =================
app.post("/export-ics", (req, res) => {
  const { events } = req.body;

  const icsEvents = events.map((e) => {
    const s = new Date(e.start);
    const en = new Date(e.end);

    return {
      title: e.title,
      description: e.description,
      location: e.location,
      start: [
        s.getFullYear(),
        s.getMonth() + 1,
        s.getDate(),
        s.getHours(),
        s.getMinutes(),
      ],
      end: [
        en.getFullYear(),
        en.getMonth() + 1,
        en.getDate(),
        en.getHours(),
        en.getMinutes(),
      ],
      recurrenceRule: e.recurrence || undefined,
    };
  });

  createEvents(icsEvents, (err, value) => {
    if (err) return res.status(500).send(err);
    res.setHeader("Content-Type", "text/calendar");
    res.setHeader("Content-Disposition", "attachment; filename=events.ics");
    res.send(value);
  });
});

// ================= AI EVENT EXTRACTION WITH FALLBACK =================
async function aiExtractEvents(text) {
  const prompt = `
Extract all meeting/event details from the following text.

Return ONLY a valid JSON array with this exact structure:
[
  {
    "title": "Meeting title",
    "start": "ISO 8601 datetime",
    "end": "ISO 8601 datetime",
    "location": "Physical address or virtual location",
    "description": "Any additional details, Zoom/Teams links, contact info"
  }
]

Rules:
- Don't create any event for past date
- Extract meeting title, date, time, location, Zoom/Teams/Meet links, contact info
- Convert all dates/times to ISO 8601 format (e.g., "2024-05-15T14:00:00")
- If end time is missing, add 1 hour to start time
- Include Zoom/Teams/Meet links in description
- Do NOT include any explanation or markdown


Text:
${text}
`;

  // TRY GPT-5-MINI FIRST
  try {
    console.log("🔵 Using OpenAI gpt-5-mini...");

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
     
    });

    const aiText = response.choices[0].message.content.trim();
    
    // Remove markdown code blocks if present
    const cleanedText = aiText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    
    const parsed = JSON.parse(cleanedText);

    return normalizeAIEvents(parsed, text);
  } catch (err) {
    console.warn("⚠️ gpt-5-mini failed:", err.message);
    
    // FALLBACK TO GPT-4O-MINI
    try {
      console.log("🔵 Trying fallback: gpt-4o-mini...");
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      });

      const aiText = response.choices[0].message.content.trim();
      const cleanedText = aiText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      const parsed = JSON.parse(cleanedText);

      return normalizeAIEvents(parsed, text);
    } catch (fallbackErr) {
      console.warn("⚠️ gpt-4o-mini also failed:", fallbackErr.message);
    }
  }

  // FINAL FALLBACK TO CHRONO-NODE
  console.warn("🧠 Using chrono-node fallback...");
  return parseEventsWithChrono(text);
}

// ================= NORMALIZE AI RESPONSE =================
function normalizeAIEvents(aiEvents, text) {
  return aiEvents.map((e, idx) => ({
    id: idx + 1,
    title: e.title || `Event ${idx + 1}`,
    start: e.start || new Date().toISOString(),
    end: e.end || new Date(Date.now() + 3600000).toISOString(),
    location: e.location || "",
     description: `${e.description || ""}\n\n${extractLinks(text) ? extractLinks(text) + "\n\n" : ""}`.trim()+ text,
    ambiguous: false,
    recurrence: detectRecurrence(text),
  }));
}

// ================= CHRONO FALLBACK PARSER =================
function parseEventsWithChrono(text) {
  const results = chrono.parse(text);
  const events = [];

  results.forEach((r, idx) => {
    const startDate = r.start?.date();
    let endDate = r.end?.date();

    if (!endDate && startDate) {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // default 1 hr
    }

    const ambiguous =
      !r.start.isCertain("hour") || !r.start.isCertain("minute");

    const title = extractTitle(text, r.text);
    const location = extractLocation(text);

    events.push({
      id: idx + 1,
      title: title || `Event ${idx + 1}`,
      start: startDate?.toISOString(),
      end: endDate?.toISOString(),
      location,
      description: extractLinks(text)+ text,
      ambiguous,
      recurrence: detectRecurrence(text),
    });
  });

  return events;
}

// ================= EXTRACT TITLE =================
function extractTitle(text, chronoText) {
  const firstLine = text.split("\n")[0].trim();

  // Remove dates/times from first line
  let title = firstLine
    .replace(/\b(on|at|from|to)\b.*$/i, "")
    .replace(/\d{1,2}[:/]\d{1,2}.*$/, "")
    .trim();

  if (title.length > 5) return title;

  // Fallback: find sentence with meeting keywords
  const keywords = [
    "meeting",
    "class",
    "exam",
    "interview",
    "appointment",
    "call",
    "session",
  ];
  for (let k of keywords) {
    const m = text.match(new RegExp(`(.{0,40}${k}.{0,40})`, "i"));
    if (m) return m[1].trim();
  }

  return text.slice(0, 50);
}

// ================= EXTRACT LOCATION =================
function extractLocation(text) {
  const locMatch = text.match(/\b(?:at|in|location:)\s+([A-Z][A-Za-z0-9 ,.-]+)/i);
  return locMatch ? locMatch[1].trim() : "";
}

// ================= EXTRACT ZOOM/TEAMS LINKS =================
function extractLinks(text) {
  const zoomMatch = text.match(/(https?:\/\/[^\s]*zoom[^\s]*)/i);
  const teamsMatch = text.match(/(https?:\/\/[^\s]*teams[^\s]*)/i);
  const meetMatch = text.match(/(https?:\/\/[^\s]*meet[^\s]*)/i);

  let links = [];
  if (zoomMatch) links.push(`Zoom: ${zoomMatch[1]}`);
  if (teamsMatch) links.push(`Teams: ${teamsMatch[1]}`);
  if (meetMatch) links.push(`Meet: ${meetMatch[1]}`);

  return links.length > 0 ? links.join("\n") : text;
}

// ================= DETECT RECURRENCE =================
function detectRecurrence(text) {
  text = text.toLowerCase();

  if (/every day|daily/.test(text)) return "RRULE:FREQ=DAILY";
  if (/every week|weekly/.test(text)) return "RRULE:FREQ=WEEKLY";
  if (/every month|monthly/.test(text)) return "RRULE:FREQ=MONTHLY";

  // Mon/Wed/Fri pattern
  const days = [];
  if (/monday|mon\b/.test(text)) days.push("MO");
  if (/tuesday|tue\b/.test(text)) days.push("TU");
  if (/wednesday|wed\b/.test(text)) days.push("WE");
  if (/thursday|thu\b/.test(text)) days.push("TH");
  if (/friday|fri\b/.test(text)) days.push("FR");
  if (/saturday|sat\b/.test(text)) days.push("SA");
  if (/sunday|sun\b/.test(text)) days.push("SU");

  if (days.length > 1) {
    return `RRULE:FREQ=WEEKLY;BYDAY=${days.join(",")}`;
  }

  return null;
}

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
