import express, { NextFunction, Request, Response } from "express";
import multer, { MulterError } from "multer";
import Anthropic from "@anthropic-ai/sdk";

interface Shift {
  date: string;
  start_time: string;
  end_time: string;
}

interface ParseScheduleBody {
  employeeName?: string;
  workplaceName?: string;
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

function isAllowedImageType(mimetype: string): mimetype is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimetype);
}

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildPrompt(employeeName: string, workplaceName: string, todayISO: string): string {
  return `You are reading a photo of a work schedule for an employee at ${workplaceName || "their workplace"}. The photo is either a screenshot from a scheduling app (usually showing only this employee's own shifts) or a photo of a printed weekly schedule posted at the workplace (which may list multiple employees in a grid, by day).

The employee's name as it appears on schedules is: "${employeeName || "(not provided — assume the image only shows one employee's own shifts)"}". Only include shifts that belong to this employee. Matching may be by first name only, first name + last initial, or full name, case-insensitive.

Today's date is ${todayISO}. Schedule dates are usually shown as just a month/day without a year — use today's date to resolve the correct year (the schedule is almost always for the current week or the next one, never more than a few months from today).

Respond with ONLY a JSON array, no prose, no markdown code fences. Each element must look like:
{"date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM"}
using 24-hour time. If a shift crosses midnight, still report the times as given (end_time may be numerically earlier than start_time). If you cannot find any shifts for this employee, or the image doesn't appear to be a schedule at all, respond with an empty array: []`;
}

function extractJsonArray(text: string): unknown[] {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const parsed = JSON.parse(candidate);
  if (!Array.isArray(parsed)) {
    throw new Error("Model response was not a JSON array");
  }
  return parsed;
}

function isValidShift(shift: unknown): shift is Shift {
  const s = shift as Shift;
  return (
    !!s &&
    typeof s.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
    typeof s.start_time === "string" &&
    /^\d{2}:\d{2}$/.test(s.start_time) &&
    typeof s.end_time === "string" &&
    /^\d{2}:\d{2}$/.test(s.end_time)
  );
}

app.get("/health", (req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post(
  "/parse-schedule",
  upload.single("image"),
  async (req: Request<Record<string, never>, unknown, ParseScheduleBody>, res: Response) => {
    const auth = req.get("authorization") || "";
    const expected = process.env.API_SECRET;
    if (!expected) {
      return res.status(500).json({ error: "Server missing API_SECRET configuration" });
    }
    if (auth !== `Bearer ${expected}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Missing 'image' file in form data" });
    }
    const mimetype = req.file.mimetype;
    if (!mimetype || !isAllowedImageType(mimetype)) {
      return res.status(400).json({ error: "Uploaded file must be a JPEG, PNG, GIF, or WEBP image" });
    }

    const employeeName = (req.body.employeeName || "").trim();
    const workplaceName = (req.body.workplaceName || "").trim();
    const todayISO = new Date().toISOString().slice(0, 10);

    let message;
    try {
      message = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimetype,
                  data: req.file.buffer.toString("base64"),
                },
              },
              {
                type: "text",
                text: buildPrompt(employeeName, workplaceName, todayISO),
              },
            ],
          },
        ],
      });
    } catch (err) {
      console.error("Claude API call failed:", err);
      return res.status(502).json({ error: "Failed to reach the parsing model" });
    }

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock) {
      return res.status(502).json({ error: "Model returned no text content" });
    }

    let shifts: unknown[];
    try {
      shifts = extractJsonArray(textBlock.text);
    } catch (err) {
      console.error("Failed to parse model output as JSON:", textBlock.text);
      return res.status(502).json({ error: "Model response was not valid JSON" });
    }

    const validShifts = shifts.filter(isValidShift);
    res.json(validShifts);
  }
);

// Multer errors (e.g. file too large) land here rather than crashing the process.
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof MulterError) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`work-schedule server listening on port ${port}`);
});
