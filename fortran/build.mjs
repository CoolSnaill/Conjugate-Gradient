import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("./cg.f", import.meta.url));
const output = fileURLToPath(new URL("../dist/solver-binary.js", import.meta.url));
const includePath = resolve(process.env.F2C_INCLUDE ?? "/usr/include");
const temporary = mkdtempSync(join(tmpdir(), "cg-fortran-"));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: temporary, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} завершился с кодом ${result.status}`);
}

try {
  copyFileSync(source, join(temporary, "cg.f"));
  run(process.env.F2C ?? "f2c", ["-a", "cg.f"]);
  run(process.env.WASM_CLANG ?? "clang", [
    "--target=wasm32", "-std=c11", "-Os", "-fno-math-errno", "-mbulk-memory",
    "-nostdlib", "-I", includePath, "cg.c", "-o", "cg.wasm",
    "-Wl,--no-entry", "-Wl,--export=cgsolve_", "-Wl,--export=__heap_base",
    "-Wl,--export-memory",
  ]);
  const wasm = readFileSync(join(temporary, "cg.wasm"));
  const module = new WebAssembly.Module(wasm);
  if (WebAssembly.Module.imports(module).length) {
    throw new Error("Модуль WebAssembly должен работать без внешних импортов");
  }
  writeFileSync(output, `// Generated from fortran/cg.f by fortran/build.mjs.\nglobalThis.cgWasmBase64 = "${wasm.toString("base64")}";\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
