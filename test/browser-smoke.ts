import { DataverseClient, WhoAmI } from "../src"

const output = document.createElement("pre")
output.style.cssText = "white-space:pre-wrap;font:14px monospace;padding:12px;background:#111;color:#eee;"

function write(label: string, value?: unknown) {
  const detail = value === undefined
    ? ""
    : ` ${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`
  output.textContent += `[${new Date().toISOString()}] ${label}${detail}\n`
}

function reportError(label: string, error: unknown) {
  write(label, error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : error)
}

async function run() {
  document.body.append(output)
  write("browser smoke test started")
  write("location", location.href)

  try {
    const client = new DataverseClient()
    write("client created")
    const result = await WhoAmI(client)
    write("WhoAmI succeeded", result)
  } catch (error) {
    reportError("smoke test failed", error)
  }
}

window.addEventListener("error", event => reportError("window error", event.error ?? event.message))
window.addEventListener("unhandledrejection", event => reportError("unhandled rejection", event.reason))

if (document.body) {
  void run()
} else {
  window.addEventListener("DOMContentLoaded", () => void run(), { once: true })
}
