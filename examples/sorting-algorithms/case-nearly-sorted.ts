function lcg(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 1664525 + 1013904223) & 0xffffffff;
		return (state >>> 0) / 0xffffffff;
	};
}

const data = Array.from({ length: 1000 }, (_, i) => i);
const rng = lcg(789);
for (let s = 0; s < 50; s++) {
	const i = Math.floor(rng() * data.length);
	const j = Math.floor(rng() * data.length);
	[data[i], data[j]] = [data[j], data[i]];
}

export function createCase() {
	return {
		case: {
			caseId: "nearly-sorted",
			caseClass: "sorted",
			name: "Nearly Sorted Array",
			version: "1.0.0",
			inputs: { data },
		},
		getInput: () => Promise.resolve({ data }),
		getInputs: () => ({ data }),
	};
}
