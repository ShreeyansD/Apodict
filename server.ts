import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import { registerPhoneRoutes } from './phoneVerification.ts';
import { registerPushReminderRoutes } from './pushRemindersServer.ts';
import {
  requireStudentAiAuthAndRateLimit,
  authenticateStudent,
  checkAndRecordAiRequest,
  checkAndRecordExamPrepLimit,
  AI_RATE_LIMITS,
} from './aiProtection.ts';
import { generateFallbackExamPrep } from './examPrepFallback.ts';
import { createProxyMiddleware } from 'http-proxy-middleware';

// Re-export AI_RATE_LIMITS so it is configured in one central place
export { AI_RATE_LIMITS };

const WRITING_STYLE =
  'Write in a professional, concise, neutral tone. Use no slang, no exclamation marks, no emojis, and no motivational filler. Do not use the words "crunch" or "No-BS". Describe workload levels with the plain terms Light, Moderate, and Heavy.';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
   // Serve Firebase's sign-in helper pages from our own domain so Google shows it
app.use(
  createProxyMiddleware({
    pathFilter: '/__/auth',
    target: 'https://gen-lang-client-0396426716.firebaseapp.com',
    changeOrigin: true,
  })
);
const server = http.createServer(app);

// Standard body parser (does not apply to /api/exam-prep which has its own 5mb route parser)
app.use((req, res, next) => {
  if (req.path === '/api/exam-prep') {
    return next();
  }
  express.json({ limit: '10mb' })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path === '/api/exam-prep') {
    return next();
  }
  express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
});
registerPhoneRoutes(app);
registerPushReminderRoutes(app);

// Initialize shared Gemini AI client with telemetry user-agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});
// Log the real error, show the user a safe message (never expose billing details)
function sendAiError(res: Response, error: any, fallbackMsg: string) {
  const raw = String(error?.message || error || '');
  const lower = raw.toLowerCase();
  const unavailable =
    lower.includes('resource_exhausted') ||
    lower.includes('credits') ||
    lower.includes('quota') ||
    lower.includes('"code":402') ||
    lower.includes('"code":429');
  if (unavailable) {
    return res.status(503).json({
      error: 'The AI service is temporarily unavailable. Please try again later.',
    });
  }
  return res.status(502).json({ error: fallbackMsg });
}
// -------------------------------------------------------------
// POST /api/parse-syllabus: Parse syllabus with gemini-3.1-flash-lite
// Supports text, single or multiple PDF documents, or combined input
// -------------------------------------------------------------
app.post('/api/parse-syllabus', requireStudentAiAuthAndRateLimit, async (req: Request, res: Response) => {
  try {
    const { courseName, syllabusText, pdfFiles } = req.body;

    const hasText = typeof syllabusText === 'string' && syllabusText.trim().length > 0;
    const hasPdfs = Array.isArray(pdfFiles) && pdfFiles.length > 0;

    if (!hasText && !hasPdfs) {
      return res.status(400).json({ error: 'Please provide at least one PDF file or paste syllabus text.' });
    }

    const contentsParts: any[] = [];

    // Validate and attach PDF files
    if (hasPdfs) {
      for (const pdf of pdfFiles) {
        if (!pdf || !pdf.base64 || typeof pdf.base64 !== 'string') {
          return res.status(400).json({
            error: `Invalid file data for "${pdf?.name || 'document'}". Please re-select the file.`,
          });
        }

        // Check for password protection / encryption in PDF
        try {
          const sampleLength = Math.min(pdf.base64.length, 12000);
          const decodedSample = Buffer.from(pdf.base64.substring(0, sampleLength), 'base64').toString('latin1');

          // Basic PDF header verification
          if (!decodedSample.includes('%PDF-')) {
            return res.status(400).json({
              error: `The file "${pdf.name}" does not appear to be a valid PDF document.`,
            });
          }

          // Password protection signature check
          if (decodedSample.includes('/Encrypt')) {
            return res.status(400).json({
              error: `The file "${pdf.name}" is password-protected or encrypted. Please provide an unlocked PDF or paste the syllabus text.`,
            });
          }
        } catch (e) {
          // Continue if buffer sample check errors out
        }

        // Attach PDF as inlineData
        contentsParts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: pdf.base64,
          },
        });
      }
    }

    // Build prompt instructing cross-referencing, deduplication, conflict detection
    let prompt = `You are an expert college academic syllabus analyzer.
Analyze all provided material for a SINGLE course. You may receive one or more PDF files (e.g. one explaining grade weights, another listing calendar deadlines, lecture schedules, etc.) and/or pasted syllabus text.
Course name hint from student: "${courseName || 'Not specified'}"

CRITICAL INSTRUCTIONS:
1. Cross-reference all provided files and text into ONE unified course.
2. Extract the official courseName (use the hint if good, or extract official title like "CS 106B: Programming Abstractions").
3. Extract courseCode (e.g. "CS 106B", "ECON 50", "BIO 81") if present, else null.
4. Extract instructor name if present, else null.
5. Extract term (e.g. "Fall 2026", "Spring 2026") if present, else null.
6. Extract all graded categories with their weight as percentage numbers from 0 to 100 (e.g. name: "Midterm Exams", weight: 30, meaning 30%).
   - ALWAYS output weights as percentage numbers from 0 to 100 (e.g. 1 means 1%, 25 means 25%, 30 means 30%). A category weight of 1 means 1%, not 100%. NEVER use decimals or fractions like 0.30 or 0.01.
   - If a weight is not explicitly stated or is ambiguous, use null. DO NOT guess.
7. Extract all specific assignment, paper, project, homework, quiz, and exam deadlines mentioned.
   - title: concise descriptive title
   - date: format as "YYYY-MM-DD". The current year is 2026. If only month/day are given (e.g. "October 14" or "Nov 3"), use 2026. If date is not stated, return null. DO NOT invent dates.
   - type: must be one of: "exam", "paper", "homework", "project", "quiz", "other".
   - weight: percentage of final grade as a number from 0 to 100 if specifically stated for this individual deadline (e.g., 15 for 15%, 1 for 1%), or null if not stated. Never return fractional decimals like 0.15.
8. REMOVE DUPLICATE DEADLINES: If the same assignment, exam, paper, or quiz appears in more than one file or in both the text and a PDF, MERGE them into a single deadline. Do not output duplicate items.
9. CONFLICT DETECTION: If the files or text contradict each other (for example, one document lists an exam on Oct 22 while another lists it on Oct 24, or homework weight is listed as 20% in one place and 25% in another):
   - DO NOT pick one silently.
   - List every specific contradiction in the 'conflicts' array with a clear explanation of what contradicted what.
   - In the extracted fields, provide the best representative value while ensuring the discrepancy is clearly flagged in 'conflicts'.
   - If there are no contradictions, return an empty array for 'conflicts'.
10. If something is missing or unclear, use null rather than guessing.`;

    if (hasText) {
      prompt += `\n\nPasted Syllabus Text:\n---\n${syllabusText.substring(0, 50000)}\n---`;
    }

    contentsParts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: contentsParts,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            courseName: { type: Type.STRING },
            courseCode: { type: Type.STRING },
            instructor: { type: Type.STRING },
            term: { type: Type.STRING },
            conflicts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            categories: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  weight: { type: Type.NUMBER, description: 'Percentage number from 0 to 100 (e.g. 25 for 25%, 1 for 1%)' },
                  description: { type: Type.STRING },
                },
                required: ['name'],
              },
            },
            deadlines: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  date: { type: Type.STRING },
                  type: { type: Type.STRING },
                  weight: { type: Type.NUMBER },
                },
                required: ['title', 'type'],
              },
            },
          },
          required: ['courseName', 'categories', 'deadlines'],
        },
      },
    });

    const textOutput = response.text?.trim() || '{}';
    const parsedData = JSON.parse(textOutput);

    // Deduplicate deadlines programmatically as a safeguard
    const rawDeadlines = Array.isArray(parsedData.deadlines) ? parsedData.deadlines : [];
    const uniqueDeadlines: any[] = [];
    const seenDeadlineKeys = new Set<string>();

    for (const dl of rawDeadlines) {
      const normTitle = (dl.title || '').trim().toLowerCase();
      const normDate = (dl.date || '').trim();
      const key = `${normTitle}|${normDate}`;
      if (!seenDeadlineKeys.has(key)) {
        seenDeadlineKeys.add(key);
        uniqueDeadlines.push({
          ...dl,
          type: ['exam', 'paper', 'homework', 'project', 'quiz', 'other'].includes(dl.type?.toLowerCase())
            ? dl.type.toLowerCase()
            : 'homework',
          date: dl.date && typeof dl.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dl.date) ? dl.date : null,
        });
      }
    }

    // Normalize types and ensure array presence
    const normalized = {
      courseName: parsedData.courseName || courseName || 'Untitled Course',
      courseCode: parsedData.courseCode || null,
      instructor: parsedData.instructor || null,
      term: parsedData.term || 'Fall 2026',
      conflicts: Array.isArray(parsedData.conflicts) ? parsedData.conflicts : [],
      categories: Array.isArray(parsedData.categories) ? parsedData.categories : [],
      deadlines: uniqueDeadlines,
    };

    return res.json(normalized);
  } catch (error: any) {
    console.error('Error in /api/parse-syllabus:', error);

    const msg = error.message || '';
    if (msg.includes('password') || msg.includes('encrypted') || msg.includes('corrupted') || msg.includes('unsupported format')) {
      return res.status(400).json({
        error: 'One or more uploaded PDFs appears to be corrupted, unreadable, or password-protected. Please upload an unlocked PDF or paste the syllabus text.',
      });
    }

    return sendAiError(res, error, 'Failed to parse syllabus material. Please check your files or try again.');
  }
});
// -------------------------------------------------------------
// In-memory cache for synthesized course audio briefs
// -------------------------------------------------------------
const audioBriefCache = new Map<string, { audio: string; mimeType: string; transcript: string; timestamp: number }>();

// -------------------------------------------------------------
// POST /api/course-audio: TTS briefing using gemini-3.8-flash-lite-tts
// -------------------------------------------------------------
app.post('/api/course-audio', requireStudentAiAuthAndRateLimit, async (req: Request, res: Response) => {
  let script = '';
  try {
    const { course, voice = 'Kore' } = req.body;

    if (!course || !course.name) {
      return res.status(400).json({ error: 'Valid course object is required.' });
    }

    // Check memory cache first to avoid redundant API calls and quota depletion
    const cacheKey = `${course.id || course.name}-${course.updatedAt || ''}-${voice}`;
    const cached = audioBriefCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60 * 4) { // 4 hour cache
      return res.json({
        audio: cached.audio,
        mimeType: cached.mimeType,
        transcript: cached.transcript,
        fromCache: true,
      });
    }

    // Build a natural, concise spoken script for the student
    const categoriesSummary = Array.isArray(course.categories) && course.categories.length > 0
      ? course.categories.map((c: any) => `${c.name} at ${c.weight !== null ? `${c.weight}%` : 'unstated weight'}`).join(', ')
      : 'standard grading breakdown';

    const sortedDeadlines = Array.isArray(course.deadlines)
      ? [...course.deadlines].filter((d: any) => d.date).sort((a: any, b: any) => (a.date > b.date ? 1 : -1))
      : [];

    const upcomingHighlight = sortedDeadlines.length > 0
      ? `Your earliest milestone is ${sortedDeadlines[0].title}, scheduled for ${sortedDeadlines[0].date}.`
      : 'Check your syllabus for upcoming deadlines.';

    script = `Here is your academic briefing for ${course.name}${course.instructor ? ` taught by ${course.instructor}` : ''}.
Your syllabus grade distribution includes: ${categoriesSummary}.
${upcomingHighlight}
Remember to review key topics early, balance your study intervals, and stay on top of your deliverables. You've got this semester!`;

    // Use gemini-3.8-flash-lite-tts for high-throughput, reliable standard TTS
    let base64Audio: string | null = null;
    try {
      const audioResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: script,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
            },
          },
        },
      });

      base64Audio = audioResponse?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (ttsErr: any) {
      console.warn('Gemini TTS generation notice:', ttsErr?.message || ttsErr);
      // If quota or rate limited, gracefully provide transcript with client speech synthesis fallback
    }

    if (base64Audio) {
      // Save to cache
      audioBriefCache.set(cacheKey, {
        audio: base64Audio,
        mimeType: 'audio/wav',
        transcript: script,
        timestamp: Date.now(),
      });

      return res.json({
        audio: base64Audio,
        mimeType: 'audio/wav',
        transcript: script,
        fallbackToSpeechSynthesis: false,
      });
    }

    // Graceful fallback when model is quota-limited or unavailable: return transcript for browser speech synthesis
    return res.json({
      audio: null,
      mimeType: 'audio/wav',
      transcript: script,
      fallbackToSpeechSynthesis: true,
      message: 'Audio briefing generated. Playing using speech synthesis voice.',
    });
  } catch (error: any) {
    console.error('Error preparing course audio briefing:', error?.message || error);
    return res.status(500).json({
      error: error?.message || 'Failed to generate course audio briefing.',
      transcript: script,
    });
  }
});

// -------------------------------------------------------------
// POST /api/academic-search: Grounded search with gemini-3.1-flash-lite
// -------------------------------------------------------------
app.post('/api/academic-search', requireStudentAiAuthAndRateLimit, async (req: Request, res: Response) => {
  try {
    const { courseName, query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required.' });
    }

    const searchQuery = courseName ? `${courseName}: ${query}` : query;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `You are an academic research assistant for university students.
${WRITING_STYLE}
Student query regarding course "${courseName || 'College Course'}":
"${searchQuery}"

Provide a concise, highly practical summary tailored for a college student:
- Key textbooks, free open-access PDFs, or official syllabus resources if applicable
- Core conceptual references or reputable study guides
- Important tips for mastering this coursework
Cite reputable university or academic sources retrieved. Keep the answer structured with clear bullet points.`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const answer = response.text || 'No information found.';

    // Extract grounding chunks / source URLs
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources: Array<{ title: string; uri: string }> = [];

    for (const chunk of chunks) {
      if (chunk.web?.uri) {
        sources.push({
          title: chunk.web.title || chunk.web.uri,
          uri: chunk.web.uri,
        });
      }
    }

    return res.json({
      query,
      answer,
      sources,
    });
  } catch (error: any) {
    console.error('Error in /api/academic-search:', error);
    return res.status(500).json({
      error: error.message || 'Academic search failed.',
    });
  }
});

// -------------------------------------------------------------
// POST /api/analyze-semester: Collision analysis with gemini-3.1-flash-lite
// -------------------------------------------------------------
app.post('/api/analyze-semester', requireStudentAiAuthAndRateLimit, async (req: Request, res: Response) => {
  try {
    const { courses } = req.body;

    if (!Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({ error: 'No courses provided to analyze.' });
    }

    // Collect all deadlines with associated course info
    const deliverablesSummary: string[] = [];
    courses.forEach((c: any) => {
      if (Array.isArray(c.deadlines)) {
        c.deadlines.forEach((d: any) => {
          deliverablesSummary.push(
            `- Course: "${c.name}" (${c.code || 'No Code'}) | Item: "${d.title}" | Date: ${d.date || 'TBD'} | Type: ${d.type} | Weight: ${d.weight !== null ? `${d.weight}%` : 'Unstated'}`
          );
        });
      }
    });

    if (deliverablesSummary.length === 0) {
      return res.status(400).json({ error: 'No deadlines found across your courses.' });
    }

    const prompt = `You are an expert college academic workload strategist.
${WRITING_STYLE}
Analyze the following student courses and deadlines for the semester.

CRITICAL INSTRUCTIONS:
1. Do NOT invent deadlines or courses that are not in the provided data. Base all analysis strictly on these deliverables.
2. Identify the 2 or 3 crunch periods where multiple exams, papers, or high-weight deliverables collide or bunch together within a few days of each other.
3. For each crunch period:
   - title: concise descriptive title (e.g. "Mid-October exam cluster", "November pre-finals period", "December finals period")
   - dateRange: the dates or week window of the crunch (e.g. "Oct 16 - Oct 24, 2026")
   - severity: "critical", "high", or "moderate"
   - description: a clear, concise 1-2 sentence explanation of why this window has high collision risk
   - startEarly: list of 1 to 3 specific assignments/exams from the provided list that the student should begin preparing for ahead of time, with a practical tip
4. overallStrategy: a concise, plain-English 2-3 sentence strategic roadmap to navigate this semester smoothly without burnout.

Course Deliverables List:
${deliverablesSummary.join('\n')}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            crunchPeriods: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  dateRange: { type: Type.STRING },
                  severity: { type: Type.STRING },
                  description: { type: Type.STRING },
                  startEarly: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        assignment: { type: Type.STRING },
                        course: { type: Type.STRING },
                        recommendation: { type: Type.STRING },
                      },
                      required: ['assignment', 'course', 'recommendation'],
                    },
                  },
                },
                required: ['title', 'dateRange', 'severity', 'description', 'startEarly'],
              },
            },
            overallStrategy: { type: Type.STRING },
          },
          required: ['crunchPeriods', 'overallStrategy'],
        },
      },
    });

    const textOutput = response.text?.trim() || '{}';
    const parsedData = JSON.parse(textOutput);

    return res.json(parsedData);
  } catch (error: any) {
    console.error('Error in /api/analyze-semester:', error);
    return res.status(500).json({
      error: error.message || 'Semester collision analysis failed.',
    });
  }
});

// -------------------------------------------------------------
// POST /api/generate-plan: Break assignment into 4-8 milestones with gemini-3.1-flash-lite
// -------------------------------------------------------------
app.post('/api/generate-plan', requireStudentAiAuthAndRateLimit, async (req: Request, res: Response) => {
  try {
    const {
      assignmentTitle,
      promptText,
      dueDate,
      hoursPerDay = 1,
      currentDate = '2026-10-02',
    } = req.body;

    if (!assignmentTitle || !dueDate) {
      return res.status(400).json({ error: 'Assignment title and due date are required.' });
    }

    const systemPrompt = `You are an expert college academic productivity coach and study planner.
${WRITING_STYLE}
Break down the provided assignment into a realistic, structured backward roadmap of 4 to 8 concrete milestones.

Assignment Details:
- Title: "${assignmentTitle}"
- Instructions/Prompt: "${promptText || 'Standard college coursework assignment'}"
- Due Date: ${dueDate}
- Current Date (Today): ${currentDate}
- Realistic Daily Work Hours: ${hoursPerDay} hour(s) per day

CRITICAL INSTRUCTIONS:
1. MUST BREAK DOWN INTO 4 TO 8 MILESTONES:
   - Work BACKWARDS from the due date.
   - Include a BUFFER DAY before the deadline (the final milestone target date should be at least 1 day before ${dueDate} so the student never submits in panic at the last minute).
   - Milestone target dates must be in "YYYY-MM-DD" format and scheduled sequentially between ${currentDate} and the buffer day before ${dueDate}.
2. ALWAYS INCLUDE A "START HERE" TASK:
   - The very first milestone MUST take 15 minutes or less (0.25 hours or 0.2 hours).
   - It must be ultra-concrete and low-friction to defeat procrastination (e.g., "Start here: Open a doc, copy the prompt rubric, and jot down 3 thesis angles").
   - Mark this first task with isStartHere: true.
3. REALISTIC ESTIMATED HOURS:
   - Each milestone must have estimatedHours (a realistic number, e.g. 0.25, 1.0, 2.5).
4. TIME ADEQUACY & EXTENSION CHECK:
   - Calculate whether total estimated hours can realistically fit in the available calendar days at ${hoursPerDay} hr(s)/day.
   - If the available time is clearly too short or dangerously compressed, set timeWarning.isTooShort = true, provide a direct warningMessage, and give a concrete suggestion (e.g., what scope/sections to cut, or exact talking points to request a 48-hour extension from the professor).
   - If time is adequate, set timeWarning = null.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: systemPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            milestones: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  estimatedHours: { type: Type.NUMBER },
                  targetDate: { type: Type.STRING },
                  isStartHere: { type: Type.BOOLEAN },
                },
                required: ['title', 'estimatedHours', 'targetDate'],
              },
            },
            timeWarning: {
              type: Type.OBJECT,
              properties: {
                isTooShort: { type: Type.BOOLEAN },
                warningMessage: { type: Type.STRING },
                suggestion: { type: Type.STRING },
              },
              required: ['isTooShort', 'warningMessage', 'suggestion'],
            },
          },
          required: ['milestones'],
        },
      },
    });

    const textOutput = response.text?.trim() || '{}';
    const parsedData = JSON.parse(textOutput);

    // Format milestones with unique IDs and completion flags
    const formattedMilestones = Array.isArray(parsedData.milestones)
      ? parsedData.milestones.map((m: any, idx: number) => ({
          id: `ms-${Date.now()}-${idx}`,
          title: m.title || `Milestone ${idx + 1}`,
          estimatedHours: typeof m.estimatedHours === 'number' ? m.estimatedHours : 1.0,
          targetDate: m.targetDate && /^\d{4}-\d{2}-\d{2}$/.test(m.targetDate) ? m.targetDate : dueDate,
          isStartHere: idx === 0 || !!m.isStartHere,
          completed: false,
        }))
      : [];

    return res.json({
      milestones: formattedMilestones,
      timeWarning: parsedData.timeWarning?.isTooShort ? parsedData.timeWarning : null,
    });
  } catch (error: any) {
        console.error('Error in /api/generate-plan:', error);
    return sendAiError(res, error, 'Failed to generate study plan. Please try again.');
  }
});
// -------------------------------------------------------------
// POST /api/grade-focus: Grade effort focus analysis using gemini-3.1-flash-lite
// -------------------------------------------------------------
app.post('/api/grade-focus', requireStudentAiAuthAndRateLimit, async (req: Request, res: Response) => {
  try {
    const {
      courseName,
      targetGrade,
      currentWeightedGrade,
      pointsEarnedSoFar,
      maxPossibleGrade,
      gradedWeight,
      remainingWeight,
      status, // 'secured' | 'out_of_reach' | 'achievable' | 'no_grades'
      neededScoreOnRemaining,
      categories,
    } = req.body;

    if (!courseName || !Array.isArray(categories)) {
      return res.status(400).json({ error: 'Course name and categories are required.' });
    }

    const ungradedListItems: string[] = [];
    const gradedListItems: string[] = [];

    categories.forEach((c: any) => {
      if (Array.isArray(c.items) && c.items.length > 0) {
        const gr = c.items.filter((it: any) => it.status === 'graded' && it.currentScore !== null);
        const ungr = c.items.filter((it: any) => it.status === 'ungraded' || it.currentScore === null);
        if (gr.length > 0) {
          gradedListItems.push(`"${c.name}" completed items: ${gr.map((it: any) => `"${it.name}" (${it.currentScore}%, ${it.weight}%)`).join(', ')}`);
        }
        if (ungr.length > 0) {
          ungradedListItems.push(`"${c.name}" remaining items: ${ungr.map((it: any) => `"${it.name}" (${it.weight}%)`).join(', ')}`);
        }
      } else {
        if (c.status === 'graded' && c.currentScore !== null) {
          gradedListItems.push(`"${c.name}": ${c.currentScore}% (${c.weight}%)`);
        } else {
          ungradedListItems.push(`"${c.name}" (${c.weight}%)`);
        }
      }
    });

    const ungradedNamesList =
      ungradedListItems.length > 0 ? ungradedListItems.join('; ') : 'None (all work completed)';
    const gradedNamesList =
      gradedListItems.length > 0 ? gradedListItems.join('; ') : 'None yet';

    const computedMax =
      maxPossibleGrade !== undefined
        ? maxPossibleGrade
        : Math.round((pointsEarnedSoFar + remainingWeight) * 10) / 10;

    const prompt = `You are a pragmatic, direct, and rigorous college academic advisor.
${WRITING_STYLE}
Analyze the student's grade standing and provide a prioritized effort allocation strategy.

EXACT COMPUTED NUMBERS:
- Course: "${courseName}"
- Current Weighted Standing on Graded Work: ${currentWeightedGrade !== null ? `${currentWeightedGrade}%` : 'No work graded yet'}
- Graded Weight Total: ${gradedWeight}%
- Remaining Weight Total: ${remainingWeight}%
- Target Final Grade: ${targetGrade}%
- Required Average on Remaining Work: ${neededScoreOnRemaining !== null ? `${neededScoreOnRemaining}%` : (status === 'secured' ? '0%' : 'N/A')}
- Points Earned So Far Toward 100: ${pointsEarnedSoFar} / 100
- Maximum Possible Grade: ${computedMax}%
- Mathematical Status: ${status}

GRADED DELIVERABLES & ITEMS COMPLETED:
${gradedNamesList}

UNGRADED DELIVERABLES & REMAINING ITEMS TO BE PRIORITIZED:
${ungradedNamesList}

CATEGORY & ITEM BREAKDOWN:
${categories
  .map((c: any) => {
    const itemsStr =
      Array.isArray(c.items) && c.items.length > 0
        ? c.items
            .map(
              (it: any) =>
                `    * Item "${it.name}": Weight ${it.weight}%, Score: ${it.currentScore !== null ? `${it.currentScore}%` : 'Ungraded'}, Status: ${it.status}`
            )
            .join('\n')
        : '    * (No individual items; whole category score)';
    return `- Category "${c.name}": Weight ${c.weight}%, Computed Average: ${c.currentScore !== null ? `${c.currentScore}%` : 'Ungraded'}, Graded Weight: ${c.gradedWeight ?? (c.currentScore !== null ? c.weight : 0)}%, Remaining Weight: ${c.remainingWeight ?? (c.currentScore !== null ? 0 : c.weight)}%\n${itemsStr}`;
  })
  .join('\n')}

MANDATORY RULES:
1. OVERVIEW BEGINNING REQUIREMENT:
   The "summary" field MUST begin with the student's current standing and how much of the course is graded, followed by the required average on remaining work, using the exact numbers provided.
   - If graded work exists and target is achievable:
     "Your current standing is ${currentWeightedGrade}% across the ${gradedWeight}% of the course that has been graded so far. To reach your target of ${targetGrade}%, you need an average of ${neededScoreOnRemaining}% across the remaining ${remainingWeight}% of coursework."
   - If no work is graded yet:
     "0% of the course is graded so far. To reach your target of ${targetGrade}%, you need an average of ${neededScoreOnRemaining}% across all ${remainingWeight}% of coursework."
   - If target is already secured:
     "Your current standing is ${currentWeightedGrade}% across the ${gradedWeight}% of the course graded so far. You have already secured your target of ${targetGrade}% with 0% needed on remaining work."
   - If target is out of reach:
     "Your current standing is ${currentWeightedGrade}% across the ${gradedWeight}% of the course graded so far. Reaching your target of ${targetGrade}% is mathematically out of reach (maximum possible grade is ${computedMax}%)."
   Do NOT start with greetings, generic pleasantries, or preamble.

2. RANKED LIST CONTAINS ONLY UNGRADED CATEGORIES:
   - The "prioritizedActions" list MUST ONLY INCLUDE CATEGORIES THAT ARE STILL UNGRADED (${ungradedNamesList}).
   - Do NOT include any already-graded categories in "prioritizedActions" (they are already completed and will be shown separately).
   - If all categories are already graded, return an empty array [] for "prioritizedActions".
   - Name ONLY categories that explicitly appear in the data. Never invent or rename categories.
   - When discussing what remains to be completed, you MUST list EVERY SINGLE ungraded category (${ungradedNamesList}).
   - You MUST NEVER say or imply that one or two categories "determine" or "decide" the grade if other ungraded categories also exist. All ungraded categories contribute.

3. WEIGHT LABELS AS WHOLE PERCENTAGES:
   - The "weight" field for each action in "prioritizedActions" MUST be a whole percentage integer (e.g., 25 for 25%, not 0.25; 30 for 30%, not 0.3; 20 for 20%, not 0.2).

4. ACCURACY OF ADVICE & TARGET SCORES (CRITICAL):
   - When recommending a target score or effort benchmark for an ungraded category, you MUST NEVER suggest that matching a past score is enough if the required average on remaining work (${neededScoreOnRemaining}%) is higher than that past score.
   - If the required average on remaining work (${neededScoreOnRemaining}%) is higher than a past score (e.g. if the student scored 81% on a previous exam and now needs ${neededScoreOnRemaining}% on remaining work), you MUST explicitly say that the student needs to EXCEED that past score to reach the required average of ${neededScoreOnRemaining}%.
   - Never say matching a past score is sufficient when the required remaining average is higher than that past score.
   - ALL quoted numbers (averages, past scores, weights, targets) must come EXACTLY from the data provided. Never alter or re-round them.

5. STRICT REALISTIC JUDGMENTS (NO VAGUE/FALSE ENCOURAGEMENT):
   - Do NOT use vague judgments like "strong position" UNLESS the required average on remaining work (${neededScoreOnRemaining}%) is at or below the student's current average (${currentWeightedGrade}%).
   - If the required average on remaining work (${neededScoreOnRemaining}%) is higher than the student's current average (${currentWeightedGrade}%): you must NOT call it a strong position; describe the target as "demanding" because it requires scoring higher on remaining work than current performance.
   - If status is "out_of_reach", describe it strictly as "out of reach".

6. HONEST STRATEGIC ADVICE:
   - honestAdvice: 2-3 sentences of direct, realistic strategic guidance on how to allocate time across the remaining ungraded work.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            courseName: { type: Type.STRING },
            summary: { type: Type.STRING },
            prioritizedActions: {
              type: Type.ARRAY,
              description: 'Ranked list of ONLY ungraded categories',
              items: {
                type: Type.OBJECT,
                properties: {
                  categoryName: { type: Type.STRING },
                  weight: { type: Type.INTEGER, description: 'Whole percentage, e.g. 25' },
                  currentScore: { type: Type.NUMBER, nullable: true },
                  priority: { type: Type.STRING },
                  actionableAdvice: { type: Type.STRING },
                },
                required: ['categoryName', 'weight', 'priority', 'actionableAdvice'],
              },
            },
            honestAdvice: { type: Type.STRING },
          },
          required: ['courseName', 'summary', 'prioritizedActions', 'honestAdvice'],
        },
      },
    });

    const textOutput = response.text?.trim() || '{}';
    const parsedData = JSON.parse(textOutput);

    return res.json(parsedData);
  } catch (error: any) {
        console.error('Error in /api/grade-focus:', error);
    return sendAiError(res, error, 'Grade analysis failed. Please try again.');
  }
});
// -------------------------------------------------------------
// POST /api/exam-prep: Generate Practice Questions or Study Guide
// Route-specific body-size limit raised to 5mb with readable JSON error handling
// -------------------------------------------------------------
function cleanSource(text: string): string {
  return text
    .replace(/^\s*---\s*\[[^\]]*\]\s*---\s*$/gm, '')
    .replace(/\[Page \d+\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const examPrepJsonParser = express.json({ limit: '1mb' });

app.post(
  '/api/exam-prep',
  (req: Request, res: Response, next: NextFunction) => {
    examPrepJsonParser(req, res, (err: any) => {
      if (err) {
        if (err.type === 'entity.too.large' || err.status === 413) {
          return res.status(413).json({
            error: 'The request payload is too large. Combined text must be under 1 MB (max 150,000 characters).',
            code: 'payload_too_large',
          });
        }
        return res.status(400).json({ error: 'Invalid JSON request payload.' });
      }
      next();
    });
  },
  requireStudentAiAuthAndRateLimit,
  async (req: Request, res: Response) => {
    try {
      const studentId = (req as any).studentId;
      if (studentId) {
        const limitCheck = checkAndRecordExamPrepLimit(studentId);
        if (!limitCheck.allowed) {
          if (limitCheck.retryAfterSeconds) {
            res.setHeader('Retry-After', String(limitCheck.retryAfterSeconds));
          }
          return res.status(429).json({
            error: limitCheck.message,
            code: 'rate_limited',
            retryAfterSeconds: limitCheck.retryAfterSeconds,
          });
        }
      }

      const {
        courseName,
        examTitle,
        examDate,
        mode = 'questions',
        notes = '',
        extractedText = '',
        questionCount = 10,
        questionMix = 'mixed',
      } = req.body;

      const hasNotes = typeof notes === 'string' && notes.trim().length > 0;
      const hasExtractedText = typeof extractedText === 'string' && extractedText.trim().length > 0;

      if (!hasNotes && !hasExtractedText) {
        return res.status(400).json({
          error: 'Please paste your lecture notes or select a PDF document with readable text to generate prep.',
        });
      }

      const combinedTextLength = (hasNotes ? notes.length : 0) + (hasExtractedText ? extractedText.length : 0);
      if (combinedTextLength > 150000) {
        return res.status(400).json({
          error: `Combined text (pasted notes and extracted PDF text) exceeds the maximum allowed length of 150,000 characters (current length: ${combinedTextLength.toLocaleString()}). Please trim slightly or reduce page ranges.`,
        });
      }

      const sanitizedCount = Math.min(15, Math.max(5, Number(questionCount) || 10));
      const targetMode = mode === 'guide' ? 'guide' : 'questions';

      const mixText =
        questionMix === 'multiple_choice'
          ? '100% Multiple Choice'
          : questionMix === 'short_answer'
          ? '100% Short Answer'
          : 'Balanced mix of Multiple Choice and conceptual Short Answer';

      const materialsBlock = [
        hasExtractedText ? `STUDY MATERIALS:\n---\n${cleanSource(extractedText)}\n---` : '',
        hasNotes ? `PASTED STUDENT STUDY NOTES:\n---\n${notes.trim()}\n---` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const taskBlock =
        targetMode === 'questions'
          ? `PRACTICE QUESTIONS INSTRUCTIONS:
- Generate exactly ${sanitizedCount} high-yield exam practice questions.
- Question style mix: ${mixText}.
- For each question:
  - id: unique string like "q1", "q2", etc.
  - type: "multiple_choice" or "short_answer"
  - question: clear, rigorous exam-style prompt testing understanding or application of the materials
  - options: if multiple_choice, exactly 4 distinct options formatted as ["A) ...", "B) ...", "C) ...", "D) ..."]. If short_answer, empty array [].
  - correctAnswer: if multiple_choice, the letter and text (e.g. "B) ..."). If short_answer, a concise, 1-2 sentence model answer key directly supported by the materials.
  - explanation: clear explanation of why this answer is correct, referencing the relevant concept.`
          : `STUDY GUIDE INSTRUCTIONS:
- Generate a structured study guide synthesizing the student materials:
  - overview: 2-3 sentence executive summary of the core themes in these materials.
  - likelyTopics: 3 to 6 high-probability exam topics deduced from the emphasis in the materials.
  - keyTerms: 4 to 12 crucial technical terms or definitions extracted directly from the materials.
  - sections: 3 to 6 logical thematic sections. Each section must have a clear heading, a 2-3 sentence summary, and 3-5 bullet points highlighting critical testable facts or rules.`;

      const prompt = `You are an expert college academic tutor and exam preparation specialist.
${WRITING_STYLE}

EXAM CONTEXT:
- Course: ${courseName || 'College Course'}
- Exam Title: ${examTitle || 'Upcoming Exam'}
- Exam Date: ${examDate || 'Upcoming'}
- Target Mode: ${targetMode === 'guide' ? 'Study Guide' : 'Practice Questions'}

${materialsBlock}

CRITICAL INSTRUCTIONS:
1. STRICT MATERIAL FIDELITY: Base all generated content SOLELY on the concepts, definitions, examples, and topics present in the student's materials above.
2. NO INVENTED FACTS: Do not invent formulas, dates, theories, or historical facts that are not explicitly stated in or directly deducible from the provided materials.
3. THIN CONTENT DETECTION: If the provided materials are too sparse, fragmented, vague, or lack sufficient academic substance to create a meaningful study guide or questions (e.g. only 2-3 words, placeholder text, or disconnected fragments), you MUST set "notesTooThin": true, provide clear and encouraging feedback in "notesFeedback" indicating what additional topics or chapters need to be uploaded or pasted, and return empty questions / study guide.
4. If the materials have sufficient content, set "notesTooThin": false.
5. The source text may contain spacing errors (split words, stray spaces, broken line breaks). Silently repair them. Never copy raw source text, fragments, or spacing errors into questions, answer choices, or explanations.
6. Never mention file names, page markers, "Uploaded Document", or "PDF". Refer only to the course topic.
7. Every multiple-choice option must be a short, clean phrase you write yourself (under 20 words). Exactly one option is correct and the other three are plausible but wrong. Write every question in your own words.
8. Study guide key terms, definitions, summaries and bullet points must be clean, readable sentences in your own words.

${taskBlock}
`;

      let parsedData: any = null;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: [{ text: prompt }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                notesTooThin: { type: Type.BOOLEAN },
                notesFeedback: { type: Type.STRING },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      type: { type: Type.STRING },
                      question: { type: Type.STRING },
                      options: { type: Type.ARRAY, items: { type: Type.STRING } },
                      correctAnswer: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                    },
                    required: ['id', 'type', 'question', 'correctAnswer', 'explanation'],
                  },
                },
                studyGuide: {
                  type: Type.OBJECT,
                  properties: {
                    overview: { type: Type.STRING },
                    likelyTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                    keyTerms: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          term: { type: Type.STRING },
                          definition: { type: Type.STRING },
                        },
                        required: ['term', 'definition'],
                      },
                    },
                    sections: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          heading: { type: Type.STRING },
                          summary: { type: Type.STRING },
                          bulletPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                        },
                        required: ['heading', 'summary'],
                      },
                    },
                  },
                },
              },
              required: ['notesTooThin'],
            },
          },
        });

        parsedData = JSON.parse(response.text?.trim() || '{}');
      } catch (aiErr: any) {
        console.error('Gemini generateContent for /api/exam-prep failed:', aiErr?.message || aiErr);
        return res.status(502).json({
          error: 'The AI service could not generate your prep right now. Please try again in a minute.',
        });
      }

      if (
        !parsedData ||
        (parsedData.notesTooThin !== true && !parsedData.questions?.length && !parsedData.studyGuide)
      ) {
        console.warn('Gemini returned an empty exam prep structure.');
        return res.status(502).json({
          error: 'The AI returned an empty result. Please try again.',
        });
      }

      return res.json({
        mode: targetMode,
        notesTooThin: !!parsedData.notesTooThin,
        notesFeedback: parsedData.notesFeedback || null,
        questions: Array.isArray(parsedData.questions) ? parsedData.questions : [],
        studyGuide: parsedData.studyGuide || null,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('Error in /api/exam-prep:', error);
      return res.status(500).json({
        error: error?.message || 'Exam prep generation failed.',
      });
    }
  }
);
// -------------------------------------------------------------
// WebSocket Server for Live API: gemini-3.8-live
// -------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/api/live' });

const LIVE_BASE_INSTRUCTION =
  'You are the Apodict Voice Advisor, a practical college academic coach. ' +
  'Help students optimize their study schedules, break down complex syllabi, prepare for midterms and finals, ' +
  'balance their course loads, and reduce academic anxiety. Keep answers concise, natural, and conversational. ' +
  WRITING_STYLE;

function liveInstruction(context: string): string {
  if (!context) {
    return LIVE_BASE_INSTRUCTION + "\n\nYou do not have access to the student's course data in this session. Say so if asked about their classes.";
  }
  return (
    LIVE_BASE_INSTRUCTION +
    "\n\nHere is the student's current course data. Use only this data and never invent courses, dates, or grades. " +
    'Quote numbers exactly as given. Do not calculate overall course grades yourself; if asked for an overall grade or the score needed, say the Grades tab shows it. ' +
    'If something is not in the data, say you do not have it.\n\n' +
    context
  );
}

wss.on('connection', async (clientWs: WebSocket, req: http.IncomingMessage) => {
  console.log('Client connected to Live Voice Advisor WebSocket');
  let liveSession: any = null;
  let started = false;
  let clientUid: string | null = null;

  // Extract query token if present: /api/live?token=...
  const host = req.headers.host || 'localhost';
  const reqUrl = new URL(req.url || '', `http://${host}`);
  const queryToken = reqUrl.searchParams.get('token');

  const authenticateAndCheckRateLimit = async (token: string): Promise<string | null> => {
    try {
      const authResult = await authenticateStudent(token);
      const check = checkAndRecordAiRequest(authResult.uid);
      if (!check.allowed) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'error', error: check.message }));
        }
        clientWs.close(4429, 'Rate limit exceeded');
        return null;
      }
      return authResult.uid;
    } catch (err: any) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            error: err.message || 'Please sign in to talk with the Live Voice Advisor.',
          })
        );
      }
      clientWs.close(4401, 'Unauthorized');
      return null;
    }
  };

  if (queryToken) {
    clientUid = await authenticateAndCheckRateLimit(queryToken);
    if (!clientUid) return;
  }

  const startSession = async (context: string) => {
    if (started) return;
    if (!clientUid) {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            error: 'Please sign in to talk with the Live Voice Advisor.',
          })
        );
      }
      clientWs.close(4401, 'Unauthorized');
      return;
    }
    started = true;
    console.log(
      `Starting live session for student ${clientUid} ${context ? `with ${context.length} characters of course context` : 'without course context'}`
    );
    try {
      liveSession = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: liveInstruction(context),
        },
        callbacks: {
          onmessage: (message: any) => {
            try {
              // Audio output from model
              const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (audioData && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'audio', audio: audioData }));
              }

              // User interruption notification
              if (message.serverContent?.interrupted && clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'interrupted' }));
              }
            } catch (err) {
              console.error('Error relaying Live message to client:', err);
            }
          },
          onclose: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'session_closed' }));
            }
          },
        },
      });

      if (clientWs.readyState !== WebSocket.OPEN) {
        // The page closed while the session was starting
        try { liveSession.close(); } catch (e) { /* ignore */ }
        return;
      }
      clientWs.send(JSON.stringify({ type: 'ready', message: 'Connected to Live Voice Advisor.' }));
    } catch (err: any) {
      console.error('Failed to initialize Gemini Live session:', err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', error: err.message || 'Live session initialization failed' }));
      }
      clientWs.close();
    }
  };

  // If already authenticated via query token, start fallback timer
  let fallbackTimer: NodeJS.Timeout | null = null;
  if (clientUid) {
    fallbackTimer = setTimeout(() => startSession(''), 2500);
  }

  // Handle incoming messages from client (init, audio PCM, or text)
  clientWs.on('message', async (raw: Buffer) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === 'init') {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        // If not already authenticated, authenticate with token in init message
        if (!clientUid && data.token) {
          clientUid = await authenticateAndCheckRateLimit(data.token);
          if (!clientUid) return;
        }
        startSession(typeof data.context === 'string' ? data.context.slice(0, 12000) : '');
        return;
      }

      if (!liveSession) return;

      if (data.audio) {
        liveSession.sendRealtimeInput({
          audio: { data: data.audio, mimeType: 'audio/pcm;rate=16000' },
        });
      } else if (data.text) {
        liveSession.sendRealtimeInput({
          text: data.text,
        });
      }
    } catch (err) {
      console.error('Error receiving client message in Live WS:', err);
    }
  });

  clientWs.on('close', () => {
    console.log('Client disconnected from Live WS');
    if (fallbackTimer) clearTimeout(fallbackTimer);
    try {
      if (liveSession && typeof liveSession.close === 'function') {
        liveSession.close();
      }
    } catch (e) {
      // Ignore cleanup error
    }
  });
});

// Global error middleware to catch 413 payload too large and return readable JSON
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      error: 'The uploaded file payload is too large. Please remove a file or attach smaller PDFs (max 12 MB total raw size).',
      code: 'payload_too_large',
    });
  }
  next(err);
});

// -------------------------------------------------------------
// Vite Middleware / Static Serving
// -------------------------------------------------------------
const isProd = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.DEFAULT_APP_PORT || process.env.PORT || '8080', 10);

async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Apodict server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
