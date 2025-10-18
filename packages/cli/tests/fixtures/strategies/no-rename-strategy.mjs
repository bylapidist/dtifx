export const strategy = {
  detectRenames(removed, added) {
    return {
      renamed: [],
      remainingRemoved: [...removed],
      remainingAdded: [...added],
    };
  },
};
