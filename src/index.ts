import crypto from "node:crypto";
import express, { NextFunction, Request, Response } from "express";
import multer, { MulterError } from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

const ShiftSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "must be HH:MM"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "must be HH:MM"),
});
type Shift = z.infer<typeof ShiftSchema>;

const JsonArraySchema = z.array(z.unknown());

const ParseScheduleBodySchema = z.object({
  employeeName: z.string().trim().catch(""),
  workplaceName: z.string().trim().catch(""),
});

const AllowedImageTypeSchema = z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Logs every request/response pair, and flags connections the client dropped
// before a response went out — the key signal for "network connection was
// lost" style errors reported by the iOS Shortcut.
app.use((req: Request, res: Response, next: NextFunction) => {
  req.requestId = crypto.randomUUID().slice(0, 8);
  const start = Date.now();
  console.log(
    `[${req.requestId}] <- ${req.method} ${req.originalUrl} (content-length: ${req.get("content-length") || "unknown"}, content-type: ${req.get("content-type") || "unknown"})`
  );

  res.on("finish", () => {
    console.log(`[${req.requestId}] -> ${res.statusCode} in ${Date.now() - start}ms`);
  });
  req.on("close", () => {
    if (!res.writableEnded) {
      console.warn(`[${req.requestId}] client closed the connection before a response was sent (${Date.now() - start}ms elapsed)`);
    }
  });

  next();
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
  return JsonArraySchema.parse(parsed);
}

function isValidShift(shift: unknown): shift is Shift {
  return ShiftSchema.safeParse(shift).success;
}

app.get("/health", (req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post(
  "/parse-schedule",
  upload.single("image"),
  async (req: Request<Record<string, never>, unknown, unknown>, res: Response) => {
    const auth = req.get("authorization") || "";
    const expected = process.env.API_SECRET;
    if (!expected) {
      console.error(`[${req.requestId}] server missing API_SECRET configuration`);
      return res.status(500).json({ error: "Server missing API_SECRET configuration" });
    }
    if (auth !== `Bearer ${expected}`) {
      console.warn(`[${req.requestId}] unauthorized: authorization header ${auth ? "present but did not match" : "missing"}`);
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.file) {
      console.warn(`[${req.requestId}] no 'image' file present in form data`);
      return res.status(400).json({ error: "Missing 'image' file in form data" });
    }
    console.log(`[${req.requestId}] received file: ${req.file.originalname || "(unnamed)"}, ${req.file.mimetype}, ${req.file.size} bytes`);
    const mimetypeResult = AllowedImageTypeSchema.safeParse(req.file.mimetype);
    if (!mimetypeResult.success) {
      console.warn(`[${req.requestId}] rejected file with unsupported mimetype: ${req.file.mimetype}`);
      return res.status(400).json({ error: "Uploaded file must be a JPEG, PNG, GIF, or WEBP image" });
    }
    const mimetype = mimetypeResult.data;

    const { employeeName, workplaceName } = ParseScheduleBodySchema.parse(req.body);
    const todayISO = new Date().toISOString().slice(0, 10);
    console.log(`[${req.requestId}] employeeName="${employeeName}", workplaceName="${workplaceName}", todayISO=${todayISO}`);

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
      console.error(`[${req.requestId}] Claude API call failed:`, err);
      return res.status(502).json({ error: "Failed to reach the parsing model" });
    }

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock) {
      console.error(`[${req.requestId}] Claude returned no text content block`);
      return res.status(502).json({ error: "Model returned no text content" });
    }
    console.log(`[${req.requestId}] Claude response text: ${textBlock.text}`);

    let shifts: unknown[];
    try {
      shifts = extractJsonArray(textBlock.text);
    } catch (err) {
      console.error(`[${req.requestId}] failed to parse model output as JSON:`, textBlock.text);
      return res.status(502).json({ error: "Model response was not valid JSON" });
    }

    const validShifts = shifts.filter(isValidShift);
    console.log(`[${req.requestId}] sending ${validShifts.length} valid shift(s) (${shifts.length} total from model): ${JSON.stringify(validShifts)}`);
    res.json(validShifts);
  }
);

// Multer errors (e.g. file too large) land here rather than crashing the process.
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof MulterError) {
    console.warn(`[${req.requestId}] multer error: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
  console.error(`[${req.requestId}] unexpected error:`, err);
  res.status(500).json({ error: "Unexpected server error" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`work-schedule server listening on port ${port}`);
});
