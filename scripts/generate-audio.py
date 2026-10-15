#!/usr/bin/env python3
"""Original, sample-free Ruckus reference pack. NumPy + ffmpeg; no network input."""
import hashlib
import json
import math
import re
import shutil
import subprocess
import wave
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/audio'
MASTERS = ROOT / '.local/audio-masters'
RATE = 48000
VERSION = 'ruckus-procedural-v1'
CREATED = '2026-10-15'
MUSIC = {
    'lobby': (112, 50, 0),
    'intro': (120, 50, 1),
    'hotwire': (136, 50, 2),
    'room-temperature': (106, 53, 3),
    'sellout': (120, 55, 4),
    'caption-this': (110, 57, 5),
    'odd-one-in': (108, 50, 6),
    'scribble-shift': (130, 55, 7),
    'studio': (116, 50, 8),
    'results': (112, 53, 9),
    'leaderboard': (124, 55, 10),
    'intermission': (104, 53, 11),
    'finale': (128, 50, 12),
}
SFX = {
    'event_start': 1.35,
    'segment_intro': 0.85,
    'lock': 0.25,
    'reveal': 1.1,
    'leaderboard_sting': 1.3,
    'finale_sting': 2.0,
    'end': 1.2,
    'tick_soft': 0.12,
    'tick_urgent': 0.14,
    'select': 0.08,
    'confirm': 0.22,
    'vote': 0.24,
    'correct': 0.38,
    'incorrect': 0.3,
}


def seed(name):
    return int.from_bytes(hashlib.sha256((VERSION + name).encode()).digest()[:8], 'little')


def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def add(target, at, signal, pan=0.0, circular=True):
    idx = np.arange(len(signal)) + round(at * RATE)
    if circular:
        idx %= len(target)
    else:
        keep = idx < len(target)
        idx = idx[keep]
        signal = signal[keep]
    target[idx, 0] += signal * math.sqrt((1 - pan) / 2)
    target[idx, 1] += signal * math.sqrt((1 + pan) / 2)


def voice(midi, duration, kind='pluck'):
    t = np.arange(round(duration * RATE)) / RATE
    f = hz(midi)
    attack = np.minimum(1, t / 0.008)
    if kind == 'pad':
        env = np.sin(np.pi * np.minimum(1, t / duration)) ** 2
        return 0.15 * env * (np.sin(2 * np.pi * f * t) + 0.32 * np.sin(2 * np.pi * f * 1.002 * t) + 0.14 * np.sin(2 * np.pi * f * 2 * t))
    if kind == 'bass':
        return 0.28 * attack * np.exp(-t * 7) * (np.sin(2 * np.pi * f * t) + 0.2 * np.sin(4 * np.pi * f * t))
    return 0.21 * attack * np.exp(-t * 9) * (np.sin(2 * np.pi * f * t + 1.25 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 16)) + 0.12 * np.sin(4 * np.pi * f * t))


def drums(kind, rng):
    duration = 0.4 if kind == 'kick' else 0.16
    t = np.arange(round(duration * RATE)) / RATE
    if kind == 'kick':
        return 0.48 * np.sin(2 * np.pi * (48 * t + 3.6 * (1 - np.exp(-t * 35)))) * np.exp(-t * 16) * np.minimum(1, t / 0.003)
    noise = rng.normal(0, 1, len(t))
    noise = np.convolve(noise, np.ones(7) / 7, 'same')
    return (0.12 if kind == 'hat' else 0.18) * noise * np.exp(-t * (65 if kind == 'hat' else 30)) * np.minimum(1, t / 0.002)


def music(name, bpm, root, personality):
    beat = 60 / bpm
    duration = 32 * beat
    n = round(duration * RATE)
    out = np.zeros((n, 2))
    rng = np.random.default_rng(seed(name))
    steps = [0, 7, 4, 9, 2, 7, 11, 4]
    progress = [0, 5, 2, 7, 0, 9, 5, 2]
    for bar in range(8):
        start = bar * 4 * beat
        chord = progress[(bar + personality % 3) % 8]
        minor = name == 'odd-one-in'
        for interval in [0, 3 if minor else 4, 7, 14]:
            add(out, start, voice(root + chord + interval, 4.4 * beat, 'pad'), pan=(interval - 7) / 18)
        for step in range(16):
            at = start + step * beat / 4
            if step in ([0, 6, 8, 14] if personality % 2 else [0, 8, 11]):
                add(out, at, drums('kick', rng))
            if step in [4, 12]:
                add(out, at, drums('snare', rng), 0.12)
            if step % 2 == 0 and (not (name == 'caption-this' and step % 4)):
                add(out, at, drums('hat', rng), -0.25 if step % 4 else 0.25)
            if step in [0, 3, 6, 8, 10, 14]:
                add(out, at, voice(root - 12 + chord + [0, 7, 0, 0, 12, 7][[0, 3, 6, 8, 10, 14].index(step)], 0.65, 'bass'))
            if step in ([2, 7, 10, 15] if name != 'hotwire' else [0, 3, 6, 9, 12, 14]):
                note = steps[(bar * 3 + step + personality) % len(steps)]
                add(out, at, voice(root + 12 + note, 0.55), pan=float(rng.uniform(-0.5, 0.5)))
    if name in ['intro', 'finale', 'leaderboard']:
        for bar in range(8):
            for j, note in enumerate([0, 9, 7, 14]):
                add(out, (bar * 4 + j * 0.5) * beat, voice(root + 12 + note, 0.7), (-1) ** j * 0.3)
    return (out, duration)


def effect(name, duration):
    rng = np.random.default_rng(seed(name))
    out = np.zeros((round(duration * RATE), 2))
    if name.startswith('tick'):
        add(out, 0, voice(68 if name == 'tick_soft' else 73, duration), circular=False)
    elif name in ['select', 'confirm', 'vote', 'correct', 'incorrect', 'lock']:
        notes = {
            'select': [62],
            'confirm': [62, 69],
            'vote': [65, 72],
            'correct': [62, 69, 74],
            'incorrect': [60, 57],
            'lock': [50, 62],
        }[name]
        for j, note in enumerate(notes):
            add(out, j * 0.045, voice(note, max(0.04, duration - j * 0.045)), circular=False)
    else:
        motifs = {
            'event_start': [50, 59, 57, 64, 62],
            'segment_intro': [57, 64, 66],
            'reveal': [50, 62, 69, 66],
            'leaderboard_sting': [55, 64, 62, 69],
            'finale_sting': [50, 57, 66, 69, 74, 78],
            'end': [69, 66, 62, 50],
        }
        notes = motifs[name]
        for j, note in enumerate(notes):
            at = j * duration / (len(notes) + 2)
            add(out, at, voice(note, duration - at), pan=(-1) ** j * 0.22, circular=False)
        add(out, 0, drums('kick', rng), circular=False)
        if name != 'end':
            add(out, duration * 0.15, drums('snare', rng), circular=False)
    # Effects finish quietly; looping beds wrap their note tails instead.
    fade = max(2, round(0.008 * RATE))
    out[:fade] *= np.linspace(0, 1, fade)[:, None]
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return (out, duration)


def render(name, signal, duration, loop):
    signal -= signal.mean(axis=0)
    signal = np.tanh(signal * 1.4)
    rms = float(np.sqrt(np.mean(signal ** 2)))
    target = 0.105 if loop else 0.12
    signal *= min(target / max(rms, 1e-09), 0.72 / max(float(np.max(np.abs(signal))), 1e-09))
    pcm = np.round(signal * 32767).astype('<i2')
    master = MASTERS / (name + '.wav')
    with wave.open(str(master), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    formats = []
    for ext, codec, mime, bitrate in [('ogg', 'libopus', 'audio/ogg', '64000'), ('mp3', 'libmp3lame', 'audio/mpeg', '96000')]:
        temp = MASTERS / (name + '.' + ext)
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+bitexact', '-i', str(master), '-map_metadata', '-1', '-flags:a', '+bitexact', '-c:a', codec, '-b:a', bitrate, '-fflags', '+bitexact', str(temp)], check=True)
        data = temp.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        filename = f'{name}.{digest[:12]}.{ext}'
        (OUT / filename).write_bytes(data)
        formats.append({
            'url': '/audio/' + filename,
            'mime': mime,
            'bytes': len(data),
            'sha256': digest,
        })
    return {
        'id': name,
        'kind': 'music' if loop else 'sfx',
        'purpose': ('Loop: ' if loop else 'Cue: ') + name,
        'loop': loop,
        'loopStart': 0,
        'loopEnd': round(len(signal) / RATE, 6),
        'duration': round(len(signal) / RATE, 6),
        'sampleRate': RATE,
        'formats': formats,
        'peak': round(float(np.max(np.abs(signal))), 6),
        'rms': round(float(np.sqrt(np.mean(signal ** 2))), 6),
        'dc': round(float(np.mean(signal)), 8),
        'seamDelta': round(float(np.max(np.abs(signal[0] - signal[-1]))), 6),
        'masterSha256': hashlib.sha256(pcm.tobytes()).hexdigest(),
        'origin': 'Original deterministic synthesis; no imported recordings, compositions or samples',
        'author': 'Ruckus project procedural generator',
        'generator': VERSION,
        'createdAt': CREATED,
        'license': 'Project-owned original procedural output; no third-party sample license',
        'productionApproved': False,
        'classification': 'pre-release-reference',
        'ships': True,
    }


def main():
    if not shutil.which('ffmpeg'):
        raise SystemExit('ffmpeg is required for deterministic encoding')
    OUT.mkdir(exist_ok=True, parents=True)
    MASTERS.mkdir(exist_ok=True, parents=True)
    assets = []
    for name, args in MUSIC.items():
        signal, duration = music(name, *args)
        assets.append(render(name, signal, duration, True))
    for name, duration in SFX.items():
        signal, duration = effect(name, duration)
        assets.append(render(name, signal, duration, False))
    # Retire generated compressed files only; preserve unrelated project assets.
    keep = {Path(f['url']).name for a in assets for f in a['formats']}
    for p in OUT.iterdir():
        generated = re.fullmatch(r'[a-z0-9_-]+\.[a-f0-9]{12}\.(ogg|mp3)', p.name)
        known_id = p.name.split('.')[0] in MUSIC or p.name.split('.')[0] in SFX
        if generated and known_id and p.name not in keep:
            p.unlink()
    manifest = {
        'version': 1,
        'generator': VERSION,
        'createdAt': CREATED,
        'encoder': subprocess.check_output(['ffmpeg', '-version'], text=True).splitlines()[0],
        'classification': 'Original pre-release reference pack; human audible approval pending',
        'assets': assets,
    }
    (ROOT / 'audio/assets.json').write_text(json.dumps(manifest, indent=2) + '\n')
    fields = ['id', 'kind', 'loop', 'loopStart', 'loopEnd', 'duration', 'formats']
    catalog = {
        asset['id']: {field: asset[field] for field in fields}
        for asset in assets
    }
    (ROOT / 'src/audio/assetCatalog.ts').write_text(
        '// Generated by scripts/generate-audio.py. Provenance: audio/assets.json.\n'
        'export const assetCatalog = ' + json.dumps(catalog, indent=2) + ' as const;\n'
    )
    total_bytes = sum(f['bytes'] for asset in assets for f in asset['formats'])
    print(
        f"Generated {len(assets)} original assets, {total_bytes} compressed bytes "
        "(both formats). Lossless masters in ignored .local/audio-masters."
    )


if __name__ == '__main__':
    main()
