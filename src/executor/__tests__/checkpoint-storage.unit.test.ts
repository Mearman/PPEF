/**
 * Unit tests for CheckpointStorage
 *
 * Tests FileStorage, GitStorage, FileSystem, and Lock implementations.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import type { CheckpointData } from "../checkpoint-manager.js";
import {
	FileStorage,
	FileSystem,
	GitStorage,
	InMemoryLock,
	NodeFileSystem,
} from "../checkpoint-storage.js";

/**
 * Mock file system for testing.
 * Handles both relative and absolute paths.
 */
class MockFileSystem implements FileSystem {
	public data = new Map<string, string>();
	private throwsOnRead = new Set<string>();
	private throwsOnWrite = new Set<string>();

	// Try multiple possible path resolutions
	private resolvePath(path: string): string | undefined {
		// Direct match
		if (this.data.has(path)) {
			return path;
		}
		// Try with leading slash if not present
		if (!path.startsWith("/") && this.data.has(`/${path}`)) {
			return `/${path}`;
		}
		// Try without leading slash if present
		if (path.startsWith("/") && this.data.has(path.slice(1))) {
			return path.slice(1);
		}
		return path;
	}

	async readFile(path: string): Promise<string> {
		// Try multiple path resolutions
		const pathsToTry = [
			path,
			path.startsWith("/") ? path : `/${path}`,
			path.startsWith("/") ? path.slice(1) : path,
		];

		for (const tryPath of pathsToTry) {
			if (this.data.has(tryPath) && this.throwsOnRead.has(tryPath)) {
				throw new Error(`Mock read error: ${tryPath}`);
			}
			const content = this.data.get(tryPath);
			if (content !== undefined) {
				return content;
			}
		}

		throw new Error(`File not found: ${path}`);
	}

	async writeFile(path: string, content: string): Promise<void> {
		// Store with multiple path variants
		this.data.set(path, content);
		if (!path.startsWith("/")) {
			this.data.set(`/${path}`, content);
		}
		this.data.set(`/${path}`, content);

		const resolvedPath = this.resolvePath(path) ?? path;
		if (this.throwsOnWrite.has(resolvedPath)) {
			throw new Error(`Mock write error: ${resolvedPath}`);
		}
	}

	async mkdir(_path: string, _options: { recursive: boolean }): Promise<void> {
		// No-op for mock
	}

	async unlink(path: string): Promise<void> {
		// Delete all variants
		this.data.delete(path);
		if (!path.startsWith("/")) {
			this.data.delete(`/${path}`);
		}
		this.data.delete(`/${path}`);

		const resolvedPath = this.resolvePath(path) ?? path;
		this.data.delete(resolvedPath);
	}

	async access(_path: string): Promise<void> {
		// No-op for mock
	}

	async readdir(path: string): Promise<string[]> {
		const resolvedPath = this.resolvePath(path) ?? path;
		const prefix = resolvedPath.endsWith("/") ? resolvedPath : `${resolvedPath}/`;
		return [...this.data.keys()]
			.filter((k) => k.startsWith(prefix))
			.map((k) => k.slice(prefix.length))
			.filter((k) => !k.includes("/"));
	}

	setFile(path: string, content: string): void {
		// Store with multiple path variants for flexibility
		this.data.set(path, content);
		if (!path.startsWith("/")) {
			this.data.set(`/${path}`, content);
		}
		// Also store with cwd prefix (common during tests)
		this.data.set(`/${path}`, content);
	}

	getFile(path: string): string | undefined {
		const resolvedPath = this.resolvePath(path) ?? path;
		// Check multiple path variants
		if (this.data.has(resolvedPath)) {
			return this.data.get(resolvedPath);
		}
		// Also try with the full resolved path if provided
		const normalizedPath = path.startsWith("/") ? path : `/${path}`;
		if (this.data.has(normalizedPath)) {
			return this.data.get(normalizedPath);
		}
		// Try stripping leading slash if it exists
		const strippedPath = path.startsWith("/") ? path.slice(1) : path;
		if (this.data.has(strippedPath)) {
			return this.data.get(strippedPath);
		}
		return undefined;
	}

	clear(): void {
		this.data.clear();
		this.throwsOnRead.clear();
		this.throwsOnWrite.clear();
	}

	setThrowsOnRead(path: string): void {
		this.throwsOnRead.add(path);
		if (!path.startsWith("/")) {
			this.throwsOnRead.add(`/${path}`);
		}
	}

	setThrowsOnWrite(path: string): void {
		this.throwsOnWrite.add(path);
		if (!path.startsWith("/")) {
			this.throwsOnWrite.add(`/${path}`);
		}
	}
}

describe("FileSystem", () => {
	describe("NodeFileSystem", () => {
		it("should have all required methods", () => {
			const fs = new NodeFileSystem();
			assert.ok(fs.readFile instanceof Function);
			assert.ok(fs.writeFile instanceof Function);
			assert.ok(fs.mkdir instanceof Function);
			assert.ok(fs.unlink instanceof Function);
			assert.ok(fs.access instanceof Function);
			assert.ok(fs.readdir instanceof Function);
		});
	});

	describe("MockFileSystem", () => {
		let mockFs: MockFileSystem;

		beforeEach(() => {
			mockFs = new MockFileSystem();
		});

		it("should store and retrieve files", async () => {
			mockFs.setFile("test.json", '{"test": true}');
			const content = await mockFs.readFile("test.json");
			assert.strictEqual(content, '{"test": true}');
		});

		it("should throw on missing file", async () => {
			await assert.rejects(() => mockFs.readFile("missing.json"));
		});

		it("should write files", async () => {
			await mockFs.writeFile("new.json", '{"new": true}');
			assert.strictEqual(mockFs.getFile("new.json"), '{"new": true}');
		});

		it("should delete files", async () => {
			mockFs.setFile("delete.json", '{"delete": true}');
			await mockFs.unlink("delete.json");
			assert.strictEqual(mockFs.getFile("delete.json"), undefined);
		});

		it("should list directory contents", async () => {
			mockFs.setFile("dir/file1.json", "{}");
			mockFs.setFile("dir/file2.json", "{}");
			mockFs.setFile("other/file.txt", "{}");

			const entries = await mockFs.readdir("dir");
			assert.ok(entries.includes("file1.json"));
			assert.ok(entries.includes("file2.json"));
			assert.ok(!entries.includes("file.txt"));
		});
	});
});

describe("Lock", () => {
	describe("InMemoryLock", () => {
		it("should allow concurrent acquisitions with queueing", async () => {
			const lock = new InMemoryLock();
			const results: number[] = [];

			// First acquisition
			void lock.acquire().then(async () => {
				results.push(1);
				await new Promise((resolve) => setTimeout(resolve, 10));
				lock.release();
			});

			// Second acquisition (should wait)
			void lock.acquire().then(() => {
				results.push(2);
				lock.release();
			});

			// Third acquisition (should wait)
			void lock.acquire().then(() => {
				results.push(3);
				lock.release();
			});

			await new Promise((resolve) => setTimeout(resolve, 50));
			assert.deepStrictEqual(results, [1, 2, 3]);
		});

		it("should release immediately when no waiters", () => {
			const lock = new InMemoryLock();
			lock.release(); // Should not throw
			lock.release(); // Should not throw
		});
	});
});

describe("FileStorage", () => {
	let mockFs: MockFileSystem;
	let storage: FileStorage;

	beforeEach(() => {
		mockFs = new MockFileSystem();
		storage = new FileStorage("test/checkpoint.json", mockFs);
	});

	/**
	 * Helper to set file content using the storage's resolved path.
	 * @param content
	 */
	const setStorageFile = (content: string): void => {
		const resolvedPath = storage.getPath();
		mockFs.data.set(resolvedPath, content);
	};

	/**
	 * Helper to get file content using the storage's resolved path.
	 */
	const getStorageFile = (): string | undefined => {
		const resolvedPath = storage.getPath();
		return mockFs.data.get(resolvedPath);
	};

	describe("load", () => {
		it("should parse valid JSON checkpoint", async () => {
			const checkpoint: CheckpointData = {
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: ["run1", "run2"],
				results: {},
				totalPlanned: 10,
			};
			setStorageFile(JSON.stringify(checkpoint));

			const loaded = await storage.load();
			assert.deepStrictEqual(loaded, checkpoint);
		});

		it("should return null for missing file", async () => {
			const loaded = await storage.load();
			assert.strictEqual(loaded, null);
		});

		it("should return null for invalid JSON", async () => {
			setStorageFile("not json");
			const loaded = await storage.load();
			assert.strictEqual(loaded, null);
		});

		it("should return null on read error", async () => {
			const resolvedPath = storage.getPath();
			mockFs.setThrowsOnRead(resolvedPath);
			const loaded = await storage.load();
			assert.strictEqual(loaded, null);
		});
	});

	describe("save", () => {
		it("should write checkpoint with updated timestamp", async () => {
			const checkpoint: CheckpointData = {
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: ["run1"],
				results: {},
				totalPlanned: 10,
			};

			await storage.save(checkpoint);
			const saved = getStorageFile();
			assert.ok(saved);

			const parsed = JSON.parse(saved) as CheckpointData;
			assert.strictEqual(parsed.configHash, "abc123");
			assert.notStrictEqual(parsed.updatedAt, "2024-01-01T00:00:00.000Z"); // Should be updated
		});

		it("should create parent directory via mkdir", async () => {
			const checkpoint: CheckpointData = {
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: [],
				results: {},
				totalPlanned: 0,
			};

			await storage.save(checkpoint);
			assert.ok(getStorageFile());
		});
	});

	describe("exists", () => {
		it("should return true for valid checkpoint file", async () => {
			const checkpoint: CheckpointData = {
				configHash: "abc123",
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				completedRunIds: [],
				results: {},
				totalPlanned: 0,
			};
			setStorageFile(JSON.stringify(checkpoint));

			const exists = await storage.exists();
			assert.strictEqual(exists, true);
		});

		it("should return false for missing file", async () => {
			const exists = await storage.exists();
			assert.strictEqual(exists, false);
		});

		it("should return false for invalid JSON", async () => {
			setStorageFile("not json");
			const exists = await storage.exists();
			assert.strictEqual(exists, false);
		});
	});

	describe("delete", () => {
		it("should remove checkpoint file", async () => {
			setStorageFile('{"test": true}');
			await storage.delete();
			assert.strictEqual(getStorageFile(), undefined);
		});

		it("should not throw when deleting missing file", async () => {
			await assert.doesNotReject(() => storage.delete());
		});
	});

	describe("getPath", () => {
		it("should return absolute path", () => {
			const path = storage.getPath();
			assert.ok(path.includes("checkpoint.json"));
		});
	});

	describe("findShards", () => {
		it("should find all worker checkpoint files", async () => {
			mockFs.setFile("results/execute/checkpoint-worker-00.json", "{}");
			mockFs.setFile("results/execute/checkpoint-worker-01.json", "{}");
			mockFs.setFile("results/execute/checkpoint-worker-02.json", "{}");
			mockFs.setFile("results/execute/other.json", "{}");

			const shards = await FileStorage.findShards("results/execute", mockFs);
			assert.strictEqual(shards.length, 3);
			assert.ok(shards[0].includes("checkpoint-worker-00.json"));
			assert.ok(shards[1].includes("checkpoint-worker-01.json"));
			assert.ok(shards[2].includes("checkpoint-worker-02.json"));
		});

		it("should sort shards by worker index", async () => {
			mockFs.setFile("results/execute/checkpoint-worker-02.json", "{}");
			mockFs.setFile("results/execute/checkpoint-worker-00.json", "{}");
			mockFs.setFile("results/execute/checkpoint-worker-01.json", "{}");

			const shards = await FileStorage.findShards("results/execute", mockFs);
			assert.ok(shards[0].includes("checkpoint-worker-00.json"));
			assert.ok(shards[1].includes("checkpoint-worker-01.json"));
			assert.ok(shards[2].includes("checkpoint-worker-02.json"));
		});

		it("should return empty array when directory has no shards", async () => {
			const shards = await FileStorage.findShards("results/execute", mockFs);
			assert.deepStrictEqual(shards, []);
		});

		it("should return empty array when directory does not exist", async () => {
			const shards = await FileStorage.findShards("nonexistent", mockFs);
			assert.deepStrictEqual(shards, []);
		});
	});

	describe("shardPath", () => {
		it("should generate zero-padded shard paths", () => {
			const path0 = FileStorage.shardPath("results/execute", 0);
			const path1 = FileStorage.shardPath("results/execute", 1);
			const path10 = FileStorage.shardPath("results/execute", 10);

			assert.ok(path0.includes("checkpoint-worker-00.json"));
			assert.ok(path1.includes("checkpoint-worker-01.json"));
			assert.ok(path10.includes("checkpoint-worker-10.json"));
		});
	});
});

describe("GitStorage", () => {
	describe("load", () => {
		it("should return null when git is not available", async () => {
			const storage = new GitStorage("test-namespace", "/nonexistent");
			const loaded = await storage.load();
			assert.strictEqual(loaded, null);
		});
	});

	describe("type", () => {
		it("should have type 'git'", () => {
			const storage = new GitStorage("test-namespace");
			assert.strictEqual(storage.type, "git");
		});
	});
});
