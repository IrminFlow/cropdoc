import sharp from "sharp";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
const dir = ".local/walkthrough";
mkdirSync(dir, { recursive: true });
const steps = [
  [
    "1. Add a crop photo",
    "Show the leaf, fruit, or stem.",
    "Add photos",
    "Take a photo",
  ],
  ["2. Tap Check crop", "No typing needed.", "Photo added ✓", "Check crop"],
  [
    "3. Read what to do",
    "The app may be unsure.",
    "Possible problem: Not clear",
    "What to do: Take a sharper photo",
  ],
  [
    "4. Open My reports",
    "Find your saved reports here.",
    "My reports",
    "Tap a report to open it",
  ],
];
const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
for (let i = 0; i < steps.length; i++) {
  const [title, sub, first, second] = steps[i];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
 <rect width="960" height="720" fill="#f2f6ee"/><text x="55" y="62" font-family="Arial" font-size="26" fill="#176443" font-weight="700">CropDoc · How to use</text>
 <text x="55" y="125" font-family="Arial" font-size="42" font-weight="700" fill="#233b2d">${esc(title)}</text><text x="55" y="175" font-family="Arial" font-size="28" fill="#536357">${esc(sub)}</text>
 <rect x="145" y="215" width="670" height="420" rx="24" fill="white" stroke="#c8d5c7" stroke-width="2"/>
 <text x="180" y="258" font-family="Arial" font-size="20" fill="#536357">Example</text>
 ${i < 2 ? '<rect x="300" y="285" width="360" height="155" rx="12" fill="#eaf2e7"/><path d="M450 407Q396 349 433 309Q504 317 514 357Q525 315 572 312Q579 374 493 390" fill="#609352"/><path d="M476 420L491 348" stroke="#176443" stroke-width="6"/>' : '<path d="M185 307h120m-120 14h80" stroke="#b8ccb1" stroke-width="6" stroke-linecap="round"/>'}
 <rect x="180" y="${i < 2 ? 461 : 360}" width="600" height="65" rx="10" fill="${i === 2 ? "#f2f6ee" : "#176443"}"/>
 <text x="480" y="${i < 2 ? 503 : 402}" font-family="Arial" font-size="${i === 2 ? 27 : 30}" font-weight="700" text-anchor="middle" fill="${i === 2 ? "#233b2d" : "white"}">${esc(first)}</text>
 <rect x="180" y="${i < 2 ? 544 : 450}" width="600" height="65" rx="10" fill="${i === 1 ? "#176443" : "#f2f6ee"}"/>
 <text x="480" y="${i < 2 ? 586 : 492}" font-family="Arial" font-size="${i === 2 ? 27 : 30}" font-weight="700" text-anchor="middle" fill="${i === 1 ? "white" : "#233b2d"}">${esc(second)}</text>
 ${i === 1 ? '<circle cx="730" cy="577" r="39" stroke="#91b474" stroke-width="6" fill="none"/>' : ""}
 <text x="55" y="683" font-family="Arial" font-size="23" fill="#536357">${i + 1} of 4 · No sound</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${dir}/${i}.png`);
}
await sharp(`${dir}/0.png`)
  .jpeg({ quality: 85 })
  .toFile("public/how-to-poster.jpg");
writeFileSync(
  `${dir}/frames.txt`,
  steps.map((_, i) => `file '${i}.png'\nduration 5`).join("\n") +
    "\nfile '3.png'\n",
);
execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  `${dir}/frames.txt`,
  "-t",
  "20",
  "-vf",
  "fps=24,format=yuv420p",
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "25",
  "-movflags",
  "+faststart",
  "-an",
  "public/how-to.mp4",
]);
writeFileSync(
  "public/how-to.vtt",
  `WEBVTT\n\n00:00.000 --> 00:05.000\n1. Add a clear photo of the affected leaf, fruit, or stem.\n\n00:05.000 --> 00:10.000\n2. Tap Check crop. You do not need to type anything.\n\n00:10.000 --> 00:15.000\n3. Read the care steps. The app may be unsure.\n\n00:15.000 --> 00:20.000\n4. Open My reports to find your saved reports.\n`,
);
rmSync(dir, { recursive: true });
console.log("Created silent 20-second walkthrough.");
