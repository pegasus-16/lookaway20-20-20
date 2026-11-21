#!/usr/bin/env node
/**
 * Installs the debug APK on a connected Android phone.
 *
 * Debug APKs are signed with the machine's debug key. Installing over an app
 * signed with a different key (another computer, a store build, or a release
 * build) always fails with INSTALL_FAILED_UPDATE_INCOMPATIBLE, and some phones
 * fail the first attempt while the package manager is still settling. This
 * script retries, falls back to a non-streamed install, and only uninstalls
 * (which erases Lookaway's local data) when the signature really differs.
 *
 * Usage:
 *   node scripts/install-android.mjs
 *   node scripts/install-android.mjs --launch
 *   node scripts/install-android.mjs --serial 64609045 --launch
 *   node scripts/install-android.mjs --uninstall      # allow data loss up front
 *   node scripts/install-android.mjs --apk path/to.apk
 *
 * Exit codes: 0 installed, 1 could not install, 2 no usable device.
 */

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const PACKAGE = "com.parth.lookaway";
const DEFAULT_APK = resolve("android/app/build/outputs/apk/debug/app-debug.apk");
const ACTIVITY = `${PACKAGE}/.MainActivity`;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};

const apk = resolve(value("--apk", DEFAULT_APK));
const serial = value("--serial", process.env.ANDROID_SERIAL || null);
const launch = flag("--launch");
const allowUninstall = flag("--uninstall");

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 180_000,
    ...options,
  });
}

function adb(commandArgs, options = {}) {
  return run("adb", serial ? ["-s", serial, ...commandArgs] : commandArgs, options);
}

function fail(message, code = 1) {
  console.error(`\n${message}\n`);
  process.exit(code);
}

function listDevices() {
  const raw = run("adb", ["devices"]);
  return raw
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, state] = line.split(/\s+/);
      return { id, state };
    });
}

function checkDevice() {
  if (serial) {
    const devices = listDevices();
    const found = devices.find((d) => d.id === serial);
    if (!found) fail(`Device ${serial} is not connected. Run: adb devices`, 2);
    if (found.state !== "device")
      fail(
        `Device ${serial} is "${found.state}". Unlock the phone and accept the USB debugging prompt, then retry.`,
        2,
      );
    return;
  }
  const devices = listDevices();
  const ready = devices.filter((d) => d.state === "device");
  if (ready.length === 0) {
    const unauthorized = devices.find((d) => d.state === "unauthorized");
    fail(
      unauthorized
        ? 'The phone is connected but not authorized. Unlock it and tap Allow on the USB debugging prompt (tick "Always allow"), then retry.'
        : "No Android phone found. Connect it with USB, enable Developer options → USB debugging, unlock it, and run: adb devices",
      2,
    );
  }
  if (ready.length > 1) {
    console.log(
      `Several devices are connected (${ready.map((d) => d.id).join(", ")}); using ${ready[0].id}.\n` +
        "Pass --serial <id> to pick another one.",
    );
  }
}

function installCommand(extra = []) {
  return adb(["install", "-r", "-g", ...extra, apk]);
}

function looksLikeSignatureMismatch(output) {
  return /INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match|INSTALL_FAILED_SHARED_USER_INCOMPATIBLE|INSTALL_FAILED_DUPLICATE_PERMISSION/i.test(
    output,
  );
}

function looksLikeVersionDowngrade(output) {
  return /INSTALL_FAILED_VERSION_DOWNGRADE|downgrade/i.test(output);
}

function describeFailure(output) {
  if (/INSTALL_FAILED_INSUFFICIENT_STORAGE/i.test(output))
    return "The phone is out of storage. Free some space and retry.";
  if (
    /INSTALL_FAILED_USER_RESTRICTED|INSTALL_FAILED_VERIFICATION_FAILURE|not allowed/i.test(output)
  )
    return 'The phone blocked the install. Allow "Install unknown apps" for the file manager / ADB, and tap "Install anyway" if Play Protect asks.';
  if (/INSTALL_FAILED_ABORTED|user rejected/i.test(output))
    return "The install was cancelled on the phone. Unlock it and confirm the install prompt.";
  if (/device offline|device unauthorized/i.test(output))
    return "The phone went offline. Reconnect USB, unlock it, and accept the debugging prompt.";
  return null;
}

function installOnce(extra = []) {
  try {
    const output = installCommand(extra);
    return { ok: true, output };
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}\n${error.message ?? ""}`;
    return { ok: false, output };
  }
}

function uninstall() {
  console.log(`\nRemoving ${PACKAGE} (this erases the app's local settings and stats)…`);
  try {
    const output = adb(["uninstall", PACKAGE]);
    console.log(output.trim());
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`.trim();
    // A missing package is fine: there is nothing to remove.
    if (!/DELETE_FAILED_INTERNAL_ERROR|not installed|Unknown package/i.test(output))
      fail(`Could not uninstall ${PACKAGE}:\n${output}`);
  }
}

function main() {
  if (!existsSync(apk)) fail(`APK not found: ${apk}\nBuild it first with: npm run android:debug`);
  const size = statSync(apk).size;
  console.log(`APK: ${apk} (${(size / 1024 / 1024).toFixed(1)} MB)`);

  checkDevice();

  // A running foreground service makes some OEM package managers refuse an
  // update. Stopping the app first makes the first attempt much more reliable.
  try {
    adb(["shell", "am", "force-stop", PACKAGE]);
  } catch {
    // Not installed yet.
  }

  if (allowUninstall) uninstall();

  let result = installOnce();
  if (!result.ok && !allowUninstall) {
    console.log("\nFirst install attempt failed; retrying once…");
    result = installOnce();
  }

  if (!result.ok && looksLikeVersionDowngrade(result.output)) {
    console.log("\nInstalled app has a newer version code; allowing downgrade…");
    result = installOnce(["-d"]);
  }

  if (!result.ok && !allowUninstall && looksLikeSignatureMismatch(result.output)) {
    console.log(
      "\nThe installed Lookaway was signed with a different key (another computer, a store build, or a release build).",
    );
    console.log(
      "An update cannot replace it. Uninstalling first is the only fix on a debug build; local settings and stats will be erased.",
    );
    uninstall();
    result = installOnce();
  }

  if (!result.ok) {
    console.log("\nTrying a non-streamed install (some phones reject streamed installs)…");
    result = installOnce(["--no-streaming"]);
  }

  if (!result.ok) {
    const hint = describeFailure(result.output);
    fail(
      `Install failed:\n${result.output.trim()}\n` +
        (hint ? `\n${hint}\n` : "") +
        `\nIf this is a different phone, uninstall the old Lookaway first:\n  adb uninstall ${PACKAGE}\nthen run this script again.`,
    );
  }

  // Verify that the package manager really has the new APK.
  try {
    const path = adb(["shell", "pm", "path", PACKAGE]).trim();
    if (!path.includes("package:"))
      fail(`The install command succeeded but ${PACKAGE} is not registered.`);
    const version = adb(["shell", "dumpsys", "package", PACKAGE])
      .split(/\r?\n/)
      .find((line) => line.includes("versionName="));
    console.log(`\nInstalled ${PACKAGE}${version ? ` · ${version.trim()}` : ""}.`);
    console.log(path);
  } catch {
    console.log(`\nInstalled ${PACKAGE}.`);
  }

  if (launch) {
    console.log("Launching…");
    adb(["shell", "am", "start", "-n", ACTIVITY]);
  }

  console.log(
    "\nOn the phone, allow notifications when asked. If the app is installed from a file manager and the first tap does nothing, open the same APK again and confirm the system prompt.",
  );
}

main();
