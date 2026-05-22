<!-- petrichor-start -->
## Petrichor

When reading TypeScript (`.ts`) or TSX (`.tsx`) source files, prefer `petrichor capsule <repositoryPath>` over reading the file directly.
It returns the full source of the pivot file plus skeletonized signatures for all directly related neighbor files — more structural signal in less context.

Only fall back to a direct file read if petrichor is unavailable or the file is not indexed.
<!-- petrichor-end -->
