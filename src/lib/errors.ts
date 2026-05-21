import { CliError } from "../contracts";

export class PetrichorError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PetrichorError";
    this.code = code;
  }
}

export function toCliError(error: unknown, fallbackCode = "internal_error"): CliError {
  if (error instanceof PetrichorError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof Error) {
    return { code: fallbackCode, message: error.message };
  }

  return { code: fallbackCode, message: "An unknown error occurred." };
}
