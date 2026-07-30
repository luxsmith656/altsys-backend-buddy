# Mt. Kalisungan terrain assets

These local tiles keep the optional 3D view detailed and available without
requesting terrain data every time it opens.

- `kalisungan-dem-{nw,ne,sw,se}.png`: Four Terrarium elevation tiles from the
  AWS Open Data Terrain Tiles dataset, covering the children of XYZ tile
  `13/6857/3770` at zoom level 14.
- `kalisungan-map-{nw,ne,sw,se}.png`: Matching OpenStreetMap raster tiles at
  zoom level 14.

The 3D renderer mosaics and decodes the Terrarium RGB elevation values in the
browser, applies DEM-derived hillshade, and aligns official route coordinates
to the same Web Mercator area. The `1x` mode preserves true vertical scale;
`2x` and `3x` visually exaggerate relief without changing the source heights.

Sources:

- https://registry.opendata.aws/terrain-tiles/
- https://www.openstreetmap.org/copyright
