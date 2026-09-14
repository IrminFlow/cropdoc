import "server-only";
import { z } from "zod";
import { AppError } from "./errors";
import { REPORT_PROMPT, reportSchema, validateReport } from "./report";

export const OPENROUTER_MODEL = "dots-studio/dots-3-note-preview:free";
export const AI_QUOTA_MESSAGE =
  "The crop checker has reached its free limit. Your photos are saved. Please try again later.";

export function openrouterKey() {
  const key = process.env.OPENROUTER_API_KEY;
  if (
    !key ||
    process.env.OPENROUTER_FREE_TIER_VERIFIED !== "true" ||
    (process.env.OPENROUTER_MODEL &&
      process.env.OPENROUTER_MODEL !== OPENROUTER_MODEL)
  ) {
    throw new AppError(
      "AI_CONFIGURATION",
      "Crop checking is not ready yet. Your saved reports are still here.",
      503,
    );
  }
  return key;
}

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.literal("stop"),
        message: z.object({
          content: z.string().min(1),
          refusal: z.null().optional(),
        }),
      }),
    )
    .length(1),
  usage: z.object({ cost: z.literal(0) }),
});

export async function analyzePhotos(
  apiKey: string,
  photos: string[],
  crop: string,
  notes: string,
) {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(75_000),
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        provider: {
          allow_fallbacks: false,
          require_parameters: true,
          data_collection: "deny",
          max_price: { prompt: 0, completion: 0 },
        },
        messages: [
          {
            role: "system",
            content:
              REPORT_PROMPT +
              " Required JSON schema: " +
              JSON.stringify(z.toJSONSchema(reportSchema)),
          },
          {
            role: "user",
            content: [
              { type: "text", text: JSON.stringify({ crop, notes }) },
              ...photos.map((data) => ({
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${data}` },
              })),
            ],
          },
        ],
        max_tokens: 2000,
        reasoning: { enabled: false, exclude: true },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "crop_report",
            strict: true,
            schema: z.toJSONSchema(reportSchema),
          },
        },
      }),
    },
  );
  if (response.status === 429 || response.status === 402)
    throw new AppError("AI_QUOTA", AI_QUOTA_MESSAGE, 429);
  if (!response.ok)
    throw new AppError(
      "AI_PROVIDER",
      "The check could not finish. Please try again later.",
      503,
    );
  const result = completionSchema.parse(await response.json());
  return validateReport(JSON.parse(result.choices[0].message.content));
}
