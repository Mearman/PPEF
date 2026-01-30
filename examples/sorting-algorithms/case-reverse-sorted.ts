const data = Array.from({ length: 1000 }, (_, i) => 999 - i);

export function createCase() {
  return {
    case: {
      caseId: "reverse-sorted",
      caseClass: "sorted",
      name: "Reverse Sorted Array",
      version: "1.0.0",
      inputs: { data },
    },
    getInput: async () => ({ data }),
    getInputs: () => ({ data }),
  };
}
