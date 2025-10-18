export const strategy = {
  createSummary(input) {
    return {
      totalPrevious: input.previous.size,
      totalNext: input.next.size,
      added: input.added.length,
      removed: input.removed.length,
      renamed: input.renamed.length,
      changed: input.changed.length,
      unchanged: 0,
      breaking: 0,
      nonBreaking: 0,
      valueChanged: 0,
      metadataChanged: 0,
      recommendedBump: 'none',
      types: [],
      groups: [],
    };
  },
};
