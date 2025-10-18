export class CustomImpactStrategy {
  classifyAddition() {
    return 'breaking';
  }

  classifyRemoval() {
    return 'non-breaking';
  }

  classifyRename() {
    return 'breaking';
  }

  classifyModification() {
    return 'non-breaking';
  }
}

export const strategy = CustomImpactStrategy;
