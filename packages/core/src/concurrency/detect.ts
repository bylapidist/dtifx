import { availableParallelism, cpus } from 'node:os';

/**
 * Detects the suggested level of parallelism for the current runtime.
 *
 * The function favours {@link availableParallelism} when supported by the
 * runtime, falling back to {@link cpus} length when necessary. When the
 * environment cannot provide either signal it returns a minimum of 1 to ensure
 * callers never receive a zero or negative concurrency hint.
 *
 * @returns {number} A positive integer indicating the recommended parallelism.
 */
export function detectParallelism(): number {
  const detected = readAvailableParallelism();

  if (detected > 0) {
    return detected;
  }

  const cpuCount = readCpuCount();

  if (cpuCount > 0) {
    return cpuCount;
  }

  return 1;
}

function readAvailableParallelism(): number {
  if (typeof availableParallelism !== 'function') {
    return 0;
  }

  try {
    const value = availableParallelism();

    if (Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  } catch {
    // Ignore detection failures and fall back to cpus().
  }

  return 0;
}

function readCpuCount(): number {
  try {
    const cpuList = cpus();

    if (Array.isArray(cpuList) && cpuList.length > 0) {
      return cpuList.length;
    }
  } catch {
    // Ignore detection failures and fall back to the minimum parallelism.
  }

  return 0;
}
