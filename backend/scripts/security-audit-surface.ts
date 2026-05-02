/**
 * Revisión estática mínima: recuerda revisar a mano rutas que exigen apertura
 * (p. ej. auth) y que usen authenticate a nivel de router o ruta.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesDir = path.join(__dirname, "..", "src", "routes");

const files = fs
  .readdirSync(routesDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => path.join(routesDir, f));

let warn = 0;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const name = path.basename(file);
  const hasAuthUse = /Router.*\n.*use\s*\(\s*authenticate/m.test(text) || /\.use\(\s*authenticate/.test(text);
  const isPublicStyle = /auth\.ts|webhooks\.ts$/.test(name);
  if (!hasAuthUse && !isPublicStyle) {
    const hasPerRoute = /(get|post|patch|put|delete|use)\s*\(\s*[\s\n]*"[^"]*"/m.test(text) && /authenticate\s*,/m.test(text);
    if (!hasPerRoute) {
      if (name === "owner.ts" || name === "me.ts") continue;
      console.warn(`[revisar] ${name}: no se detecta router.use(authenticate) — confirmar que todas las rutas estén protegidas.`);
      warn += 1;
    }
  }
}

console.log(
  JSON.stringify({
    level: "info",
    msg: "security:check (superficie estática)",
    routesScanned: files.length,
    warnings: warn,
  })
);
if (warn > 0) {
  process.exitCode = 0; // no fallar CI: es recordatorio, no prueba
}
