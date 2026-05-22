import { sharedTarget } from "./SharedTarget";

export function RenderTarget() {
  return <div />;
}

export function callFromTsx(): string {
  return sharedTarget();
}

export function renderConsumer() {
  return <RenderTarget />;
}
