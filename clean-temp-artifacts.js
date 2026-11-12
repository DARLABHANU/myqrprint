import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function cleanDir(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name.includes("-")) {
        const fullPath = path.join(dir, entry.name);
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log("[Cleaned via fs.rm]", fullPath);
        } catch {
          try {
            execSync(`C:\\Windows\\System32\\cmd.exe /c "rd /s /q \\"${fullPath}\\""`, { stdio: "ignore" });
            console.log("[Cleaned via rd /s /q]", fullPath);
          } catch (cmdErr) {
            console.warn("[Could not remove]", fullPath);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Error reading dir]", dir, err.message);
  }
}

cleanDir(path.resolve("node_modules"));
cleanDir(path.resolve("node_modules/@printly"));
console.log("Cleanup check completed.");
