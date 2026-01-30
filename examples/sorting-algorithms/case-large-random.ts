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

const data = randomArray(10000, 456);

export function createCase() {
  return {
    case: {
      caseId: "large-random",
      caseClass: "large",
      name: "Large Random Array",
      version: "1.0.0",
      inputs: { data },
    },
    getInput: async () => ({ data }),
    getInputs: () => ({ data }),
  };
}
