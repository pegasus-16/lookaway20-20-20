/// The reminder sounds Lookaway can synthesise. Kept free of Flutter imports so
/// the synthesiser and the pure rules can be tested with `dart test`.
enum SoundKind { chime, bowl, windchimes, kalimba, marimba }

extension SoundKindInfo on SoundKind {
  String get label => switch (this) {
    SoundKind.chime => 'Chime',
    SoundKind.bowl => 'Singing bowl',
    SoundKind.windchimes => 'Wind chimes',
    SoundKind.kalimba => 'Kalimba',
    SoundKind.marimba => 'Marimba',
  };

  String get hint => switch (this) {
    SoundKind.chime => 'Bright, gentle three-note chime',
    SoundKind.bowl => 'Warm, long-ringing tone',
    SoundKind.windchimes => 'Soft, scattered bells',
    SoundKind.kalimba => 'Soft plucked thumb-piano notes',
    SoundKind.marimba => 'Round, wooden notes',
  };
}

SoundKind soundKindFromId(String? id) {
  for (final kind in SoundKind.values) {
    if (kind.name == id) return kind;
  }
  return SoundKind.chime;
}

/// The order shown in the sound picker.
const List<SoundKind> soundKinds = SoundKind.values;
