const express = require("express");
const multer = require("multer");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildPrompt(employeeName, todayISO) {
  return `You are reading a photo of a work schedule for an employee at Coffee Bean & Tea Leaf. The photo is either a screenshot from the ADP scheduling app (usually showing only this employee's own shifts) or a photo of a printed weekly schedule posted in the store (which may list multiple employees in a grid, by day).

The employee's name as it appears on schedules is: "${employeeName || "(not provided — assume the image only shows one employee's own shifts)"}". Only include shifts that belong to this employee. Matching may be by first name only, first name + last initial, or full name, case-insensitive.

Today's date is ${todayISO}. Schedule dates are usually shown as just a month/day without a year — use today's date to resolve the correct year (the schedule is almost always for the current week or the next one, never more than a few months from today).

Respond with ONLY a JSON array, no prose, no markdown code fences. Each element must look like:
{"date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM"}
using 24-hour time. If a shift crosses midnight, still report the times as given (end_time may be numerically earlier than start_time). If you cannot find any shifts for this employee, or the image doesn't appear to be a schedule at all, respond with an empty array: []`;
}

function extractJsonArray(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const parsed = JSON.parse(candidate);
  if (!Array.isArray(parsed)) {
    throw new Error("Model response was not a JSON array");
  }
  return parsed;
}

function isValidShift(shift) {
  return (
    shift &&
    typeof shift.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(shift.date) &&
    typeof shift.start_time === "string" &&
    /^\d{2}:\d{2}$/.test(shift.start_time) &&
    typeof shift.end_time === "string" &&
    /^\d{2}:\d{2}$/.test(shift.end_time)
  );
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/parse-schedule", upload.single("image"), async (req, res) => {
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
  if (!req.file.mimetype || !req.file.mimetype.startsWith("image/")) {
    return res.status(400).json({ error: "Uploaded file is not an image" });
  }

  const employeeName = (req.body.employeeName || "").trim();
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
                media_type: req.file.mimetype,
                data: req.file.buffer.toString("base64"),
              },
            },
            {
              type: "text",
              text: buildPrompt(employeeName, todayISO),
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

  let shifts;
  try {
    shifts = extractJsonArray(textBlock.text);
  } catch (err) {
    console.error("Failed to parse model output as JSON:", textBlock.text);
    return res.status(502).json({ error: "Model response was not valid JSON" });
  }

  const validShifts = shifts.filter(isValidShift);
  res.json(validShifts);
});

// Multer errors (e.g. file too large) land here rather than crashing the process.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`work-schedule server listening on port ${port}`);
});
