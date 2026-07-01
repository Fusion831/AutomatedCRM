import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export async function GET() {
  try {
    const configPath = path.join(os.homedir(), ".lemma", "config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const activeServer = config.active_server || "local";
      const serverConfig = config.servers?.[activeServer];
      if (serverConfig) {
        return NextResponse.json({
          podId: serverConfig.defaults?.pod_id || "019f1423-2ff5-7723-a474-491307d7950e"
        });
      }
    }
  } catch (err) {
    console.error("Error loading Lemma config:", err);
  }
  return NextResponse.json({
    podId: "019f1423-2ff5-7723-a474-491307d7950e"
  });
}
