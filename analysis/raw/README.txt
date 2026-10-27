Inputs for the analysis pipeline (git-ignored; see ../README.md for the full list and commands).

Natural Earth 10m GeoJSON files go here (about 95 MB):
  ne_10m_admin_0_countries.geojson
  ne_10m_rivers_lake_centerlines.geojson
  ne_10m_lakes.geojson
  ne_10m_roads.geojson
  ne_10m_populated_places.geojson
e.g.  curl -O https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson

worldpop/  WorldPop 2020 1 km UN-adjusted GeoTIFFs, one per basin country (about 35 MB)
wdpa/      WDPA per-country shapefile zips from Protected Planet (about 120 MB; non-commercial terms)
