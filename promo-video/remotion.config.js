import { Config } from "@remotion/cli/config";
import fs from "node:fs";
Config.setVideoImageFormat("png");
Config.setCodec("h264");
Config.setPixelFormat("yuv420p");
Config.setCrf(18);
// In the cloud sandbox a headless Chromium is preinstalled; elsewhere Remotion
// downloads its own.
const preinstalled = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
if (fs.existsSync(preinstalled))
    Config.setBrowserExecutable(preinstalled);
