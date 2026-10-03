import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { AppError } from "./errors";
import { REPORT_PROMPT, reportSchema, validateReport } from "./report";

export const OPENAI_MODEL = "gpt-6-luna";
export const AI_QUOTA_MESSAGE =
  "The crop checker has reached its limit. Your photos are saved. Please try again later.";

// GPT-6 Luna, USD per million tokens: input 0.10, output 0.50.
// Cached input is counted at the full input price to stay conservative.
const INPUT_MICROUSD_PER_TOKEN = 0.1;
const OUTPUT_MICROUSD_PER_TOKEN = 0.5;

export function openaiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (
    !key ||
    (process.env.OPENAI_MODEL && process.env.OPENAI_MODEL !== OPENAI_MODEL)
  ) {
    throw new AppError(
      "AI_CONFIGURATION",
      "Crop checking is not ready yet. Your saved reports are still here.",
      503,
    );
  }
  return key;
}

/** Provider failure that still records what the attempt actually cost. */
export class AnalysisError extends AppError {
  constructor(
    code: string,
    message: string,
    status: number,
    public cost: number | null,
  ) {
    super(code, message, status);
  }
}

export async function analyzePhotos(
  apiKey: string,
  photos: string[],
  crop: string,
  notes: string,
) {
  const openai = new OpenAI({ apiKey, timeout: 75_000, maxRetries: 0 });
  let response;
  try {
    response = await openai.responses.parse({
      model: OPENAI_MODEL,
      store: false,
      reasoning: { effort: "medium" },
      max_output_tokens: 4000,
      input: [
        { role: "system", content: REPORT_PROMPT },
        {
          role: "user",
          content: [
            { type: "input_text", text: JSON.stringify({ crop, notes }) },
            ...photos.map((data) => ({
              type: "input_image" as const,
              image_url: `data:image/jpeg;base64,${data}`,
              detail: "high" as const,
            })),
          ],
        },
      ],
      text: { format: zodTextFormat(reportSchema, "crop_report") },
    });
  } catch (error) {
    // OpenAI does not bill rejected requests; timeouts may have been billed.
    const rejected = error instanceof OpenAI.APIError && error.status;
    if (error instanceof OpenAI.APIError && error.status === 429)
      throw new AnalysisError("AI_QUOTA", AI_QUOTA_MESSAGE, 429, 0);
    throw new AnalysisError(
      "AI_PROVIDER",
      "The check could not finish. Please try again later.",
      503,
      rejected ? 0 : null,
    );
  }
  const cost = response.usage
    ? Math.ceil(
        response.usage.input_tokens * INPUT_MICROUSD_PER_TOKEN +
          response.usage.output_tokens * OUTPUT_MICROUSD_PER_TOKEN,
      )
    : null;
  try {
    if (response.status !== "completed" || !response.output_parsed)
      throw new Error("Incomplete or refused response");
    return { report: validateReport(response.output_parsed), cost };
  } catch {
    throw new AnalysisError(
      "AI_PROVIDER",
      "The check could not finish. Please try again later.",
      503,
      cost,
    );
  }
}
