import type { UserShape } from "../models/UserShape";
import { UserService } from "@services/UserService";
import "../setup/bootstrap";

export function createUserService(user: UserShape): UserService {
  void user;
  return new UserService();
}
