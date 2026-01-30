const data = Array.from({ length: 1000 }, (_, i) => i);

export function createCase() {
  return {
    case: {
      caseId: "already-sorted",
      caseClass: "sorted",
      name: "Already Sorted Array",
      version: "1.0.0",
      inputs: { data },
    },
    getInput: async () => ({ data }),
    getInputs: () => ({ data }),
  };
}
