// Builds the silent "How to check a crop" video on the Help page from real
// phone screenshots of the app, so the video always matches what growers see.
//
// 1. Run the app, sign in, and set the browser to a 390×844 phone screen.
// 2. Save one screenshot per step in .local/walkthrough/ as 1.png … 4.png:
//      1.png  Check crop with no photos yet
//      2.png  Photos added, with the "Check my crop" button
//      3.png  A check in progress (the scan line over the photo)
//      4.png  A finished report
// 3. Run: node scripts/make-walkthrough.mjs   (needs ffmpeg)
import sharp from "sharp";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const dir = ".local/walkthrough";
const steps = [
  "Take a photo",
  "Press “Check my crop”",
  "Wait half a minute",
  "Read what to do",
];
const SECONDS = 5;
const WIDTH = 720;
const HEIGHT = 1280;
const BAND = 170;
const esc = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

for (const [i, caption] of steps.entries()) {
  const shot = `${dir}/${i + 1}.png`;
  if (!existsSync(shot))
    throw new Error(
      `Missing ${shot}. Follow the steps at the top of this file.`,
    );
  const band = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${BAND}">
      <rect width="100%" height="100%" fill="#134a33"/>
      <circle cx="84" cy="${BAND / 2}" r="46" fill="#d4f06a"/>
      <text x="84" y="${BAND / 2 + 17}" font-family="Arial" font-size="50" font-weight="700" text-anchor="middle" fill="#0f1e17">${i + 1}</text>
      <text x="154" y="${BAND / 2 + 15}" font-family="Arial" font-size="42" font-weight="700" fill="#ffffff">${esc(caption)}</text>
    </svg>`,
  );
  const screen = await sharp(shot)
    .resize({
      width: WIDTH - 80,
      height: HEIGHT - BAND - 60,
      fit: "contain",
      background: "#edf2e5",
    })
    .toBuffer({ resolveWithObject: true });
  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 3,
      background: "#edf2e5",
    },
  })
    .composite([
      { input: band, top: 0, left: 0 },
      {
        input: screen.data,
        top: BAND + 30,
        left: Math.round((WIDTH - screen.info.width) / 2),
      },
    ])
    .png()
    .toFile(`${dir}/frame-${i}.png`);
}

await sharp(`${dir}/frame-0.png`)
  .jpeg({ quality: 82 })
  .toFile("public/how-to-poster.jpg");
writeFileSync(
  `${dir}/frames.txt`,
  steps.map((_, i) => `file 'frame-${i}.png'\nduration ${SECONDS}`).join("\n") +
    `\nfile 'frame-${steps.length - 1}.png'\n`,
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
  String(steps.length * SECONDS),
  "-vf",
  "fps=24,format=yuv420p",
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "26",
  "-movflags",
  "+faststart",
  "-an",
  "public/how-to.mp4",
]);
const stamp = (s) => `00:${String(s).padStart(2, "0")}.000`;
writeFileSync(
  "public/how-to.vtt",
  "WEBVTT\n\n" +
    steps
      .map(
        (caption, i) =>
          `${stamp(i * SECONDS)} --> ${stamp((i + 1) * SECONDS)}\n${i + 1}. ${caption}\n`,
      )
      .join("\n"),
);
for (let i = 0; i < steps.length; i++) rmSync(`${dir}/frame-${i}.png`);
rmSync(`${dir}/frames.txt`);
console.log("Made public/how-to.mp4, how-to.vtt and how-to-poster.jpg.");
