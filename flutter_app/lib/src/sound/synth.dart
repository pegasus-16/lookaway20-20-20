/// Offline synthesiser for Lookaway's reminder sounds.
///
/// Pure Dart, so it works without Flutter, a platform audio engine or any
/// bundled audio assets: each sound is rendered into a mono 16-bit PCM WAV file
/// in memory, which the caller can hand to a player or cache.
///
/// This is a port of `src/lib/sounds.ts` (Web Audio API) and keeps the same
/// notes, partials, start offsets, attacks and decay curves.
library;

import 'dart:math';
import 'dart:typed_data';

import '../model/sound_kind.dart';

/// 22.05 kHz is plenty for the bell-like material here and halves the bytes.
const int _sampleRate = 22050;

/// Small lead-in before the first note, mirroring the TS `currentTime + 0.03`.
const double _leadIn = 0.03;

/// Web Audio's `exponentialRampToValueAtTime` target: effectively silence.
const double _silence = 0.0001;

/// Leave a little headroom so the mix never clips on a device.
const double _maxPeak = 0.85;

/// Hard cap on rendered length so one sound can never become a long file.
const double _maxSeconds = 8.0;

/// Renders [kind] at the [start] or `end` of a break as a complete WAV file.
///
/// The result is a standard 44-byte RIFF/WAVE header followed by little-endian
/// 16-bit mono samples at 22050 Hz. Output is deterministic, so the same call
/// always yields the same bytes.
Uint8List synthWav(SoundKind kind, {required bool start}) {
  final partials = _score(kind, start);
  final seconds = partials.fold<double>(0, (longest, p) {
    return max(longest, p.end);
  });
  final length = (min(seconds, _maxSeconds) * _sampleRate).ceil();
  final mix = _render(partials, length);

  var peak = 0.0;
  for (final sample in mix) {
    final level = sample.abs();
    if (level > peak) peak = level;
  }
  final gain = peak > _maxPeak ? _maxPeak / peak : 1.0;

  return _encode(mix, gain);
}

/// One sine partial: a frequency with its own attack and exponential decay.
class _Partial {
  const _Partial(this.freq, this.at, this.peak, this.decay, this.attack);

  final double freq;

  /// Seconds from the start of the file until this partial begins.
  final double at;
  final double peak;
  final double decay;
  final double attack;

  /// When the envelope has decayed to [_silence].
  double get end => at + attack + decay;
}

/// The notes for one moment of one sound, in file time.
List<_Partial> _score(SoundKind kind, bool start) {
  switch (kind) {
    case SoundKind.chime:
      final notes = start
          ? const [659.25, 880.0, 1318.5]
          : const [880.0, 659.25];
      return [
        for (var i = 0; i < notes.length; i++)
          _Partial(notes[i], _leadIn + i * 0.18, 0.2, 1.4, 0.02),
      ];
    case SoundKind.bowl:
      final f = start ? 196.0 : 220.0;
      // Inharmonic partials plus a slight detune give the shimmer of a real
      // bowl, and the doubled fundamental makes the slow "wah-wah" beat.
      return [
        _Partial(f, _leadIn, 0.28, 6, 0.08),
        _Partial(f * 1.004, _leadIn, 0.18, 6, 0.08),
        _Partial(f * 2.76, _leadIn, 0.08, 4, 0.06),
        _Partial(f * 5.4, _leadIn, 0.03, 2.5, 0.05),
      ];
    case SoundKind.windchimes:
      const scale = [1046.5, 1174.7, 1318.5, 1568.0, 1760.0, 2093.0];
      final count = start ? 7 : 4;
      // Seeded so the scattered pattern is the same on every play and test.
      final rng = Random(0x51EED + kind.index * 2 + (start ? 1 : 0));
      final partials = <_Partial>[];
      for (var i = 0; i < count; i++) {
        final f = scale[rng.nextInt(scale.length)];
        final at = _leadIn + i * 0.22 + rng.nextDouble() * 0.15;
        partials.add(_Partial(f, at, 0.09, 2, 0.02));
        partials.add(_Partial(f * 2.01, at, 0.02, 1.2, 0.02));
      }
      return partials;
    case SoundKind.kalimba:
      // Plucked tines: quick attack, gentle decay, a faint high overtone.
      final notes = start
          ? const [587.33, 739.99, 880.0, 1174.66]
          : const [880.0, 739.99, 587.33];
      return [
        for (var i = 0; i < notes.length; i++) ...[
          _Partial(notes[i], _leadIn + i * 0.24, 0.22, 1.6, 0.004),
          _Partial(notes[i] * 2, _leadIn + i * 0.24, 0.05, 0.6, 0.004),
          _Partial(notes[i] * 5.3, _leadIn + i * 0.24, 0.015, 0.12, 0.002),
        ],
      ];
    case SoundKind.marimba:
      final notes = start
          ? const [523.25, 659.25, 784.0, 1046.5]
          : const [784.0, 659.25, 523.25];
      return [
        for (var i = 0; i < notes.length; i++) ...[
          _Partial(notes[i], _leadIn + i * 0.16, 0.25, 0.7, 0.005),
          _Partial(notes[i] * 4, _leadIn + i * 0.16, 0.04, 0.15, 0.003),
        ],
      ];
  }
}

/// Sums every partial into one master mix of [length] samples.
Float64List _render(List<_Partial> partials, int length) {
  final mix = Float64List(length);
  for (final p in partials) {
    final first = (p.at * _sampleRate).ceil();
    final last = min(length, (p.end * _sampleRate).ceil());
    // Straight exponential ramp in value, like exponentialRampToValueAtTime.
    final logFloor = log(_silence / p.peak);
    for (var i = first; i < last; i++) {
      final t = i / _sampleRate - p.at;
      if (t <= 0) continue;
      final gain = t < p.attack
          ? p.peak * t / p.attack
          : p.peak * exp(logFloor * ((t - p.attack) / p.decay));
      mix[i] += gain * sin(2 * pi * p.freq * t);
    }
  }
  return mix;
}

/// Wraps the mix in a 44-byte RIFF/WAVE header and converts to int16.
Uint8List _encode(Float64List mix, double gain) {
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = channels * bitsPerSample ~/ 8;
  const byteRate = _sampleRate * blockAlign;
  final dataLength = mix.length * blockAlign;
  final out = ByteData(44 + dataLength);

  _ascii(out, 0, 'RIFF');
  out.setUint32(4, 36 + dataLength, Endian.little);
  _ascii(out, 8, 'WAVE');
  _ascii(out, 12, 'fmt ');
  out.setUint32(16, 16, Endian.little); // PCM chunk size
  out.setUint16(20, 1, Endian.little); // PCM
  out.setUint16(22, channels, Endian.little);
  out.setUint32(24, _sampleRate, Endian.little);
  out.setUint32(28, byteRate, Endian.little);
  out.setUint16(32, blockAlign, Endian.little);
  out.setUint16(34, bitsPerSample, Endian.little);
  _ascii(out, 36, 'data');
  out.setUint32(40, dataLength, Endian.little);

  for (var i = 0; i < mix.length; i++) {
    final sample = (mix[i] * gain * 32767).round().clamp(-32768, 32767);
    out.setInt16(44 + i * 2, sample, Endian.little);
  }
  return out.buffer.asUint8List();
}

void _ascii(ByteData out, int offset, String text) {
  for (var i = 0; i < text.length; i++) {
    out.setUint8(offset + i, text.codeUnitAt(i));
  }
}
