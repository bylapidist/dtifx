export const strategy = () => ({
  detectRenames(removed, added, _impact) {
    return {
      renamed: [],
      remainingRemoved: removed,
      remainingAdded: added,
    };
  },
});
