import { sharedTarget as aliasedTarget } from "./SharedTarget";
import { sharedTargetFromBarrel } from "./SharedTargetBarrel";
import * as SharedTargets from "./SharedTarget";
import { overloaded } from "./Overloads";

export function callSharedTwice(): string {
  aliasedTarget();
  return aliasedTarget();
}

export function callThroughNamespace(): string {
  return SharedTargets.sharedTarget();
}

export function callThroughBarrel(): string {
  return sharedTargetFromBarrel();
}

export function callOverloaded(): string {
  return overloaded("value");
}
