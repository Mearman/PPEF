/**
 * Checkpoint Storage Backends
 *
 * Pluggable storage for experiment checkpoints:
 * - FileStorage: JSON files in local filesystem (fast, no git required)
 * - GitStorage: Git notes attached to commits (version controlled, shareable)
 *
 * Dependency Injection:
 * - FileSystem interface enables mocking for tests
 * - Lock interface enables pluggable concurrency control
 *
 * Usage:
 * ```typescript
 * // File-based (default)
 * const fileStorage = new FileStorage("results/execute/checkpoint.json");
 *
 * // Git-based (stores as git notes)
 * const gitStorage = new GitStorage("results-execute");
 *
 * // With mock file system for testing
 * const mockFs = new MockFileSystem();
 * const fileStorage = new FileStorage("checkpoint.json", mockFs);
 *
 * // Auto-detect based on mode
 * const storage = createCheckpointStorage("file", "results/execute/checkpoint.json");
 * const storage = createCheckpointStorage("git", "results-execute");
 * ```
 */

import { execSync } from "node:child_process";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { CheckpointData } from "./checkpoint-manager.js";

/**
 * Interface for file system operations.
 * Enables mocking for testing and alternative storage backends.
 */
export interface FileSystem {
	/**
	 * Read file contents as UTF-8 string.
	 * @param path - Absolute file path
	 * @returns File contents or throws if not found
	 */
	readFile(path: string): Promise<string>;

	/**
	 * Write string content to a file.
	 * @param path - Absolute file path
	 * @param content - Content to write
	 */
	writeFile(path: string, content: string): Promise<void>;

	/**
	 * Create directory recursively if it doesn't exist.
	 * @param path - Directory path
	 * @param options - Options including recursive flag
	 */
	mkdir(path: string, options: { recursive: boolean }): Promise<void>;

	/**
	 * Delete a file if it exists.
	 * @param path - File path to delete
	 */
	unlink(path: string): Promise<void>;

	/**
	 * Check if file/directory exists.
	 * @param path - Path to check
	 */
	access(path: string): Promise<void>;

	/**
	 * List directory contents.
	 * @param path - Directory path
	 * @returns Array of entry names
	 */
	readdir(path: string): Promise<string[]>;
}

/**
 * Production file system implementation using node:fs/promises.
 */
export class NodeFileSystem implements FileSystem {
	async readFile(path: string): Promise<string> {
		return readFile(path, "utf-8");
	}

	async writeFile(path: string, content: string): Promise<void> {
		await writeFile(path, content, "utf-8");
	}

	async mkdir(path: string, options: { recursive: boolean }): Promise<void> {
		await mkdir(path, options);
	}

	async unlink(path: string): Promise<void> {
		await unlink(path);
	}

	async access(path: string): Promise<void> {
		const { constants } = await import("node:fs/promises");
		const { access } = await import("node:fs/promises");
		await access(path, constants.F_OK);
	}

	async readdir(path: string): Promise<string[]> {
		return readdir(path);
	}
}

/**
 * Interface for concurrency control.
 * Enables pluggable locking mechanisms for checkpoint saves.
 */
export interface Lock {
	/**
	 * Acquire the lock, waiting if necessary.
	 */
	acquire(): Promise<void>;

	/**
	 * Release the lock.
	 */
	release(): void;
}

/**
 * In-memory lock for single-process use.
 * Provides queue-based locking for concurrent saves within a process.
 */
export class InMemoryLock implements Lock {
	private locked = false;
	private queue: (() => void)[] = [];

	async acquire(): Promise<void> {
		return new Promise<void>((resolve) => {
			if (this.locked) {
				this.queue.push(resolve);
			} else {
				this.locked = true;
				resolve();
			}
		});
	}

	release(): void {
		const next = this.queue.shift();
		if (next) {
			next();
		} else {
			this.locked = false;
		}
	}
}

/**
 * Checkpoint storage mode.
 */
export type CheckpointMode = "file" | "git" | "auto";

/**
 * Abstract checkpoint storage interface.
 */
export interface CheckpointStorage {
	/**
	 * Load checkpoint data from storage.
	 * @returns Checkpoint data or null if not found
	 */
	load(): Promise<CheckpointData | null>;

	/**
	 * Save checkpoint data to storage.
	 * @param data - Checkpoint data to save
	 */
	save(data: CheckpointData): Promise<void>;

	/**
	 * Delete checkpoint from storage.
	 */
	delete(): Promise<void>;

	/**
	 * Check if checkpoint exists.
	 */
	exists(): Promise<boolean>;

	/**
	 * Get storage type identifier.
	 */
	readonly type: string;
}

/**
 * File-based checkpoint storage.
 * Stores checkpoints as JSON files in the local filesystem.
 *
 * Supports dependency injection of FileSystem for testing.
 */
export class FileStorage implements CheckpointStorage {
	readonly type = "file";
	private readonly path: string;
	private readonly fs: FileSystem;

	constructor(path: string, fs?: FileSystem) {
		this.path = resolve(path);
		this.fs = fs ?? new NodeFileSystem();
	}

	async load(): Promise<CheckpointData | null> {
		try {
			const content = await this.fs.readFile(this.path);
			return JSON.parse(content) as CheckpointData;
		} catch {
			return null;
		}
	}

	async save(data: CheckpointData): Promise<void> {
		try {
			await this.fs.mkdir(dirname(this.path), { recursive: true });
			data.updatedAt = new Date().toISOString();
			const content = JSON.stringify(data, null, 2);
			await this.fs.writeFile(this.path, content);
		} catch (error) {
			console.warn(`Failed to save checkpoint to ${this.path}: ${error}`);
			throw error;
		}
	}

	async delete(): Promise<void> {
		try {
			await this.fs.unlink(this.path);
		} catch {
			// Ignore if file doesn't exist
		}
	}

	async exists(): Promise<boolean> {
		try {
			const content = await this.fs.readFile(this.path);
			const data = JSON.parse(content);
			return data !== null && typeof data === "object";
		} catch {
			return false;
		}
	}

	getPath(): string {
		return this.path;
	}

	/**
	 * Find all worker checkpoint shard files in a directory.
	 * Looks for files matching the pattern "checkpoint-worker-*.json".
	 *
	 * @param baseDir - Directory to search for shard files
	 * @param fs - FileSystem implementation (defaults to NodeFileSystem)
	 * @returns Sorted array of shard file paths
	 */
	static async findShards(baseDir: string, fs?: FileSystem): Promise<string[]> {
		const fileSystem = fs ?? new NodeFileSystem();
		const shardFiles: string[] = [];

		try {
			const entries = await fileSystem.readdir(baseDir);
			for (const entry of entries) {
				if (entry.startsWith("checkpoint-worker-") && entry.endsWith(".json")) {
					shardFiles.push(resolve(baseDir, entry));
				}
			}
		} catch {
			// Directory doesn't exist or is not readable
			return [];
		}

		// Sort by worker index (extract numeric part for proper ordering)
		return shardFiles.sort((a, b) => {
			const aMatch = /checkpoint-worker-(\d+)\.json/.exec(a);
			const bMatch = /checkpoint-worker-(\d+)\.json/.exec(b);
			const aIndex = aMatch ? Number.parseInt(aMatch[1], 10) : -1;
			const bIndex = bMatch ? Number.parseInt(bMatch[1], 10) : -1;
			return aIndex - bIndex;
		});
	}

	/**
	 * Generate a shard file path for a specific worker.
	 *
	 * @param baseDir - Base directory for checkpoints
	 * @param workerIndex - Worker index (0-based)
	 * @returns Path to the shard checkpoint file
	 */
	static shardPath(baseDir: string, workerIndex: number): string {
		return resolve(baseDir, `checkpoint-worker-${String(workerIndex).padStart(2, "0")}.json`);
	}
}

/**
 * Git-based checkpoint storage using git notes.
 *
 * Checkpoints are stored as git notes attached to the current HEAD.
 * This provides:
 * - Version control: Checkpoints tracked in git history
 * - Shareability: Team members can access each other's checkpoints
 * - Reproducibility: Linked to specific commits
 * - Safety: No accidental deletion through git clean
 *
 * Each checkpoint is stored as a note with a unique ref based on the namespace.
 */
export class GitStorage implements CheckpointStorage {
	readonly type = "git";
	private readonly namespace: string;
	private readonly repoRoot: string;

	constructor(namespace: string, repoRoot = process.cwd()) {
		this.namespace = namespace;
		this.repoRoot = repoRoot;
	}

	/**
	 * Get the full notes ref for this checkpoint.
	 */
	private getNotesRef(): string {
		return `refs/notes/checkpoints/${this.namespace}`;
	}

	/**
	 * Check if git is available and we're in a git repo.
	 */
	private checkGitAvailable(): boolean {
		try {
			execSync("git rev-parse --git-dir", {
				cwd: this.repoRoot,
				stdio: "pipe",
			});
			return true;
		} catch {
			return false;
		}
	}

	async load(): Promise<CheckpointData | null> {
		if (!this.checkGitAvailable()) {
			console.warn("Git not available, falling back to null checkpoint");
			return null;
		}

		try {
			// Get the note content
			const content = execSync(
				`git --work-tree="${this.repoRoot}" notes --ref=${this.getNotesRef()} show 2>/dev/null || echo ""`,
				{ encoding: "utf-8", cwd: this.repoRoot },
			);

			if (!content.trim()) {
				return null;
			}

			return JSON.parse(content) as CheckpointData;
		} catch {
			return null;
		}
	}

	async save(data: CheckpointData): Promise<void> {
		if (!this.checkGitAvailable()) {
			console.warn("Git not available, skipping checkpoint save");
			return;
		}

		try {
			data.updatedAt = new Date().toISOString();

			// Write to a temp file first
			const temporaryPath = resolve(this.repoRoot, ".git", "checkpoint-tmp.json");
			await writeFile(temporaryPath, JSON.stringify(data, null, 2), "utf-8");

			// Add the note using the temp file
			execSync(
				`git --work-tree="${this.repoRoot}" notes --ref=${this.getNotesRef()} add -F "${temporaryPath}"`,
				{ stdio: "pipe", cwd: this.repoRoot },
			);

			// Clean up temp file
			await unlink(temporaryPath).catch(() => {});
		} catch (error) {
			console.warn(`Failed to save git checkpoint: ${error}`);
			throw error;
		}
	}

	async delete(): Promise<void> {
		if (!this.checkGitAvailable()) {
			return;
		}

		try {
			execSync(`git --work-tree="${this.repoRoot}" notes --ref=${this.getNotesRef()} remove`, {
				stdio: "pipe",
				cwd: this.repoRoot,
			});
		} catch {
			// Ignore if note doesn't exist
		}
	}

	async exists(): Promise<boolean> {
		const data = await this.load();
		return data !== null;
	}

	/**
	 * List all checkpoints for this namespace across git history.
	 * Returns a map of commit SHA to checkpoint metadata.
	 */
	async listHistory(): Promise<{ commit: string; checkpoint: CheckpointData }[]> {
		if (!this.checkGitAvailable()) {
			return [];
		}

		try {
			// Get all commits that have notes for this namespace
			const output = execSync(
				`git --work-tree="${this.repoRoot}" notes --ref=${this.getNotesRef()} list`,
				{ encoding: "utf-8", cwd: this.repoRoot },
			);

			const lines = output.trim().split("\n");
			const results: { commit: string; checkpoint: CheckpointData }[] = [];

			for (const line of lines) {
				const [commitSha] = line.split(/\s+/);
				try {
					const content = execSync(
						`git --work-tree="${this.repoRoot}" notes --ref=${this.getNotesRef()} show ${commitSha}`,
						{ encoding: "utf-8", cwd: this.repoRoot },
					);
					const checkpoint = JSON.parse(content) as CheckpointData;
					results.push({ commit: commitSha, checkpoint });
				} catch {
					// Skip invalid entries
				}
			}

			return results;
		} catch {
			return [];
		}
	}

	/**
	 * Restore checkpoint from a specific commit.
	 * @param commitSha
	 */
	async restoreFromCommit(commitSha: string): Promise<CheckpointData | null> {
		if (!this.checkGitAvailable()) {
			return null;
		}

		try {
			const content = execSync(
				`git --work-tree="${this.repoRoot}" notes --ref=${this.getNotesRef()} show ${commitSha}`,
				{ encoding: "utf-8", cwd: this.repoRoot },
			);
			return JSON.parse(content) as CheckpointData;
		} catch {
			return null;
		}
	}
}

/**
 * Create a checkpoint storage instance based on mode.
 * @param mode - Storage mode ("file", "git", or "auto")
 * @param pathOrNamespace - File path or git namespace
 * @param repoRoot - Git repository root (for git storage)
 */
export const createCheckpointStorage = (
	mode: CheckpointMode,
	pathOrNamespace: string,
	repoRoot?: string,
): CheckpointStorage => {
	const effectiveMode = mode === "auto" ? detectPreferredMode() : mode;

	if (effectiveMode === "git") {
		return new GitStorage(pathOrNamespace, repoRoot);
	}

	return new FileStorage(pathOrNamespace);
};

/**
 * Detect preferred checkpoint mode based on environment.
 * Returns "git" if in a git repo with commits, otherwise "file".
 */
const detectPreferredMode = (): CheckpointMode => {
	try {
		// Check if we're in a git repo with commits
		execSync("git rev-parse --git-dir > /dev/null 2>&1", { stdio: "pipe" });

		// Check if there are any commits
		try {
			execSync("git rev-parse HEAD > /dev/null 2>&1", { stdio: "pipe" });
			return "git";
		} catch {
			// Git repo but no commits yet
			return "file";
		}
	} catch {
		// Not a git repo
		return "file";
	}
};

/**
 * Get default checkpoint namespace for git storage.
 * Based on results directory path.
 * @param resultsDir
 */
export const getGitNamespace = (resultsDir: string): string =>
	resultsDir.replaceAll(/[/\\]/g, "-").replace(/^\./, "").replace(/^\/+/, "");
