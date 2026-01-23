/**
 * Memory Monitoring for Experiment Execution
 *
 * Tracks memory usage during experiment execution to:
 * 1. Detect memory leaks and excessive consumption
 * 2. Provide early warning before OOM kills
 * 3. Record memory statistics in provenance data
 * 4. Enable automatic throttling or abort on memory pressure
 */

import { hrtime } from "node:process";

/**
 * Memory usage statistics.
 */
export interface MemoryStats {
	/** Resident set size in bytes (actual physical memory used) */
	rssBytes: number;

	/** Total heap size in bytes (allocated + unused) */
	heapTotalBytes: number;

	/** Heap used in bytes (actually used) */
	heapUsedBytes: number;

	/** External memory in bytes (C++ objects, etc) */
	externalBytes: number;

	/** Array buffers in bytes */
	arrayBuffersBytes: number;

	/** RSS in MB for human readability */
	rssMb: number;

	/** Heap usage percentage */
	heapUsagePercent: number;

	/** Timestamp when stats were collected */
	timestamp: number;
}

/**
 * Memory warning levels.
 */
export enum MemoryWarningLevel {
	/** No warning (memory usage is normal) */
	NORMAL = "normal",

	/** Warning (memory usage is elevated) */
	WARNING = "warning",

	/** Critical (memory usage is dangerously high) */
	CRITICAL = "critical",

	/** Emergency (process is near OOM) */
	EMERGENCY = "emergency",
}

/**
 * Memory monitoring configuration.
 */
export interface MemoryMonitorConfig {
	/** Warning threshold (MB) - default: 1GB */
	warningThresholdMb: number;

	/** Critical threshold (MB) - default: 2GB */
	criticalThresholdMb: number;

	/** Emergency threshold (MB) - default: 80% of system memory */
	emergencyThresholdMb: number;

	/** Whether to log memory usage */
	verbose: boolean;

	/** Callback when warning level changes */
	onWarningLevelChange?: (level: MemoryWarningLevel, stats: MemoryStats) => void;
}

/**
 * Default memory monitoring configuration.
 */
export const DEFAULT_MEMORY_CONFIG: MemoryMonitorConfig = {
	warningThresholdMb: 1024, // 1GB
	criticalThresholdMb: 2048, // 2GB
	emergencyThresholdMb: Math.floor((Number(process.env.MEMORY_LIMIT_MB) || 16_384) * 0.8), // 80% of limit or 13GB
	verbose: false,
};

/**
 * Memory monitor for tracking usage during execution.
 */
export class MemoryMonitor {
	private readonly config: MemoryMonitorConfig;
	private currentLevel: MemoryWarningLevel = MemoryWarningLevel.NORMAL;
	private startTime: bigint;

	constructor(config?: Partial<MemoryMonitorConfig>) {
		this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
		this.startTime = hrtime.bigint();
	}

	/**
	 * Get current memory usage statistics.
	 */
	getStats(): MemoryStats {
		const mem = process.memoryUsage();

		// RSS is already in bytes on most platforms
		const rssBytes = mem.rss;
		const rssMb = rssBytes / (1024 * 1024);
		const heapTotalBytes = mem.heapTotal;
		const heapUsedBytes = mem.heapUsed;
		const heapUsagePercent = (heapUsedBytes / heapTotalBytes) * 100;

		// Calculate elapsed time in milliseconds
		const elapsedHr = hrtime.bigint() - this.startTime;
		const timestamp = Number(elapsedHr) / 1_000_000;

		return {
			rssBytes,
			heapTotalBytes,
			heapUsedBytes,
			externalBytes: mem.external,
			arrayBuffersBytes: mem.arrayBuffers,
			rssMb,
			heapUsagePercent,
			timestamp,
		};
	}

	/**
	 * Get current warning level based on memory usage.
	 * @param stats
	 */
	getWarningLevel(stats?: MemoryStats): MemoryWarningLevel {
		const current = stats ?? this.getStats();

		if (current.rssMb >= this.config.emergencyThresholdMb) {
			return MemoryWarningLevel.EMERGENCY;
		}
		if (current.rssMb >= this.config.criticalThresholdMb) {
			return MemoryWarningLevel.CRITICAL;
		}
		if (current.rssMb >= this.config.warningThresholdMb) {
			return MemoryWarningLevel.WARNING;
		}
		return MemoryWarningLevel.NORMAL;
	}

	/**
	 * Check memory usage and trigger warnings if needed.
	 *
	 * @returns Current warning level
	 */
	check(): MemoryWarningLevel {
		const stats = this.getStats();
		const level = this.getWarningLevel(stats);

		// Trigger callback if level changed
		if (level !== this.currentLevel) {
			this.currentLevel = level;
			if (this.config.onWarningLevelChange) {
				this.config.onWarningLevelChange(level, stats);
			}
		}

		// Log warning if verbose
		if (this.config.verbose && level !== MemoryWarningLevel.NORMAL) {
			this.logWarning(level, stats);
		}

		return level;
	}

	/**
	 * Log memory warning with details.
	 * @param level
	 * @param stats
	 */
	private logWarning(level: MemoryWarningLevel, stats: MemoryStats): void {
		const levelColors = {
			[MemoryWarningLevel.WARNING]: "\u001B[33m", // Yellow
			[MemoryWarningLevel.CRITICAL]: "\u001B[31m", // Red
			[MemoryWarningLevel.EMERGENCY]: "\u001B[35m", // Magenta
			[MemoryWarningLevel.NORMAL]: "\u001B[32m", // Green
		};
		const reset = "\u001B[0m";
		const color = levelColors[level];

		console.warn(
			`${color}[Memory ${level.toUpperCase()}]${reset} ` +
				`RSS: ${stats.rssMb.toFixed(1)}MB ` +
				`| Heap: ${(stats.heapUsedBytes / 1024 / 1024).toFixed(1)}MB / ${(stats.heapTotalBytes / 1024 / 1024).toFixed(1)}MB ` +
				`(${stats.heapUsagePercent.toFixed(1)}%)`,
		);
	}

	/**
	 * Create a memory snapshot for provenance tracking.
	 */
	snapshot(): MemoryStats {
		return this.getStats();
	}

	/**
	 * Format memory stats for logging.
	 * @param stats
	 */
	format(stats?: MemoryStats): string {
		const current = stats ?? this.getStats();
		return `RSS: ${current.rssMb.toFixed(1)}MB, Heap: ${(current.heapUsedBytes / 1024 / 1024).toFixed(1)}MB`;
	}
}

/**
 * Global memory monitor instance for convenience.
 */
let globalMonitor: MemoryMonitor | null = null;

/**
 * Get or create the global memory monitor.
 * @param config
 */
export const getGlobalMemoryMonitor = (config?: Partial<MemoryMonitorConfig>): MemoryMonitor => {
	globalMonitor ??= new MemoryMonitor(config);
	return globalMonitor;
};

/**
 * Check memory usage using the global monitor.
 */
export const checkMemoryUsage = (): MemoryWarningLevel => {
	const monitor = getGlobalMemoryMonitor();
	return monitor.check();
};

/**
 * Get current memory stats using the global monitor.
 */
export const getMemoryStats = (): MemoryStats => {
	const monitor = getGlobalMemoryMonitor();
	return monitor.getStats();
};
