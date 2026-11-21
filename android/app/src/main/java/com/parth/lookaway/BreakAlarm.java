package com.parth.lookaway;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.os.SystemClock;
import android.util.Log;

/**
 * Repeats a clock-like alarm tone until the user starts, skips or snoozes the
 * break (or the break ends). Notification channels can only play one short
 * system sound, which is why the reminder used to be a single beep. This
 * player lives in the timer's foreground service, so it keeps ringing while
 * the app is in the background.
 *
 * The tone is synthesised here, so the app carries no audio files. It uses
 * {@link AudioAttributes#USAGE_ALARM}: the alarm volume slider, silent mode and
 * Do Not Disturb rules still apply, just like the Clock app. It stops itself
 * after {@link #MAX_RING_MS} as a safety net; the notification stays visible.
 */
final class BreakAlarm {
    private static final String TAG = "BreakAlarm";
    private static final long MAX_RING_MS = 60_000L;
    private static final int SAMPLE_RATE = 44_100;
    private static final short[] PATTERN = buildPattern();

    private static volatile boolean ringing;
    private static Thread thread;
    private static AudioTrack track;
    /** Invalidates the writer of a just-stopped ring so a new one can start. */
    private static int generation;

    private BreakAlarm() {}

    static void start() {
        synchronized (BreakAlarm.class) {
            if (ringing) return;
            ringing = true;
            int gen = ++generation;
            thread = new Thread(() -> play(gen), "BreakAlarm");
            thread.start();
        }
    }

    static void stop() {
        AudioTrack current;
        synchronized (BreakAlarm.class) {
            if (!ringing && thread == null) return;
            ringing = false;
            generation++;
            current = track;
            track = null;
            thread = null;
        }
        if (current != null) {
            try {
                // Unblock the writer thread promptly instead of waiting for
                // the next buffer.
                current.pause();
                current.flush();
            } catch (RuntimeException ignored) {
                // The track may already be stopped.
            }
        }
        Log.d(TAG, "Break alarm stopped");
    }

    private static void play(int gen) {
        AudioFormat format = new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build();
        AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        AudioTrack player = null;
        try {
            int minBuffer = AudioTrack.getMinBufferSize(
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT);
            int bufferSize = Math.max(minBuffer, SAMPLE_RATE / 2 * 2);
            player = new AudioTrack.Builder()
                    .setAudioAttributes(attributes)
                    .setAudioFormat(format)
                    .setBufferSizeInBytes(bufferSize)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build();
            synchronized (BreakAlarm.class) {
                if (!ringing || gen != generation) {
                    player.release();
                    return;
                }
                track = player;
            }
            player.play();
            Log.d(TAG, "Break alarm started");

            long startedAt = SystemClock.elapsedRealtime();
            while (ringing
                    && gen == generation
                    && SystemClock.elapsedRealtime() - startedAt < MAX_RING_MS) {
                int written = player.write(PATTERN, 0, PATTERN.length, AudioTrack.WRITE_BLOCKING);
                if (written < 0) break;
            }
        } catch (RuntimeException error) {
            Log.w(TAG, "Break alarm unavailable", error);
        } finally {
            synchronized (BreakAlarm.class) {
                if (gen == generation) {
                    if (track == player) track = null;
                    ringing = false;
                }
            }
            if (player != null) {
                try {
                    player.stop();
                } catch (RuntimeException ignored) {
                    // Never started or already stopped.
                }
                try {
                    player.release();
                } catch (RuntimeException ignored) {
                    // Already released.
                }
            }
        }
    }

    /**
     * Two soft descending notes followed by a pause: about 2.7 seconds per
     * loop. The fade avoids clicks at the start and end of each note.
     */
    private static short[] buildPattern() {
        int noteSamples = SAMPLE_RATE * 480 / 1000;
        int noteGap = SAMPLE_RATE * 260 / 1000;
        int loopGap = SAMPLE_RATE * 1_100 / 1000;
        double[] notes = { 880.0, 659.25 };
        short[] samples = new short[notes.length * (noteSamples + noteGap) + loopGap];
        int at = 0;
        for (double frequency : notes) {
            for (int i = 0; i < noteSamples; i++) {
                double seconds = (double) i / SAMPLE_RATE;
                double attack = Math.min(1.0, i / (SAMPLE_RATE * 0.012));
                double decay = Math.exp(-4.2 * seconds);
                double wave = Math.sin(2 * Math.PI * frequency * seconds)
                        + 0.22 * Math.sin(4 * Math.PI * frequency * seconds);
                samples[at++] = (short) (wave * attack * decay * 0.42 * Short.MAX_VALUE);
            }
            at += noteGap;
        }
        return samples;
    }
}
