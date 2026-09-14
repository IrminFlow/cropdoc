import "server-only";
import { z } from "zod";
import { AppError } from "./errors";
import { REPORT_PROMPT, reportSchema, validateReport } from "./report";

export const GEMINI_MODEL = "gemini-3.8-flash";
export const AI_QUOTA_MESSAGE =
  "The crop checker has reached its free limit. Your photos are saved. Please try again later.";

/** Enable only after verifying this key's dedicated project has no billing. */
export function geminiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (
    !key ||
    process.env.GEMINI_FREE_TIER_VERIFIED !== "true" ||
    !process.env.GEMINI_PROJECT_ID ||
    (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== GEMINI_MODEL)
  ) {
    throw new AppError(
      "AI_CONFIGURATION",
      "Crop checking is not ready yet. Your saved reports are still here.",
      503,
    );
  }
  return key;
}

const interactionSchema = z.object({
  status: z.literal("completed"),
  steps: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .optional(),
    }),
  ),
});

export async function analyzePhotos(
  apiKey: string,
  photos: string[],
  crop: string,
  notes: string,
) {
  // One standard, stateless request. No tools, SDK retries, fallback or billing APIs.
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      redirect: "error",
      signal: AbortSignal.timeout(75_000),
      body: JSON.stringify({
        model: GEMINI_MODEL,
        store: false,
        system_instruction: REPORT_PROMPT,
        input: [
          { type: "text", text: JSON.stringify({ crop, notes }) },
          ...photos.map((data) => ({
            type: "image",
            data,
            mime_type: "image/jpeg",
          })),
        ],
        generation_config: {
          max_output_tokens: 1500,
          thinking_level: "low",
          thinking_summaries: "none",
        },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: z.toJSONSchema(reportSchema),
        },
      }),
    },
  );
  if (response.status === 429)
    throw new AppError("AI_QUOTA", AI_QUOTA_MESSAGE, 429);
  if (!response.ok)
    throw new AppError(
      "AI_PROVIDER",
      "The check could not finish. Please try again later.",
      503,
    );
  const result = interactionSchema.parse(await response.json());
  const output = result.steps
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? []);
  if (
    !output.length ||
    output.some((part) => part.type !== "text" || !part.text)
  )
    throw new Error("Invalid or refused analysis");
  return validateReport(JSON.parse(output.map((part) => part.text).join("")));
}
