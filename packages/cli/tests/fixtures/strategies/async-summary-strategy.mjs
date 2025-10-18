export const strategy = async () => ({
  async createSummary(input) {
    const totalNext = input.next.size;
    return {
      totalPrevious: input.previous.size,
      totalNext,
      added: input.added.length,
      removed: input.removed.length,
      changed: input.changed.length,
      renamed: input.renamed.length,
      unchanged: Math.max(totalNext - input.added.length, 0),
      breaking: 0,
      nonBreaking: 0,
      valueChanged: 0,
      metadataChanged: 0,
      recommendedBump: 'none',
      types: [],
      groups: [],
    };
  },
});
