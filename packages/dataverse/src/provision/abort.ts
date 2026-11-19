/**
 * Cooperative cancellation shared by the planner and the applier. The built-in
 * metadata client also forwards the signal to every request, so an abort
 * interrupts the in-flight fetch as well as the next loop iteration.
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("Provisioning aborted.");
    error.name = "AbortError";
    throw error;
  }
}
