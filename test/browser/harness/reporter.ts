import { RunSummary, Runner, Suite, TestResult } from "./runner"

const CSS = `
.dvt-root { font: 13px/1.5 monospace; background:#111; color:#ddd; padding:16px; margin:8px; border-radius:8px; }
.dvt-root h1 { font-size:15px; margin:0 0 4px; color:#fff; }
.dvt-meta { color:#888; margin-bottom:10px; white-space:pre-wrap; }
.dvt-controls { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:10px; }
.dvt-controls label { cursor:pointer; user-select:none; }
.dvt-button { background:#2d6cdf; color:#fff; border:0; padding:6px 14px; border-radius:5px; cursor:pointer; font:inherit; }
.dvt-button.secondary { background:#444; }
.dvt-button:disabled { opacity:.5; cursor:default; }
.dvt-status { min-height:18px; color:#ffd479; margin-bottom:8px; white-space:pre-wrap; }
.dvt-suite { margin-bottom:12px; }
.dvt-suite-title { font-weight:bold; color:#fff; margin:6px 0; }
.dvt-test { padding:1px 0 1px 14px; }
.dvt-test.fail { color:#ff7b72; cursor:pointer; }
.dvt-test.skip { color:#d29922; }
.dvt-pass { color:#3fb950; }
.dvt-error { display:none; white-space:pre-wrap; color:#ff7b72; background:#1c1316; padding:6px 8px; margin:4px 0; border-left:3px solid #ff7b72; }
.dvt-summary { margin-top:12px; color:#fff; white-space:pre-wrap; }
`

export class Reporter {
  private root!: HTMLDivElement
  private statusEl!: HTMLDivElement
  private resultsEl!: HTMLDivElement
  private summaryEl!: HTMLDivElement
  private runButton!: HTMLButtonElement
  private checkboxes = new Map<string, HTMLInputElement>()
  private lastSummary: RunSummary | null = null

  constructor(
    private readonly runner: Runner,
    private readonly suites: Suite[],
    private readonly ctxMeta: { orgUrl: string; dataStem: string; sweep: () => Promise<number> },
  ) {}

  mount(parent: HTMLElement): void {
    const style = document.createElement("style")
    style.textContent = CSS
    document.head.append(style)

    this.root = document.createElement("div")
    this.root.className = "dvt-root"

    const title = document.createElement("h1")
    title.textContent = "dataverse-schema browser tests"
    this.root.append(title)

    this.statusEl = document.createElement("div")
    this.statusEl.className = "dvt-status"
    this.summaryEl = document.createElement("div")
    this.summaryEl.className = "dvt-summary"
    this.resultsEl = document.createElement("div")

    const controls = document.createElement("div")
    controls.className = "dvt-controls"

    this.runButton = document.createElement("button")
    this.runButton.className = "dvt-button"
    this.runButton.textContent = "Run selected"
    this.runButton.onclick = () => void this.runSelected()
    controls.append(this.runButton)

    const all = document.createElement("button")
    all.className = "dvt-button secondary"
    all.textContent = "All / none"
    all.onclick = () => {
      const anyOn = [...this.checkboxes.values()].some((c) => c.checked)
      for (const c of this.checkboxes.values()) c.checked = !anyOn
    }
    controls.append(all)

    const sweep = document.createElement("button")
    sweep.className = "dvt-button secondary"
    sweep.textContent = "Sweep orphaned test data"
    sweep.onclick = () => void this.sweep()
    controls.append(sweep)

    for (const suite of this.suites) {
      const label = document.createElement("label")
      const box = document.createElement("input")
      box.type = "checkbox"
      box.checked = true
      this.checkboxes.set(suite.name, box)
      label.append(box, ` ${suite.title} `)
      controls.append(label)
    }

    const meta = document.createElement("div")
    meta.className = "dvt-meta"
    meta.textContent = `build ${__BUILD_STAMP__}\norg ${this.ctxMeta.orgUrl}\ndata stem ${this.ctxMeta.dataStem} (auto-swept before each run)`

    const copyJson = document.createElement("button")
    copyJson.className = "dvt-button secondary"
    copyJson.textContent = "Copy JSON results"
    copyJson.onclick = () => void this.copy(this.exportJson())
    const copyMd = document.createElement("button")
    copyMd.className = "dvt-button secondary"
    copyMd.textContent = "Copy Markdown results"
    copyMd.onclick = () => void this.copy(this.exportMarkdown())

    controls.append(copyJson, copyMd)

    this.root.append(meta, controls, this.statusEl, this.resultsEl, this.summaryEl)
    parent.append(this.root)

    window.addEventListener("error", (e) => this.log(`window error: ${e.error ?? e.message}`))
    window.addEventListener("unhandledrejection", (e) => this.log(`unhandled rejection: ${String((e as PromiseRejectionEvent).reason)}`))
  }

  async runSelected(): Promise<void> {
    const selected = this.suites.filter((s) => this.checkboxes.get(s.name)?.checked)
    if (selected.length === 0) return
    this.runButton.disabled = true
    this.resultsEl.replaceChildren()
    this.summaryEl.textContent = ""

    this.log("sweeping stale dvt* records from earlier runs…")
    const swept = await this.ctxMeta.sweep()
    if (swept > 0) this.log(`swept ${swept} stale record(s)`)

    await this.runner.run(selected, {
      onSuiteStart: (suite) => {
        this.log(`running suite "${suite.title}"…`)
      },
      onTestStart: (_suite, test) => {
        this.log(`▶ ${test.name}`)
      },
      onTestEnd: (result) => {
        this.renderResult(result)
        this.log("")
      },
      onFinish: (summary) => {
        this.lastSummary = summary
        this.renderSummary(summary)
        this.log(`done — cleaned up ${summary.cleanedUp}/${summary.results.length + summary.cleanedUp} tracked records`)
      },
    })
    this.runButton.disabled = false
  }

  private renderResult(result: TestResult): void {
    let suiteBlock = this.resultsEl.querySelector<HTMLElement>(`[data-suite="${result.suite}"]`)
    if (!suiteBlock) {
      suiteBlock = document.createElement("div")
      suiteBlock.className = "dvt-suite"
      suiteBlock.dataset.suite = result.suite
      const heading = document.createElement("div")
      heading.className = "dvt-suite-title"
      heading.textContent = result.suiteTitle
      suiteBlock.append(heading)
      this.resultsEl.append(suiteBlock)
    }

    const row = document.createElement("div")
    row.className = `dvt-test ${result.status}`
    const glyph = result.status === "pass" ? "✓" : result.status === "skip" ? "–" : "✗"
    row.innerHTML = `<span class="dvt-${result.status === "pass" ? "pass" : result.status}">${glyph}</span> ` +
      `${escapeHtml(result.name)} <span style="color:#666">(${result.durationMs.toFixed(0)}ms)</span>`
    if (result.status !== "pass" && result.error) {
      const details = document.createElement("div")
      details.className = "dvt-error"
      details.textContent = result.error
      row.title = result.status === "skip" ? result.error : "click to toggle error"
      if (result.status === "fail") {
        row.onclick = () => {
          details.style.display = details.style.display === "block" ? "none" : "block"
        }
      } else {
        details.style.display = "block"
      }
      row.append(details)
    }
    suiteBlock.append(row)
  }

  private renderSummary(summary: RunSummary): void {
    const total = summary.passed + summary.failed + summary.skipped
    this.summaryEl.textContent =
      `complete: ${summary.passed}/${total} passed` +
      (summary.failed ? `, ${summary.failed} FAILED` : "") +
      (summary.skipped ? `, ${summary.skipped} skipped` : "") +
      `\ntracked records deleted after run: ${summary.cleanedUp}`
  }

  private log(message: string): void {
    this.statusEl.textContent = message
  }

  private exportJson(): string {
    const s = this.lastSummary
    return JSON.stringify(
      {
        build: __BUILD_STAMP__,
        org: this.ctxMeta.orgUrl,
        startedAt: s?.startedAt,
        finishedAt: s?.finishedAt,
        passed: s?.passed ?? 0,
        failed: s?.failed ?? 0,
        skipped: s?.skipped ?? 0,
        results: s?.results.map(({ suite, name, status, durationMs, error }) => ({ suite, name, status, durationMs: Math.round(durationMs), error })),
      },
      null,
      2,
    )
  }

  private exportMarkdown(): string {
    const s = this.lastSummary
    if (!s) return ""
    const lines = [
      "# Browser test results",
      "",
      `Build: \`${__BUILD_STAMP__}\``,
      `Org: ${this.ctxMeta.orgUrl}`,
      `Run window: ${s.startedAt} → ${s.finishedAt}`,
      "",
    ]
    let currentSuite = ""
    for (const r of s.results) {
      if (r.suiteTitle !== currentSuite) {
        currentSuite = r.suiteTitle
        lines.push(`## ${currentSuite}`, "")
      }
      const glyph = r.status === "pass" ? "✅" : r.status === "skip" ? "⏭️" : "❌"
      lines.push(`- ${glyph} **${r.name}** (${Math.round(r.durationMs)}ms)`)
      if (r.error) {
        const body = r.error.split("\n").map((l) => `  > ${l}`).join("\n")
        lines.push(body)
      }
    }
    lines.push("", `**${s.passed} passed, ${s.failed} failed, ${s.skipped} skipped**`)
    return lines.join("\n")
  }

  private async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      this.log("copied to clipboard")
    } catch {
      const area = document.createElement("textarea")
      area.value = text
      document.body.append(area)
      area.select()
      document.execCommand("copy")
      area.remove()
      this.log("copied to clipboard (fallback)")
    }
  }

  private async sweep(): Promise<void> {
    this.log("sweeping orphaned dvt* records…")
    const n = await this.ctxMeta.sweep()
    this.log(n >= 0 ? `swept ${n} orphaned record(s)` : "sweep query failed")
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
