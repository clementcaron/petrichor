export function sharedTarget(): string {
  return "shared";
}

function internalShared(): string {
  return "internal";
}

export function usesInternalShared(): string {
  return internalShared();
}

export function recursiveLoop(remaining: number): number {
  if (remaining <= 0) {
    return 0;
  }

  return recursiveLoop(remaining - 1);
}

export function isolatedSubject(): string {
  return "isolated";
}
