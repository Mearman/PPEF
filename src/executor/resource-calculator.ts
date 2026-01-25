/**
 * Resource Calculator
 *
 * Automatically calculates optimal resource limits for parallel execution
 * using the "75% rule" - reserves 75% of available resources for workers,
 * leaving 25% for system stability and other processes.
 *
 * Features:
 * - CPU-based worker count (75% of available cores)
 * - Memory per worker calculation (total memory / worker count)
 * - Dynamic disk I/O ceiling measurement (detects throughput plateau)
 * - Caching to avoid repeated measurements
 *
 * Disk I/O Measurement Algorithm:
 * 1. Test concurrent write+read operations at increasing levels (1, 6, 11, 16, ...)
 * 2. Measure throughput (MB/s) for each concurrency level
 * 3. Detect when throughput plateaus (<5% improvement)
 * 4. Return 75% of the detected ceiling
 * 5. Cache result to avoid re-measuring
 */

import { cpus, totalmem } from "node:os";
import { mkdtemp, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Resource limits for parallel execution.
 */
export interface ResourceLimits {
	/** Maximum number of worker threads to spawn */
	maxWorkers: number;
	/** Maximum memory per worker in MB */
	maxMemoryMb: number;
	/** Maximum concurrent I/O operations */
	maxConcurrentIo: number;
}

/**
 * Measure disk I/O ceiling by testing throughput at increasing concurrency levels.
 * Returns the concurrency level where throughput stops improving (the ceiling).
 *
 * @param sampleSizeMb - Size of test data in MB (default: 10)
 * @param maxConcurrency - Maximum concurrency to test (default: 100)
 * @param timeoutMs - Timeout per test in milliseconds (default: 5000)
 * @returns The detected concurrency ceiling
 */
async function measureDiskIoCeiling(
	sampleSizeMb = 10,
	maxConcurrency = 100,
	timeoutMs = 5000,
): Promise<number> {
	const testData = Buffer.alloc(sampleSizeMb * 1024 * 1024, "x");

	// Test at increasing concurrency levels
	let lastThroughput = 0;
	let ceiling = 10; // Default fallback

	for (let concurrency = 1; concurrency <= maxConcurrency; concurrency += 5) {
		const tempDir = await mkdtemp(join(tmpdir(), "io-test-"));
		const startTime = performance.now();

		try {
			// Run concurrent write+read operations
			const operations = Array.from({ length: concurrency }, async () => {
				const filePath = join(tempDir, `test-${Math.random().toString(36).slice(2)}.dat`);
				await writeFile(filePath, testData);
				await readFile(filePath);
				return filePath;
			});

			await Promise.race([
				Promise.all(operations),
				new Promise<never>((_resolve, reject) =>
					setTimeout(() => {
						reject(new Error("timeout"));
					}, timeoutMs),
				),
			]);

			const elapsedMs = performance.now() - startTime;
			const throughput = (concurrency * sampleSizeMb) / (elapsedMs / 1000);

			// Check if we've hit the ceiling (throughput not improving)
			if (throughput > lastThroughput * 1.05) {
				// Still improving
				lastThroughput = throughput;
				ceiling = concurrency;
			} else {
				// Throughput plateaued - we found the ceiling
				break;
			}
		} catch {
			// Timeout or error - previous level was the ceiling
			break;
		} finally {
			// Cleanup
			try {
				const { readdir } = await import("node:fs/promises");
				const files = await readdir(tempDir);
				await Promise.all(files.map((f) => unlink(join(tempDir, f))));
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	return ceiling;
}

/** Cached disk I/O ceiling measurement */
let cachedCeiling: number | null = null;

/**
 * Calculate resource limits using the 75% rule.
 *
 * @param reservePercent - Percentage of resources to reserve (default: 0.75 for 75%)
 * @param options - Options for resource calculation
 * @returns Resource limits for parallel execution
 */
export async function calculateResources(
	reservePercent = 0.75,
	options: { measureDisk?: boolean } = {},
): Promise<ResourceLimits> {
	const cpuCount = cpus().length;
	const totalMemory = totalmem();

	// Clamp reservePercent to [0, 1] range
	const clampedReserve = Math.max(0, Math.min(1, reservePercent));

	const maxWorkers = Math.floor(cpuCount * clampedReserve);

	// Avoid division by zero when maxWorkers is 0
	const maxMemoryMb =
		maxWorkers > 0 ? Math.floor((totalMemory * clampedReserve) / maxWorkers / (1024 * 1024)) : 0;

	// Measure disk I/O ceiling once, then cache
	let maxConcurrentIo = Math.floor(100 * clampedReserve);
	if (options.measureDisk !== false && maxWorkers > 0) {
		cachedCeiling ??= await measureDiskIoCeiling();
		maxConcurrentIo = Math.floor(cachedCeiling * clampedReserve);
	}

	return { maxWorkers, maxMemoryMb, maxConcurrentIo };
}

/**
 * Synchronous version that skips disk measurement (for quick startup).
 *
 * @param reservePercent - Percentage of resources to reserve (default: 0.75 for 75%)
 * @returns Resource limits for parallel execution (with estimated I/O)
 */
export function calculateResourcesSync(reservePercent = 0.75): ResourceLimits {
	const cpuCount = cpus().length;
	const totalMemory = totalmem();

	// Clamp reservePercent to [0, 1] range
	const clampedReserve = Math.max(0, Math.min(1, reservePercent));

	const maxWorkers = Math.floor(cpuCount * clampedReserve);

	// Avoid division by zero when maxWorkers is 0
	const maxMemoryMb =
		maxWorkers > 0 ? Math.floor((totalMemory * clampedReserve) / maxWorkers / (1024 * 1024)) : 0;

	const maxConcurrentIo = Math.floor(100 * clampedReserve);

	return { maxWorkers, maxMemoryMb, maxConcurrentIo };
}
