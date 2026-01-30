function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >>> 0) / 0xffffffff;
  };
}

function shuffledArray(size: number, seed: number): number[] {
  const arr = Array.from({ length: size }, (_, i) => i);
  const rng = lcg(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const data = shuffledArray(10000, 123);
const sortedData = [...data].sort((a, b) => a - b);
const target = data[5];

export function createCase() {
  return {
    case: {
      caseId: "large-found-start",
      caseClass: "large",
      name: "Large Array — Target Near Start",
      version: "1.0.0" as const,
      inputs: { data, sortedData, target },
    },
    getInput: async () => ({ data, sortedData, target }),
    getInputs: () => ({ data, sortedData, target }),
  };
}
