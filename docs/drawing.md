# Drawing spatial filters

When `options.drawing` is `true` the plugin offers rectangle and polygon
drawing tools (from `leaflet-draw`): Rectangle, Polygon and clear buttons in
the plugin toolbar on hosts with the yasr host API, or a small button group at
the top left of the map on other hosts. Right-click finishes a polygon. When you finish a shape, a panel appears in the
bottom-left of the map with a ready-to-paste GeoSPARQL filter:

```sparql
FILTER(geof:sfWithin(?geom, "POLYGON((4.30 50.80, 4.40 50.80, 4.40 50.90, 4.30 50.80))"^^geo:wktLiteral))
```

A **Copy** button copies the snippet to the clipboard. Drop it into the YASQE
editor to constrain your next query to the area you just drew.

## Required prefixes

Add these to your query:

```sparql
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
```
