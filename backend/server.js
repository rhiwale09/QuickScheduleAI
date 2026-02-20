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
const axios = require("axios");

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

    
    // WORD FILES
  else if (originalName.endsWith(".docx")) {
  // ONLY docx → Mammoth
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ path: filePath });
  text = result.value;
}
// WORD DOC
else if (originalName.endsWith(".doc")) {
  // OLD doc → textract
  const textract = require("textract");

  text = await new Promise((resolve, reject) => {
    textract.fromFileWithPath(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}
    // word DOCX
    /*else if (
      mimeType === "application/msword" ||
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      originalName.endsWith(".doc") ||
      originalName.endsWith(".docx")
    ) {
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    }*/

    // TEXT / EMAIL
    else if (
      mimeType === "text/plain" ||
      originalName.endsWith(".eml")
    ) {
      text = fs.readFileSync(filePath, "utf8");
    }

    // FALLBACK (try reading anyway)
    else {
      text = fs.readFileSync(filePath, "utf8");
    }

    fs.unlinkSync(filePath);

    const events = await aiExtractEvents(text);

    res.json({
      rawText: text,
      events,
      needsConfirmation: events.some(e => e.ambiguous),
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


// ================= AI PARSER WITH FALLBACK =================
async function aiExtractEvents(text) {
  const prompt = `
Extract all events from the following text.

Return ONLY valid JSON array.
Do NOT include explanation.
Format:
[
 {
   "title": "...",
   "start": "ISO_DATE",
   "end": "ISO_DATE",
   "location": "...",
   "description": "..."
   "Zoom or Team link":"..."
 }
]

Text:
${text}
`;
 // 1️⃣ TRY OPENAI
 
  try {
    console.log("🔵 Trying OpenAI...");

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    const aiText = response.choices[0].message.content.trim();

    const parsed = JSON.parse(aiText);

    return normalizeAIEvents(parsed, text);

  } catch (err) {
    console.warn("⚠️ OpenAI failed:", err.message);
  }

  // 2️⃣ TRY OLLAMA (LOCAL)
  try {
    console.log("🟢 Trying Ollama...");
    const ollamaRes = await axios.post(
      `${process.env.OLLAMA_URL || "http://localhost:11434"}/api/generate`,
      {
        model: "llama3",
        prompt,
        stream: false
      }
    );

    return normalizeAIEvents(JSON.parse(ollamaRes.data.response), text);
  } catch (err) {
    console.warn("⚠️ Ollama failed:", err.message);
  }

  // 3️⃣ TRY HUGGINGFACE (FREE)
  try {
    console.log("🟠 Trying HuggingFace...");
    const hfRes = await axios.post(
      "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
      { inputs: prompt },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`
        },
        timeout: 20000
      }
    );

    const aiText = hfRes.data[0].generated_text;
    return normalizeAIEvents(JSON.parse(aiText), text);
  } catch (err) {
    console.warn("⚠️ HuggingFace failed:", err.message);
  }

  // 4️⃣ FINAL FALLBACK → CHRONO
  console.warn("🧠 Using chrono-node fallback");
  return parseEventsFromText(text);
}


// ================= NORMALIZER =================
function normalizeAIEvents(aiEvents, text) {
  return aiEvents.map((e, idx) => ({
    id: idx + 1,
    title: e.title || `Event ${idx + 1}`,
    start: e.start || new Date().toISOString(),
    end: e.end || new Date(Date.now() + 3600000).toISOString(),
    location: e.location || "",
    description: e.description || text,
    ambiguous: false,
  }));
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
    //let title = surroundingText.split(" ").slice(0, 6).join(" ");
    
    let location = "";
    const locMatch = surroundingText.match(/\b(?:at|in)\s+([A-Za-z0-9 ,.-]+)/i);
    if (locMatch) location = locMatch[1];
    let title = extractTitle(text);
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
function extractTitle(text) {
  // Try subject-style first line
  const firstLine = text.split("\n")[0];

  // Remove dates/times
  let title = firstLine
    .replace(/\b(on|at|from|to)\b.*$/i, "")
    .replace(/\d{1,2}[:/]\d{1,2}.*$/, "")
    .trim();

  if (title.length > 5) return title;

  // fallback: find sentence with keyword
  const keywords = ["class", "meeting", "exam", "interview", "appointment"];
  for (let k of keywords) {
    const m = text.match(new RegExp(`(.{0,40}${k}.{0,40})`, "i"));
    if (m) return m[1];
  }

  return text.slice(0, 40);
}

function detectRecurrence(text) {
  text = text.toLowerCase();

  if (/every day|daily/.test(text))
    return "RRULE:FREQ=DAILY";

  if (/every week|weekly/.test(text))
    return "RRULE:FREQ=WEEKLY";

  if (/every month|monthly/.test(text))
    return "RRULE:FREQ=MONTHLY";

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

function extractWithChrono(text) {
  const results = chrono.parse(text);
  const events = [];

  results.forEach((r, idx) => {
    const startDate = r.start?.date();
    let endDate = r.end?.date() || new Date(startDate.getTime() + 60*60*1000);

    const ambiguous = !r.start.isCertain("hour");

    // Detect recurring keywords
    let recurrence = detectRecurrence(text);


    // Title heuristic
    let title = text.split("\n")[0].slice(0,80);

    // Location heuristic
    let locMatch = text.match(/\b(at|in)\s+([A-Z][A-Za-z0-9 ,]+)/);
    let location = locMatch ? locMatch[2] : "";

    events.push({
      id: idx+1,
      title,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      location,
      description: text,   // FULL EMAIL BODY
      ambiguous,
      recurrence
    });
  });

  return events;
}
app.post("/export-ics", (req, res) => {
  const { events } = req.body;

  const icsEvents = events.map(e => {
    const s = new Date(e.start);
    const en = new Date(e.end);

    return {
      title: e.title,
      description: e.description,
      location: e.location,
      start: [s.getFullYear(), s.getMonth()+1, s.getDate(), s.getHours(), s.getMinutes()],
      end: [en.getFullYear(), en.getMonth()+1, en.getDate(), en.getHours(), en.getMinutes()],
      recurrenceRule: e.recurrence || undefined
    };
  });

  createEvents(icsEvents, (err, value) => {
    if (err) return res.status(500).send(err);
    res.setHeader("Content-Type", "text/calendar");
    res.setHeader("Content-Disposition", "attachment; filename=events.ics");
    res.send(value);
  });
});
