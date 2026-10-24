# html-to-image 1.11.13 local copy

Copied from the project's pinned npm package ESM distribution. The original MIT license is in `LICENSE`. `provenance.json` records the original and copied file hashes.

The only functional change adds and re-exports `clearResourceCache()`. The application calls it when PNG export finishes or fails. Revocable thumbnail blob URLs change between mounts; upstream's persistent resource-to-data-URL cache would otherwise retain each old URL's encoded image after export. Rendering, cloning and encoding behavior remain upstream's implementation. Source-map comments were removed because map files are not copied.

When updating, compare the pinned upstream distribution and preserve the cache cleanup contract. Verify real desktop PNG export and repeated exports after a thumbnail unmount/remount.
