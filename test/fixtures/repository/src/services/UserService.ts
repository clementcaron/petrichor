const buildCacheKey = (id: string): string => `user:${id}`;

export class UserService {
  getCacheKey(id: string): string {
    return buildCacheKey(id);
  }
}
