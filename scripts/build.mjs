import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "fs";
import { join } from "path";

const wasmDir = "wasm";
const ortDist = join("node_modules", "onnxruntime-web", "dist");

mkdirSync(wasmDir, { recursive: true });

const wasmFiles = [
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
];

for (const file of wasmFiles) {
  cpSync(join(ortDist, file), join(wasmDir, file));
  console.log(`Copied ${file} → wasm/`);
}

await esbuild.build({
  entryPoints: ["scripts/offscreen-src.js"],
  bundle: true,
  outfile: "offscreen.js",
  format: "iife",
  platform: "browser",
  target: ["chrome114"],
  logLevel: "info",
});

console.log("Built offscreen.js");
