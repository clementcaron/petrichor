import { sharedTarget } from "./SharedTarget";

export function outerWithNestedCall(): string {
  function nested(): string {
    return sharedTarget();
  }

  return nested();
}

sharedTarget();

export function moduleScopeSubject(): string {
  return "module";
}
