# Mt. Kalisungan terrain assets

These two small, local tiles keep the optional 3D view fast and available without
requesting terrain data every time it opens.

- `kalisungan-dem.png`: Terrarium elevation tile from the AWS Open Data Terrain
  Tiles dataset, XYZ tile `13/6857/3770`.
- `kalisungan-map.png`: OpenStreetMap raster tile `13/6857/3770`.

The 3D renderer decodes the Terrarium RGB elevation values in the browser and
aligns official route coordinates to the same Web Mercator tile.

Sources:

- https://registry.opendata.aws/terrain-tiles/
- https://www.openstreetmap.org/copyright
