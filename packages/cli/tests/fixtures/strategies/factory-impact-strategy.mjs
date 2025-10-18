export const strategy = () => ({
  classifyAddition() {
    return 'non-breaking';
  },
  classifyRemoval() {
    return 'breaking';
  },
  classifyRename() {
    return 'non-breaking';
  },
  classifyModification(change) {
    return change.metadataChanged ? 'non-breaking' : 'breaking';
  },
});
