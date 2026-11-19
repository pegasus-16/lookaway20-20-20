# Capacitor Dependency Verification

## Package versions

`package.json` declares exact versions:

| Package | Manifest section | Declared | Installed |
|---|---|---:|---:|
| `@capacitor/core` | `dependencies` | `8.6.2` | `8.6.2` |
| `@capacitor/android` | `dependencies` | `8.6.2` | `8.6.2` |
| `@capacitor/cli` | `devDependencies` | `8.6.2` | `8.6.2` |

`bun.lock` contains the same exact workspace declarations and resolved package entries. The Android package declares `@capacitor/core: ^8.6.0`, which is compatible with core `8.6.2`.

## `package-lock.json`

- SHA-256: `d1e63c23677c7ef1505663b43fc79f30e0d9cfb72f3ee95f2254cbcb2faa44d8`
- Git reports it as untracked; it is not in the index.
- This hash matches the checksum recorded immediately before the Bun Capacitor installation, verifying the file's bytes were unchanged by that installation.
- The initial Phase 1 status also showed the file as untracked, but no checksum was recorded at that earlier point. Therefore, status continuity is confirmed, but byte-for-byte comparison to the initial Phase 1 state cannot be proven from Git history.
- No package-lock diff is reported because Git does not track the file.

## Git state

Current branch: `native-android`

Git status immediately before this report update:

```text
## native-android
 M .gitignore
 M bun.lock
 M package.json
?? CAPACITOR-VERIFICATION.md
?? COPILOT-REPORT.txt
?? PHASE1-COMPLETE.md
?? package-lock.json
?? vite.native.config.ts
```

No application source files or dependencies were changed during this verification. The Capacitor dependencies and their manifest/lockfile entries had already been installed before verification.

Compatibility was verified: `@capacitor/android@8.6.2` accepts core `^8.6.0`; `@capacitor/cli@8.6.2` requires Node `>=22.0.0`, satisfied by Node `24.22.2`. Bun `1.4.4` performed the earlier installation.

Tracked diff versus `origin/main`:

```text
 .gitignore   |   2 +
 bun.lock     | 191 ++++++++++++++++++++++++++++++++++++++++++++++++++++++-----
 package.json |   4 ++
 3 files changed, 183 insertions(+), 14 deletions(-)
```

The Bun lockfile changes correspond to the newly declared Capacitor dependencies and their resolved dependency graph. `vite.config.ts` is not changed. The untracked report/config files and package lock do not appear in the tracked diff summary.
