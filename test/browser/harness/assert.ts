export class SkipError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = "SkipError"
  }
}

export function skip(reason: string): never {
  throw new SkipError(reason)
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

export function assertEquals<T>(actual: T, expected: T, label = "value"): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    throw new Error(`Assertion failed: ${label}\n  expected: ${e}\n  actual:   ${a}`)
  }
}

export function assertInstanceOf(value: unknown, ctor: Function, label = "value"): void {
  if (!(value instanceof ctor)) {
    throw new Error(`Assertion failed: ${label} expected instance of ${ctor.name}, got ${String(value)}`)
  }
}

export async function assertRejects(fn: () => Promise<unknown>, fragment?: string): Promise<unknown> {
  let threw: unknown
  let didThrow = false
  try {
    await fn()
  } catch (e) {
    didThrow = true
    threw = e
  }
  if (!didThrow) throw new Error(`Assertion failed: expected promise to reject${fragment ? ` with "${fragment}"` : ""}`)
  if (fragment) {
    const message = threw instanceof Error ? threw.message : String(threw)
    if (!message.includes(fragment)) {
      throw new Error(`Assertion failed: expected rejection containing "${fragment}", got "${message}"`)
    }
  }
  return threw
}
