require("dotenv").config(); // <-- MUST be first
const { encrypt, decrypt } = require("./utils/encryption");
const prisma = require("./db");
//import { PrismaClient } from "@prisma/client";
//import config from "../prisma.config"; // or correct relative path
//const prisma = new PrismaClient(config.datasource);
const {
  upsertUserWithGoogle,
  getUserByEmail,
  disconnectGoogle,
} = require("./services/userService");
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



// ================== IN-MEMORY CACHE ==================
// Caches the most recent GPT request/response so you can re-test /create-events
// without calling GPT again.
let LAST_EXTRACTED_EVENTS = null;
let LAST_RAW_TEXT = null;

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
//app.use(express.json());

// ✅ Cache read endpoint (TOP-LEVEL, NOT INSIDE OTHER ROUTES)
app.get("/api/last-events", (req, res) => {
  if (!LAST_EXTRACTED_EVENTS) {
    return res.status(404).json({ error: "No cached events yet" });
  }
  res.json({ events: LAST_EXTRACTED_EVENTS, rawText: LAST_RAW_TEXT });
});

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


// ================= GOOGLE AUTH START =================
app.get("/auth/google", (req, res) => {
  const { userEmail } = req.query;

  if (!userEmail) {
    return res.status(400).send("userEmail is required");
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar"],
    prompt: "consent",
    state: userEmail, // ← secure way to pass email
  });

  res.redirect(authUrl);
});
// ================= OAUTH CLIENT FACTORY =================
async function getOAuthClientForUser(userEmail) {
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
  });

  if (!user || !user.googleRefreshToken) {
    throw new Error("Google not connected for this user");
  }

  const oauthClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  // Set encrypted refresh token
  oauthClient.setCredentials({
    refresh_token: decrypt(user.googleRefreshToken),
    access_token: user.googleAccessToken || undefined,
    expiry_date: user.tokenExpiry?.getTime() || undefined,
  });

  // Auto-save refreshed tokens
  oauthClient.on("tokens", async (tokens) => {
    try {
      const updateData = {};

      if (tokens.access_token) {
        updateData.googleAccessToken = tokens.access_token;
      }

      if (tokens.expiry_date) {
        updateData.tokenExpiry = new Date(tokens.expiry_date);
      }

      if (tokens.refresh_token) {
        updateData.googleRefreshToken = encrypt(tokens.refresh_token);
      }

      await prisma.user.update({
        where: { email: userEmail },
        data: updateData,
      });

      console.log(`🔁 Tokens auto-updated for ${userEmail}`);
    } catch (err) {
      console.error("Token auto-save failed:", err);
    }
  });

  return oauthClient;
}
// ================= GOOGLE OAUTH CALLBACK =================
app.get("/oauth2callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const userEmail = state;

    if (!code || !userEmail) {
      return res.status(400).send("Missing code or userEmail");
    }

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return res.status(400).send(
        "No refresh token returned. Make sure prompt=consent is used."
      );
    }
    
    await upsertUserWithGoogle(userEmail, tokens);
    await prisma.user.upsert({
      where: { email: userEmail },
      update: {
        googleRefreshToken: encrypt(tokens.refresh_token),
        googleAccessToken: tokens.access_token,
        tokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        googleConnected: true,
      },
      create: {
        email: userEmail,
        googleRefreshToken: encrypt(tokens.refresh_token),
        googleAccessToken: tokens.access_token,
        tokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        googleConnected: true,
      },
    });

    console.log(`✅ Google connected for ${userEmail}`);

   // NEW (for popup flow)
// safer postMessage in /oauth2callback
const html = `
  <script>
    if (window.opener) {
      window.opener.postMessage({ success: true, userEmail: "${userEmail}" }, "*");
      window.close();
    } else {
      document.write("✅ Google account connected successfully. You can close this tab.");
    }
  </script>
`;
res.send(html);
  } catch (err) {
    console.error("OAuth error:", err);
    res.status(500).send("OAuth failed: " + err.message);
  }
});
//oauth2Client.setCredentials({
 // refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
//});

// ================= OPENAI SETUP =================

// ================= OPENAI SETUP =================
const DISABLE_OPENAI = process.env.DISABLE_OPENAI === "true";

let openai = null;

if (!DISABLE_OPENAI) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log("🧠 OpenAI ENABLED");
} else {
  console.log("🛑 OpenAI DISABLED via environment flag");
}
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
    // OLD WORD .DOC — use mammoth with fallback to raw text
else if (originalName.endsWith(".doc")) {
  try {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    text = result.value;
  } catch (docErr) {
    console.warn("mammoth failed on .doc, trying raw read:", docErr.message);
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch (rawErr) {
      throw new Error(
        "Could not read .doc file. Please save it as .docx and try again."
      );
    }
  }
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
      text = sheets
        .map((name) => xlsx.utils.sheet_to_txt(workbook.Sheets[name]))
        .join("\n");
    }
    // FALLBACK
    else {
      text = fs.readFileSync(filePath, "utf8");
    }

    fs.unlinkSync(filePath);

    const events = await aiExtractEvents(text);

    // ✅ Cache GPT extraction result
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

    // ✅ Cache GPT extraction result
    LAST_EXTRACTED_EVENTS = events;
    LAST_RAW_TEXT = text;

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
  const { events, userEmail } = req.body;

  if (!events || !events.length) {
    return res.status(400).json({ error: "No events provided" });
  }
if (!userEmail) {
  return res.status(400).json({ error: "userEmail required" });
}
  try {
    const oauthClient = await getOAuthClientForUser(userEmail);

    const calendar = google.calendar({
      version: "v3",
      auth: oauthClient,
    });

    for (let e of events) {
      await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: e.title,
          start: { dateTime: e.start, timeZone: CLIENT_TIMEZONE },
          end: { dateTime: e.end, timeZone: CLIENT_TIMEZONE },
          location: e.location || "",
          description: e.description || "",
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 7 * 24 * 60 },
              { method: "popup", minutes: 24 * 60 },
              { method: "popup", minutes: 60 },
            ],
          },
        },
      });
    }

    res.json({ message: "Events created successfully!" });
  } catch (err) {
    if (
  err.response?.data?.error === "invalid_grant" ||
  err.message?.includes("invalid_grant")
) {
      await prisma.user.update({
        where: { email: userEmail },
        data: { googleConnected: false },
      });

      return res.status(401).json({
        error: "Google authorization expired. Please reconnect.",
      });
    }

    console.error("Calendar error:", err);
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
      start: [s.getFullYear(), s.getMonth() + 1, s.getDate(), s.getHours(), s.getMinutes()],
      end: [en.getFullYear(), en.getMonth() + 1, en.getDate(), en.getHours(), en.getMinutes()],
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
// ================= CUSTOM EVENT EXTRACTOR (no AI needed) =================
async function customExtractEvents(text) {
  const events = [];
  let idCounter = 1;

  const MONTHS = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
  const MONTH_ABBR = /\b(jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/i;
  const TIME_RE = /\b(\d{1,2}:\d{2}\s*(am|pm)?|\d{1,2}\s*(am|pm))\b/i;
  const YEAR_RE = /\b(202[4-9]|203\d)\b/;

  const extractBlockTitle = (block) => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const clean = line.replace(/[–—\-·•]/g, "").trim();
      if (clean.length < 5) continue;
      if (clean === clean.toUpperCase() && clean.length < 100) return clean;
      if (clean.length < 60) return clean;
    }
    return lines[0]?.slice(0, 80) || "Event";
  };

  const extractDate = (block) => {
    const results = chrono.parse(block, new Date(), { forwardDate: true });
    if (results.length > 0) {
      const r = results[0];
      const start = r.start.date();
      const end = r.end ? r.end.date() : new Date(start.getTime() + 3600000);
      const ambiguous = !r.start.isCertain("hour") || !r.start.isCertain("minute");
      return { start, end, ambiguous };
    }
    const monthMatch = block.match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(202\d)/i
    );
    if (monthMatch) {
      const d = new Date(`${monthMatch[1]} ${monthMatch[2]}, ${monthMatch[3]}`);
      if (!isNaN(d)) return { start: d, end: new Date(d.getTime() + 3600000), ambiguous: true };
    }
    const lower = block.toLowerCase();
    const year = (block.match(YEAR_RE) || [])[1] || new Date().getFullYear() + 1;
    if (/\bearly fall\b|\bseptember\b/.test(lower)) return { start: new Date(`September 1, ${year}`), end: new Date(`September 1, ${year} 01:00`), ambiguous: true };
    if (/\boctober\b|\bfall\b/.test(lower))         return { start: new Date(`October 1, ${year}`),   end: new Date(`October 1, ${year} 01:00`),   ambiguous: true };
    if (/\bnovember\b/.test(lower))                  return { start: new Date(`November 1, ${year}`),  end: new Date(`November 1, ${year} 01:00`),  ambiguous: true };
    if (/\bdecember\b/.test(lower))                  return { start: new Date(`December 1, ${year}`),  end: new Date(`December 1, ${year} 01:00`),  ambiguous: true };
    if (/\bspring\b|\bmarch\b/.test(lower))          return { start: new Date(`March 1, ${year}`),     end: new Date(`March 1, ${year} 01:00`),     ambiguous: true };
    if (/\bapril\b/.test(lower))                     return { start: new Date(`April 1, ${year}`),     end: new Date(`April 1, ${year} 01:00`),     ambiguous: true };
    if (/\bmay\b/.test(lower))                       return { start: new Date(`May 1, ${year}`),       end: new Date(`May 1, ${year} 01:00`),       ambiguous: true };
    if (/\bsummer\b|\bjune\b|\bjuly\b/.test(lower)) return { start: new Date(`June 1, ${year}`),      end: new Date(`June 1, ${year} 01:00`),      ambiguous: true };
    if (/\baugust\b/.test(lower))                    return { start: new Date(`August 1, ${year}`),    end: new Date(`August 1, ${year} 01:00`),    ambiguous: true };
    if (/\bjanuary\b/.test(lower))                   return { start: new Date(`January 1, ${year}`),   end: new Date(`January 1, ${year} 01:00`),   ambiguous: true };
    if (/\bfebruary\b/.test(lower))                  return { start: new Date(`February 1, ${year}`),  end: new Date(`February 1, ${year} 01:00`),  ambiguous: true };
    return null;
  };

  const isEventBlock = (block) => {
    const hasDate = MONTHS.test(block) || MONTH_ABBR.test(block) || TIME_RE.test(block) || YEAR_RE.test(block);
    const hasEventKeyword = /\b(event|dance|dinner|party|tea|ceremony|reception|skit|prom|graduation|chapel|sunrise|sunset|celebration|portrait|photo|brunch|meal|breakfast|lunch|meeting|class|game|practice|social|parade)\b/i.test(block);
    const isBulletList = (block.match(/^[·•●\-]/gm) || []).length > 3;
    const isHeadingOnly = block.split("\n").length === 1 && block.length < 40;
    return (hasDate || hasEventKeyword) && !isBulletList && !isHeadingOnly;
  };

  const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(b => b.length > 10);

  for (const block of blocks) {
    if (!isEventBlock(block)) continue;
    const dateInfo = extractDate(block);
    if (!dateInfo) continue;
    const title = extractBlockTitle(block);
    const location = extractLocation(block);
    const links = extractLinks(block);
    const recurrence = detectRecurrence(block);
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const desc = lines.slice(1).join(" ").slice(0, 300);
    events.push({
      id: idCounter++,
      title,
      start: dateInfo.start.toISOString(),
      end: dateInfo.end.toISOString(),
      location,
      description: links !== block ? links : desc,
      ambiguous: dateInfo.ambiguous,
      recurrence,
    });
  }
  return events;
}
// ================= AI EVENT EXTRACTION WITH FALLBACK =================
async function aiExtractEvents(text) {
   // 🔥 HARD STOP if disabled
 if (DISABLE_OPENAI) {
  console.log("🔵 DISABLE_OPENAI=true — using custom extractor");
  try {
    const results = await customExtractEvents(text);
    if (results.length > 0) {
      console.log(`✅ Custom extractor found ${results.length} events`);
      return results;
    }
    console.warn("⚠ Custom extractor found 0 — falling back to chrono");
  } catch (err) {
    console.warn("⚠ Custom extractor failed:", err.message);
  }
  return parseEventsWithChrono(text);
}
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

 // FALLBACK TO CUSTOM EXTRACTOR
  console.warn("🧠 Trying custom extractor as fallback...");
  try {
    const results = await customExtractEvents(text);
    if (results.length > 0) return results;
  } catch (err) {
    console.warn("⚠ Custom extractor failed:", err.message);
  }

  // FINAL FALLBACK TO CHRONO-NODE
  console.warn("🧠 Final fallback: chrono-node");
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
    description: `${e.description || ""}\n\n${extractLinks(text) ? extractLinks(text) + "\n\n" : ""}`.trim() ,
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

    const ambiguous = !r.start.isCertain("hour") || !r.start.isCertain("minute");

    const title = extractTitle(text, r.text);
    const location = extractLocation(text);

    events.push({
      id: idx + 1,
      title: title || `Event ${idx + 1}`,
      start: startDate?.toISOString(),
      end: endDate?.toISOString(),
      location,
      description: extractLinks(text) ,
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
  const keywords = ["meeting", "class", "exam", "interview", "appointment", "call", "session"];
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
