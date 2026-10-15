# Ruckus procedural audio provenance

This original **pre-release reference pack** is generated entirely in-repo from mathematical synthesis and project-authored sequencing parameters. It contains no downloaded tracks, recorded samples, third-party compositions, generative-music API output or deliberately imitated sonic branding. It is the provisional default pack in the current build, not a commissioned or human-approved final soundtrack.

`assets.json` is the machine-readable source of truth: purpose, generator/author, creation date, rights description, SHA-256, codecs/bytes, lossless waveform hash, duration/loop points, peak/RMS/DC/seam metrics and explicit `productionApproved: false`. Each asset is classified `pre-release-reference`, with `ships: true`. This means original provisional material is included in the artifact, not that reference material is secretly excluded or commercially certified.

Rights: project-owned original procedural output, controlled by the Ruckus project owner; no third-party sample or composition license is required for these generated signals. No open redistribution license or license to unrelated product material is granted here. The generation tools (Python/NumPy/ffmpeg) are development tools, not samples embedded in the waveform; their program licenses are not a music-content license. This document makes no legal clearance claim for the wider product. Human review remains required for public-release sonic approval.

## Regeneration

Use Python 3 with NumPy and ffmpeg with libopus/libmp3lame. The local environment provides `/usr/local/bin/python3` with NumPy and `/opt/homebrew/bin/ffmpeg` 8.1. Normal command:

```sh
npm run audio:generate
npm run audio:validate
# Optional full decoded-signal checks when ffmpeg is installed:
node scripts/validate-audio.mjs --decode
```

If a different Python is first in PATH, run `scripts/generate-audio.py` with the NumPy-enabled interpreter, then format `src/audio/assetCatalog.ts` and `audio/assets.json`. NumPy is needed only for optional asset regeneration, not Node builds/runtime/CI validation. Lossless 48 kHz stereo PCM masters are regenerated in ignored `.local/audio-masters`; production contains compressed Opus-in-Ogg primary files and MP3 fallbacks only. Static filenames contain content hashes. Seeds/version/creation date are committed constants; output-bitexact ffmpeg settings stabilize container serials/metadata. Encoded reproducibility is checked with the recorded encoder version; different encoder versions may legitimately produce new hashes.

## Pack design

Thirteen loop beds: lobby, intro, six Originals, neutral Studio, results, leaderboard, intermission and finale. A scoreless/poll Studio profile reuses the social Room Temperature bed without countdown tension. Fourteen short effects cover transitions, lock/reveal/leaderboard/finale/end, soft/urgent ticks and private phone choice/confirmation/vote/correctness.

The generator combines rounded FM plucks, low bass, quiet sustained voicings, synthetic kick/noise percussion, sparse note patterns and bounded stereo placement. Musical events wrap through loop boundaries. Effects have short silent edge ramps. Master DC is removed; music targets roughly 0.105 RMS, effects 0.12 RMS with a 0.72 peak ceiling. Lossy decoded output is separately checked for clipping, DC and duration; RMS is an engineering consistency proxy, not a subjective loudness certification. Web Audio buses add conservative gain and a shared protective compressor.

## Approval status

Automated testing checks hashes/provenance/budgets/decoded signal bounds, browser decoding, lifecycle logic and UI controls. **Physical speaker/headphone listening, Mobile Safari/iOS silent-switch behavior and subjective musical quality were not verified in this environment.** Review repetition, loop seams, speech interference, loudness, countdown fatigue and musical identity on real equipment before public release. Keep stable semantic/profile identifiers when replacing this pack with commissioned original or properly licensed commercial SaaS-redistributable material. Do not label replacement assets approved until their rights and audible QA are documented.
