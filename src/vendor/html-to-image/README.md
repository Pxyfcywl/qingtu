# html-to-image 1.11.13 local copy

Copied from the project's pinned npm package ESM distribution. The original MIT license is in `LICENSE`. `provenance.json` records the original and copied file hashes.

The local changes add and re-export `clearResourceCache()` and preserve computed CSS custom properties on Pele SVG roots during cloning. The application clears the resource cache when PNG export finishes or fails. Revocable thumbnail blob URLs change between mounts; upstream's persistent resource-to-data-URL cache would otherwise retain each old URL's encoded image after export. Pele's SVG children are copied as a subtree, so their theme variables must travel with the SVG root for exported colors to match the live view. Other rendering and encoding behavior remain upstream's implementation. Source-map comments were removed because map files are not copied. `provenance.json` describes the original copy; subsequent changes are documented here.

When updating, compare the pinned upstream distribution and preserve the cache cleanup contract. Verify real desktop PNG export and repeated exports after a thumbnail unmount/remount.
