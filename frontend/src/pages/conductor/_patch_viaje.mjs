import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.join(__dirname, "ConductorHome.tsx");
const fnPath = path.join(__dirname, "_viaje_panel_fn.txt");
let main = fs.readFileSync(mainPath, "utf8");
const fn = fs.readFileSync(fnPath, "utf8").replace(/\r?\n/g, "\r\n");
const needle =
  "  }\r\n\r\n  return (\r\n    <PortalShell title=\"Panel Chofer\" basePath=\"/driver/viaje-activo\">";
if (!main.includes(needle)) {
  console.error("needle missing for insert");
  process.exit(1);
}
main = main.replace(
  needle,
  "  }\r\n\r\n" + fn + "\r\n  return (\r\n    <PortalShell title=\"Panel Chofer\" basePath=\"/driver/viaje-activo\">"
);
const removeStart = `        {active && currentView === "viajes" ? (\r\n          <section\r\n            id={VIAJES_ANCHORS.viaje}\r\n            className="scroll-mt-4 rounded-2xl border-2 border-green-300 bg-white p-4 shadow-sm md:scroll-mt-6"\r\n          >\r\n            <DriverTripSwipeBar`;
const removeEnd = `        ) : null}\r\n\r\n        {currentView === "historial" ? (`;
const i0 = main.indexOf(removeStart);
const i1 = main.indexOf(removeEnd);
if (i0 === -1 || i1 === -1 || i1 <= i0) {
  console.error("remove block markers missing", i0, i1);
  process.exit(1);
}
main =
  main.slice(0, i0) + `        {currentView === "historial" ? (` + main.slice(i1 + removeEnd.length);
fs.writeFileSync(mainPath, main);
console.log("patched");
