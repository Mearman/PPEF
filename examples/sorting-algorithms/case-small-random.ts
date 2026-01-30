function lcg(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) & 0xffffffff;
		return (state >>> 0) / 0xffffffff;
	};
}

function randomArray(size: number, seed: number): number[] {
	const rng = lcg(seed);
	return Array.from({ length: size }, () => Math.floor(rng() * size * 10));
}

const data = randomArray(20, 42);

export function createCase() {
	return {
		case: {
			caseId: "small-random",
			caseClass: "small",
			name: "Small Random Array",
			version: "1.0.0",
			inputs: { data },
		},
		getInput: () => Promise.resolve({ data }),
		getInputs: () => ({ data }),
	};
}
