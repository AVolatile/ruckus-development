import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function validateAudio(decode = false) {
  const manifest = JSON.parse(
    await readFile(path.join(root, "audio/assets.json"), "utf8"),
  );
  const names = new Set(),
    files = new Set();
  const metrics = [];
  let bytes = 0;
  for (const a of manifest.assets) {
    if (
      names.has(a.id) ||
      ![
        a.peak,
        a.dc,
        a.duration,
        a.rms,
        a.loopStart,
        a.loopEnd,
        a.seamDelta,
      ].every(Number.isFinite) ||
      !a.origin ||
      !a.license ||
      a.productionApproved !== false ||
      a.classification !== "pre-release-reference"
    )
      throw Error("Invalid provenance: " + a.id);
    names.add(a.id);
    if (
      a.peak > 0.73 ||
      Math.abs(a.dc) > 0.001 ||
      a.duration <= 0 ||
      a.duration > 30 ||
      a.rms < 0.04 ||
      a.rms > 0.17
    )
      throw Error("Invalid master levels: " + a.id);
    if (
      a.loop &&
      (a.loopStart !== 0 || a.loopEnd !== a.duration || a.seamDelta > 0.08)
    )
      throw Error("Invalid loop: " + a.id);
    if (!Array.isArray(a.formats) || a.formats.length !== 2)
      throw Error("Missing codec fallback: " + a.id);
    for (const f of a.formats) {
      if (!/^\/audio\/[a-z0-9_-]+\.[a-f0-9]{12}\.(ogg|mp3)$/.test(f.url))
        throw Error("Unsafe path");
      const opus = f.url.endsWith(".ogg");
      if (
        f.mime !== (opus ? "audio/ogg" : "audio/mpeg") ||
        !f.url.includes(f.sha256?.slice(0, 12))
      )
        throw Error("Invalid MIME/hash path: " + a.id);
      const data = await readFile(path.join(root, "public", f.url));
      const signatureOK = opus
        ? data.toString("ascii", 0, 4) === "OggS" &&
          data.subarray(0, 64).includes(Buffer.from("OpusHead"))
        : data.toString("ascii", 0, 3) === "ID3" ||
          (data[0] === 0xff && (data[1] & 0xe0) === 0xe0);
      if (!signatureOK) throw Error("Invalid encoded signature: " + a.id);
      if (
        data.length !== f.bytes ||
        createHash("sha256").update(data).digest("hex") !== f.sha256
      )
        throw Error("Hash mismatch: " + f.url);
      files.add(path.basename(f.url));
      bytes += data.length;
      if (decode) {
        const result = spawnSync(
          "ffmpeg",
          [
            "-v",
            "error",
            "-i",
            path.join(root, "public", f.url),
            "-f",
            "f32le",
            "-acodec",
            "pcm_f32le",
            "-ar",
            "48000",
            "-ac",
            "2",
            "pipe:1",
          ],
          { maxBuffer: 16000000 },
        );
        if (result.status !== 0) throw Error("Decode failed: " + f.url);
        const data = result.stdout;
        let peak = 0,
          sum = 0,
          square = 0,
          clipped = 0;
        for (let i = 0; i < data.length; i += 4) {
          const value = data.readFloatLE(i);
          peak = Math.max(peak, Math.abs(value));
          sum += value;
          square += value * value;
          if (Math.abs(value) >= 1) clipped++;
        }
        const n = data.length / 4,
          duration = n / 96000;
        const metric = {
          id: a.id,
          format: f.mime,
          duration,
          peak,
          dc: sum / n,
          rms: Math.sqrt(square / n),
          clipped,
        };
        if (
          clipped ||
          peak > 0.95 ||
          Math.abs(sum / n) > 0.005 ||
          Math.abs(duration - a.duration) > 0.09
        )
          throw Error("Decoded bounds failed: " + a.id);
        metrics.push(metric);
      }
    }
  }
  for (const f of await readdir(path.join(root, "public/audio")))
    if (!files.has(f)) throw Error("Orphan audio: " + f);
  if (bytes > 6000000)
    throw Error("Audio pack exceeds 6 MB dual-format budget");
  const oggBytes = manifest.assets.reduce((n, a) => n + a.formats[0].bytes, 0);
  const result = {
    assets: names.size,
    files: files.size,
    totalBytes: bytes,
    primaryFormatBytes: oggBytes,
    ...(decode ? { decoded: metrics } : {}),
  };
  if (decode) {
    await mkdir(path.join(root, "test-results/phase-3-5"), { recursive: true });
    await writeFile(
      path.join(root, "test-results/phase-3-5/audio-metrics.json"),
      JSON.stringify(result, null, 2),
    );
  }
  return result;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await validateAudio(process.argv.includes("--decode"));
  console.log(JSON.stringify({ ...result, decoded: result.decoded?.length }));
}
