/**
 * Executor Module
 *
 * Re-exports executor components.
 */

export {
	type CheckpointData,
	CheckpointManager,
	type CheckpointManagerOptions,
	type CheckpointMode,
	createFileCheckpointManager,
	getGitCommit,
} from "./checkpoint-manager.js";
export {
	type CheckpointStorage,
	createCheckpointStorage,
	FileStorage,
	type FileSystem,
	getGitNamespace,
	GitStorage,
	InMemoryLock,
	type Lock,
	NodeFileSystem,
} from "./checkpoint-storage.js";
export {
	createExecutor,
	DEFAULT_EXECUTOR_CONFIG,
	type ExecutionProgress,
	type ExecutionSummary,
	Executor,
	type ExecutorConfig,
	type PlannedRun,
} from "./executor.js";
export {
	calculateResources,
	calculateResourcesSync,
	type ResourceLimits,
} from "./resource-calculator.js";
export { executeParallel, type ParallelExecutorOptions, shardPath } from "./parallel-executor.js";
export {
	generateConfigHash,
	generateRunId,
	parseRunId,
	type RunIdInputs,
	validateRunId,
} from "./run-id.js";
export {
	executeWithWorkerThreads,
	type ILogger,
	type IWorker,
	type IWorkerEntryPath,
	type IWorkerFactory,
	type RunBatch,
	type WorkerThreadsExecutorOptions,
	WorkerThreadsExecutor,
	ConsoleLogger,
	WorkerFactory,
	WorkerEntryPath,
} from "./worker-threads-executor.js";
export {
	type SerializedCase,
	type SerializedSut,
	type WorkerMessage,
	type WorkerResponse,
	type WorkerSuccessMessage,
	type WorkerErrorMessage,
	type WorkerOutputMessage,
	WorkerExecutor,
	type IParentPort,
	type IModuleLoader,
} from "./worker-executor.js";
export {
	BinarySut,
	createBinarySut,
	type BinarySutConfig,
	type CreateBinarySutOptions,
} from "./binary-sut.js";
