"use strict";

/**
 * QuickScheduleAI — Local Event Extraction Model v3
 * Zero cost, zero API. Pure Node.js.
 *
 * Four strategies (run in priority order, results merged + deduped):
 *   A) Structured table parser  (Date\tTitle tab-separated tables)
 *   B) Context-aware calendar   (MONTH headers + M/D numeric dates)
 *   C) Inline date parser       (April 29 - Title, Title April 29th)
 *   D) Block/paragraph parser   (ALL-CAPS headings + body text)
 */

// ── CONSTANTS ────────────────────────────────────────────────────
const MONTH_NAMES = {
  january:1,february:2,march:3,april:4,may:5,june:6,
  july:7,august:8,september:9,october:10,november:11,december:12,
  jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
};
const SEASON_MAP = {
  "early fall":9,"fall":10,"late fall":11,
  "early spring":3,"spring":4,"late spring":5,
  "early summer":6,"summer":7,"late summer":8,"winter":1,
};
const VOCAB_HIGH = [
  "meeting","dinner","party","prom","graduation","chapel","ceremony","reception",
  "baccalaureate","homecoming","assembly","dance","skit","brunch","banquet",
  "conference","presentation","orientation","webinar","fair","drive","election",
  "exam","test","deadline","due","celebration","sunrise","sunset","tea","luncheon",
  "breakfast","lunch","session","workshop","retreat","concert","performance",
  "game","tournament","commencement","convocation","induction","showcase","expo",
  "gala","parade","rally","competition","holiday","dismissal","break","begins",
  "program","seminar","course","class","registration","deadline","forms","due",
];
const SKIP_RE = /\b(submit|upload|download|purchase|fee|format|criteria|handbook|jostens|jpeg|sign\s+up\s+will|please\s+include|link\s+to|naviance|registration\s+deadline|late\s+registration)\b/i;
const MONTH_HEADER_RE = /^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s*(202\d)?$/i;
const DAY_PREFIX_RE   = /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*/i;
const FULL_DATE_RE    = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*202\d)?\b/i;
const NUMERIC_DATE_RE = /\b\d{1,2}\/\d{1,2}\b/;

// ── HELPERS ──────────────────────────────────────────────────────
function monthNum(name) { return MONTH_NAMES[name.toLowerCase()]; }

function parseFullDate(text, refYear) {
  // "Monday, April 13" or "April 13, 2026" or "April 13"
  const m = text.match(/(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(202\d))?/i);
  if (!m) return null;
  const yr = m[3] ? parseInt(m[3]) : refYear;
  const d  = new Date(yr, monthNum(m[1])-1, parseInt(m[2]));
  return isNaN(d) ? null : d;
}

function applyTime(text, base) {
  // Range: "6:30-7:30 p.m." or "9 a.m.-12:30 p.m." or "1:15-4:45 p.m."
  const r = text.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
  if (r) {
    let sh=parseInt(r[1]),sm=parseInt(r[2]||"0"),eh=parseInt(r[4]),em=parseInt(r[5]||"0");
    const sap=(r[3]||"").toLowerCase().replace(/\./g,""), eap=(r[6]||"").toLowerCase().replace(/\./g,"");
    if (eap==="pm"&&eh<12) eh+=12;
    if (sap==="pm"&&sh<12) sh+=12;
    if (eap==="pm"&&sap===""&&sh<eh&&sh<12) sh+=12; // "9-12:30 p.m." -> both pm
    if (sap==="am"&&sh===12) sh=0;
    const s=new Date(base); s.setHours(sh,sm,0,0);
    const e=new Date(base); e.setHours(eh,em,0,0);
    return {start:s,end:e,hasTime:true};
  }
  // Single: "7 p.m." or "11 a.m."
  const s2 = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (s2) {
    let h=parseInt(s2[1]); const m=parseInt(s2[2]||"0"), ap=s2[3].toLowerCase().replace(/\./g,"");
    if (ap==="pm"&&h<12) h+=12;
    if (ap==="am"&&h===12) h=0;
    const s=new Date(base); s.setHours(h,m,0,0);
    return {start:s,end:new Date(s.getTime()+3600000),hasTime:true};
  }
  return {start:base,end:new Date(base.getTime()+3600000),hasTime:false};
}

function cleanTitle(t) {
  if (!t) return "";
  // Strip leading month header e.g. "OCTOBER\tTitle"
  const M = 'JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER';
  t = t.replace(new RegExp('^(?:'+M+')(?:\\s+202\\d)?[\\t ]+','i'),'');
  // Strip "ON APRIL 20" trailing date from heading titles
  t = t.replace(/\s+ON\s+(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)?,?\s*(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d+/i,'');
  // Strip "DUE MONDAY, APRIL 13" patterns
  t = t.replace(/\s+DUE\s+(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)?,?\s*(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d+/i,' (due)');
  t = t.replace(/\s*[-–:]\s*$/,"").replace(/^[-–:\s]+/,"").replace(/\s+/g," ").slice(0,80).trim();
  return t;
}

function toTitleCase(str) {
  const S=new Set(["a","an","the","and","or","but","in","on","at","to","for","of","with","by"]);
  return str.toLowerCase().replace(/\b\w+/g,(w,i)=>i===0||!S.has(w)?w[0].toUpperCase()+w.slice(1):w);
}

function makeEvent(title, dateInfo, description, confidence) {
  return {
    title: title.trim().slice(0,80),
    start: dateInfo.start.toISOString(),
    end:   dateInfo.end.toISOString(),
    location: "",
    description: description || title,
    ambiguous: dateInfo.ambiguous !== false && !dateInfo.hasTime,
    recurrence: null,
    confidence,
  };
}

// ── DEDUPLICATOR ─────────────────────────────────────────────────
function deduplicate(events) {
  const seen = new Map();
  return events.filter(e => {
    const dk = new Date(e.start).toDateString();
    const tk = e.title.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,20);
    const key = `${tk}|${dk}`;
    if (seen.has(key)) return false;
    for (const [k] of seen) {
      if (k.endsWith(dk) && sim(tk, k.split("|")[0]) > 0.75) return false;
    }
    seen.set(key, true);
    return true;
  });
}
function sim(a,b) {
  if(a===b)return 1; if(a.length<2||b.length<2)return 0;
  const bg=new Map(); for(let i=0;i<a.length-1;i++){const s=a.slice(i,i+2);bg.set(s,(bg.get(s)||0)+1);}
  let x=0; for(let i=0;i<b.length-1;i++){const s=b.slice(i,i+2);if(bg.get(s)>0){x++;bg.set(s,bg.get(s)-1);}}
  return(2*x)/(a.length+b.length-2);
}

// ────────────────────────────────────────────────────────────────
// STRATEGY A: Structured table parser
// Handles tab-separated "Date\tTitle" tables like:
//   "Monday, April 13\tCompleted forms due"
//   "Monday, April 20\tCollege Money Method Webinar at 7 p.m."
// Also handles test tables: "ACT\tApril 11\tMarch 6"
// ────────────────────────────────────────────────────────────────
function parseTableFormat(text, refYear) {
  const events = [];
  const lines  = text.split("\n").map(l=>l.trim()).filter(Boolean);

  for (const line of lines) {
    if (!line.includes("\t")) continue;
    const parts = line.split("\t").map(p=>p.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    // Pattern A: "Monday, April 13\tTitle"
    const dateInFirst = parseFullDate(parts[0], refYear);
    if (dateInFirst && parts[1] && parts[1].length > 2) {
      const title = cleanTitle(parts[1]);
      if (title.length < 3 || SKIP_RE.test(title)) continue;
      const ti = applyTime(parts[1], dateInFirst);
      events.push(makeEvent(title, {start:ti.start,end:ti.end,hasTime:ti.hasTime,ambiguous:!ti.hasTime}, line, 95));
      continue;
    }

    // Pattern B: "TEST_NAME\tApril 11\tRegistration..." — use second column as date, first as title
    if (parts.length >= 2) {
      const dateInSecond = parseFullDate(parts[1], refYear);
      if (dateInSecond && parts[0].length > 1 && parts[0].length < 20) {
        // Skip if first col looks like a header
        if (/^(test|date|program|deadline|registration)/i.test(parts[0])) continue;
        const title = cleanTitle(parts[0]) + " — " + (parts[2] || "").replace(/registration deadline.*/i,"").trim();
        if (title.trim().length < 2) continue;
        const ti = applyTime(parts[1], dateInSecond);
        events.push(makeEvent(parts[0].trim(), {start:ti.start,end:ti.end,hasTime:ti.hasTime,ambiguous:!ti.hasTime}, line, 90));
        continue;
      }
    }
  }
  return events;
}

// ────────────────────────────────────────────────────────────────
// STRATEGY B: Context-aware calendar parser
// Handles MONTH headers + numeric M/D dates
// ────────────────────────────────────────────────────────────────
function parseCalendarFormat(text, refYear) {
  const events = [];
  const lines  = text.split("\n").map(l=>l.trim()).filter(Boolean);
  let ctxMonth = null, ctxYear = refYear, pending = null;

  const parseNum = (m,d,yStr,fallbackYear) => {
    const yr = yStr ? (yStr.length===2?2000+parseInt(yStr):parseInt(yStr)) : fallbackYear;
    const dt = new Date(yr, parseInt(m)-1, parseInt(d));
    return isNaN(dt)?null:dt;
  };
  const yearFor = (month) => (!ctxMonth||month>=ctxMonth) ? ctxYear : ctxYear+1;

  for (let i=0; i<lines.length; i++) {
    const line = lines[i];
    const hm   = line.match(MONTH_HEADER_RE);
    if (hm) { ctxMonth=monthNum(hm[1]); if(hm[2])ctxYear=parseInt(hm[2]); pending=null; continue; }
    if (SKIP_RE.test(line)||line.length<3) continue;

    const stripped = line.replace(DAY_PREFIX_RE,"").trim();

    // Range with title: "11/23 - 11/27    Fall Break"
    const rt = line.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[-–]\s*(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s{2,}(.*)/i);
    if (rt) {
      const sm=parseInt(rt[1]),sd=parseInt(rt[2]),em=parseInt(rt[4]),ed=parseInt(rt[5]);
      const sy=rt[3]?(rt[3].length===2?2000+parseInt(rt[3]):parseInt(rt[3])):yearFor(sm);
      const ey=rt[6]?(rt[6].length===2?2000+parseInt(rt[6]):parseInt(rt[6])):(em<sm?ctxYear+1:ctxYear);
      const start=new Date(sy,sm-1,sd), end=new Date(ey,em-1,ed);
      const title=cleanTitle(rt[7].trim());
      if(!isNaN(start)&&title.length>1){events.push(makeEvent(title,{start,end,ambiguous:false},title,90));pending=null;continue;}
    }

    // Date+title 2+ spaces: "1/4/27   Second Semester Begins"
    const nt = stripped.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s{2,}(.+)/);
    if (nt) {
      const m=parseInt(nt[1]),d=parseNum(nt[1],nt[2],nt[3],yearFor(m));
      if(d){const title=cleanTitle(nt[4].trim());if(title.length>1){events.push(makeEvent(title,applyTime(nt[4],d),title,90));pending=null;continue;}}
    }

    // Pure numeric date
    const pn = stripped.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*$/);
    if (pn) {
      const m=parseInt(pn[1]),d=parseNum(pn[1],pn[2],pn[3],yearFor(m));
      if(d){
        const next=lines[i+1];
        const nextOk=next&&!next.match(MONTH_HEADER_RE)&&!NUMERIC_DATE_RE.test(next)&&next.length>2&&next.length<100;
        if(pending){events.push(makeEvent(cleanTitle(pending),{start:d,end:new Date(d.getTime()+3600000),ambiguous:false},pending,90));pending=null;}
        else if(nextOk){events.push(makeEvent(cleanTitle(next.trim()),{start:d,end:new Date(d.getTime()+3600000),ambiguous:false},next,90));i++;}
        continue;
      }
    }

    // Short gap date+title: "9/7  School Holiday"
    const sn = stripped.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(.+)/);
    if (sn&&sn[4].trim().length>2) {
      const m=parseInt(sn[1]),d=parseNum(sn[1],sn[2],sn[3],yearFor(m));
      if(d){const title=cleanTitle(sn[4].trim());events.push(makeEvent(title,{start:d,end:new Date(d.getTime()+3600000),ambiguous:false},title,90));pending=null;continue;}
    }

    // Pure title line
    const hasDate = NUMERIC_DATE_RE.test(line)||FULL_DATE_RE.test(line);
    if(!hasDate&&line.length>3&&line.length<120){pending=line.trim();continue;}
  }
  return events;
}

// ────────────────────────────────────────────────────────────────
// STRATEGY C: Inline date parser
// "Thursday, April 16 (11-11:40 a.m.)" or
// "Session 1A: July 27-31 (9 a.m.-12:30 p.m.)"
// "Monday, April 13\tCompleted forms due" — skip (handled by A)
// ────────────────────────────────────────────────────────────────
function parseInlineDates(text, refYear) {
  const events = [];
  const lines  = text.split("\n").map(l=>l.replace(/^[●○■•\-\*\s\t]+/,"").trim()).filter(Boolean);
  const seen   = new Set();

  // Pattern: "Thursday, April 16 (11-11:40 a.m.)" — standalone date+time line
  const STANDALONE = /^(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+)?((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*202\d)?)\s*(?:\(([^)]+)\))?\s*[-–,]?\s*(.{0,80})?$/i;

  // Pattern: "Session 1A: July 27-31 (9 a.m.-12:30 p.m.)"
  const SESSION  = /^(Session\s+\w+)\s*:\s*((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?)\s*\(([^)]+)\)/i;

  // Pattern: "HEADING ON APRIL 20" or "HEADING DUE MONDAY, APRIL 13"
  const HEADING  = /^([A-Z][A-Z\s&\/,]+?)\s+(?:ON|DUE(?:\s+MONDAY)?(?:,)?)\s+(?:(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY),?\s+)?((?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{1,2})/i;

  // Pattern: "Title on Month DD at TIME" or "Title, Month DD"
  const INLINE_A = /^((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*202\d)?)\s*[-–:(),]+\s*(.+)/i;
  const INLINE_B = /^(.+?)\s+((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*202\d)?)[.,]?\s*$/i;

  for (const line of lines) {
    if (SKIP_RE.test(line)||line.length<8||line.includes("\t")) continue;

    let title=null, dateStr=null, timeStr=null;

    // Session pattern
    const sm = line.match(SESSION);
    if (sm) {
      title   = sm[1].trim();
      dateStr = sm[2].trim();
      timeStr = sm[3].trim();
    }

    // Heading with embedded date "PROGRAM ON APRIL 20"
    if (!title) {
      const hm = line.match(HEADING);
      if (hm) {
        title   = cleanTitle(hm[1].trim());
        dateStr = hm[2].trim();
      }
    }

    // Standalone date line "Thursday, April 16 (11-11:40 a.m.)"
    if (!title) {
      const sm2 = line.match(STANDALONE);
      if (sm2) {
        dateStr = sm2[1];
        timeStr = sm2[2] || "";
        // Only use if no trailing text, or trailing text looks like a location/note
        title   = sm2[3] ? sm2[3].trim() : null;
        // If we have no title, mark as needing context (skip for now, let block parser handle)
        if (!title || title.length < 2) { title=null; dateStr=null; }
      }
    }

    // Inline A: "April 20 - Title"
    if (!title) {
      const ma = line.match(INLINE_A);
      if (ma) { dateStr=ma[1]; title=ma[2].trim(); }
    }

    // Inline B: "Title April 20th"
    if (!title) {
      const mb = line.match(INLINE_B);
      if (mb) { title=mb[1].trim(); dateStr=mb[2]; }
    }

    if (!dateStr||!title||title.length<3) continue;
    title = cleanTitle(title);
    if (title.length<3||SKIP_RE.test(title)) continue;

    const baseDate = parseFullDate(dateStr + " " + refYear, refYear);
    if (!baseDate) continue;

    const fullText = timeStr ? dateStr+" "+timeStr : line;
    const ti = applyTime(fullText, baseDate);

    const key = `${title.toLowerCase().slice(0,20)}|${ti.start.toDateString()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    events.push(makeEvent(title, {start:ti.start,end:ti.end,hasTime:ti.hasTime,ambiguous:!ti.hasTime}, line.slice(0,200), 80));
  }
  return events;
}

// ────────────────────────────────────────────────────────────────
// STRATEGY D: Block/paragraph parser (ALL-CAPS headings)
// ────────────────────────────────────────────────────────────────
function classify(text) {
  const lower=text.toLowerCase(); let score=0;
  if(FULL_DATE_RE.test(text)) score+=0.35;
  if(/\b202[4-9]\b/.test(text)) score+=0.10;
  if(/\b\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)\b/i.test(text)) score+=0.15;
  if(/^[A-Z][a-z]+ \d{1,2}[\s]*[-–:]/.test(text)) score+=0.20;
  const f=text.split("\n")[0].trim();
  if(f===f.toUpperCase()&&f.length>4&&f.length<70&&/[A-Z]{2,}/.test(f)) score+=0.20;
  for(const w of VOCAB_HIGH){if(lower.includes(w)){score+=0.08;break;}}
  if(SKIP_RE.test(text)) score-=0.45;
  if((text.match(/^[·•●\-○]/gm)||[]).length>3) score-=0.20;
  return Math.max(0,Math.min(1,score));
}

function tryParseDate(text, refYear) {
  const p1=text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(202\d)\b/i);
  if(p1){const d=new Date(`${p1[1]} ${p1[2]}, ${p1[3]}`);if(!isNaN(d))return{...applyTime(text,d),ambiguous:false};}
  const p2=text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\b/i);
  if(p2){const s=new Date(`${p2[1]} ${p2[2]}, ${refYear}`),e=new Date(`${p2[1]} ${p2[3]}, ${refYear}`);if(!isNaN(s))return{start:s,end:e,ambiguous:true,hasTime:false};}
  const p3=text.match(/(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
  if(p3){const d=new Date(`${p3[1]} ${p3[2]}, ${refYear}`);if(!isNaN(d))return{...applyTime(text,d),ambiguous:false};}
  const p4=text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if(p4){const d=new Date(`${p4[1]} ${p4[2]}, ${refYear}`);if(!isNaN(d))return{...applyTime(text,d),ambiguous:!applyTime(text,d).hasTime};}
  const lower=text.toLowerCase();
  for(const[s,m]of Object.entries(SEASON_MAP)){if(lower.includes(s)){const d=new Date(refYear,m-1,1);return{start:d,end:new Date(d.getTime()+3600000),ambiguous:true,hasTime:false};}}
  for(const[n,m]of Object.entries(MONTH_NAMES)){if(n.length>3&&new RegExp(`\\b${n}\\b`,"i").test(text)){const d=new Date(refYear,m-1,1);return{start:d,end:new Date(d.getTime()+3600000),ambiguous:true,hasTime:false};}}
  return null;
}

function buildBlockTitle(text) {
  const lines=text.split("\n").map(l=>l.replace(/^[●○■•\-\*\s]+/,"").trim()).filter(Boolean);
  for(const line of lines){
    const c=line.replace(/\s*[-–—]\s*(student only event|parent only|continued.*|student only)/gi,"").trim();
    if(c===c.toUpperCase()&&c.length>4&&c.length<70&&/[A-Z]{2,}/.test(c)) return cleanTitle(toTitleCase(c));
  }
  const im=text.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*\d+)?(?:\s*,?\s*202\d)?(?:\s*\([^)]*\))?\s*[-–:(]+\s*(.+)/i);
  if(im){const t=cleanTitle(im[1]);if(t.length>3)return t;}
  const tm=text.match(/^(.+?)\s+(?:on\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i);
  if(tm){const t=cleanTitle(tm[1]);if(t.length>3)return t;}
  for(const line of lines){if(line.length>5&&line.length<80)return cleanTitle(line);}
  return cleanTitle(text.slice(0,60));
}

function parseBlocks(text, refYear) {
  const blocks=text.split(/\n{2,}/).map(b=>b.trim()).filter(b=>b.length>20&&b.length<1500);
  const events=[];
  for(const block of blocks){
    if(SKIP_RE.test(block)) continue;
    const score=classify(block);
    if(score<0.25) continue;
    const di=tryParseDate(block,refYear);
    if(!di) continue;
    const title=buildBlockTitle(block);
    if(!title||title.length<3) continue;
    const clean=block.replace(/\n+/g," ").trim();
    const desc=(clean.match(/^[^.!?]+[.!?]/)?.[0]||clean).slice(0,200);
    events.push({title,start:di.start.toISOString(),end:di.end.toISOString(),location:"",description:desc,ambiguous:di.ambiguous&&!di.hasTime,recurrence:null,confidence:Math.round(score*100)});
  }
  return events;
}

// ────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ────────────────────────────────────────────────────────────────
function extractEvents(text, options = {}) {
  const { maxEvents = 60 } = options;

  // Detect reference year from text (use earliest year found)
  const yearMatches = [...text.matchAll(/\b(202[4-9])\b/g)].map(m=>parseInt(m[1]));
  const refYear = yearMatches.length ? Math.min(...yearMatches) : new Date().getFullYear() + 1;

  const hasCalHeaders  = /^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s*(202\d)?$/im.test(text);
  const hasNumDates    = /\b\d{1,2}\/\d{1,2}\b/.test(text);
  const hasTabTable    = text.includes("\t");

  let events = [];

  // A: Tab-separated tables (highest precision)
  if (hasTabTable) events = [...events, ...parseTableFormat(text, refYear)];

  // B: Calendar format (MONTH headers + numeric dates)
  if (hasCalHeaders || hasNumDates) events = [...events, ...parseCalendarFormat(text, refYear)];

  // C: Inline dates
  events = [...events, ...parseInlineDates(text, refYear)];

  // D: Block/paragraph
  events = [...events, ...parseBlocks(text, refYear)];

  // Dedup + sort + re-id
  const unique = deduplicate(events);
  unique.sort((a,b) => new Date(a.start)-new Date(b.start) || b.confidence-a.confidence);
  return unique.slice(0, maxEvents).map((e,i) => ({...e, id:i+1}));
}

module.exports = { extractEvents };