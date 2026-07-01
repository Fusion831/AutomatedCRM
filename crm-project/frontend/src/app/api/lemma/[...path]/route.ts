import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

function loadConfig() {
  try {
    const configPath = path.join(os.homedir(), ".lemma", "config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const activeServer = config.active_server || "local";
      const serverConfig = config.servers?.[activeServer];
      if (serverConfig) {
        return {
          baseUrl: serverConfig.base_url || "http://127-0-0-1.sslip.io:8711",
          podId: serverConfig.defaults?.pod_id || "019f1423-2ff5-7723-a474-491307d7950e",
          token: serverConfig.token || serverConfig.auth?.access_token || "",
        };
      }
    }
  } catch (err) {
    console.error("Error loading Lemma config:", err);
  }
  return {
    baseUrl: "http://127-0-0-1.sslip.io:8711",
    podId: "019f1423-2ff5-7723-a474-491307d7950e",
    token: "",
  };
}

async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await context.params;
  const subPath = pathSegments.join("/");
  
  const { baseUrl, token } = loadConfig();
  
  // Build the target URL
  const searchParams = request.nextUrl.searchParams.toString();
  const targetUrl = `${baseUrl}/${subPath}${searchParams ? `?${searchParams}` : ""}`;
  
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  headers.set("Content-Type", "application/json");

  // Read request body if present
  let body: any = undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.text();
    } catch (e) {
      // no body
    }
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });

    const responseText = await response.text();
    
    return new NextResponse(responseText, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Proxy error", message: error.message },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
