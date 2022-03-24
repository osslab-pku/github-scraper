import path from "path";
import { fileURLToPath } from "url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

build({
    bundle: true,
    sourcemap: true,
    format: "esm",
    target: "esnext",
    entryPoints: [path.join(__dirname, "src", "index.js")],
    outdir: path.join(__dirname, "dist"),
    outExtension: { ".js": ".mjs" },
}).catch(e => {
  console.error(e);
  process.exitCode = 1;
})