# Plugin options

Pass options to the geo plugin via Yasgui's standard plugin-config slot:

```js
const yasgui = new Yasgui(document.getElementById('yasgui'), {
  yasr: {
    pluginOrder: ['table', 'response', 'geo'],
    defaultPlugin: 'geo',
    plugins: {
      geo: {
        defaultColor: '#ff5722',
        defaultBasemap: 'ESRI Light Gray',
        initialView: { center: [48.8566, 2.3522], zoom: 11 },
        maxZoom: 18,
        minHeight: 600,
        latLonAutoDetect: true,
        // Replace the bundled basemaps entirely:
        basemaps: {
          'My tiles': L.tileLayer('https://my.tiles/{z}/{x}/{y}.png'),
        },
      },
    },
  },
});
```

## Available options

| Option | Type | Default | Description |
|---|---|---|---|
| `defaultColor` | `string` (CSS color) | `#3388ff` | Color used for features without a `?wktColor` binding. |
| `defaultBasemap` | `string` | `'openStreetMap'` | Name of the basemap to activate at startup. Must be a key of `basemaps`. |
| `initialView` | `{ center: [lat, lon], zoom: number }` | Belgium @ 5 | Map center and zoom when no features are present. |
| `maxZoom` | `number` | `14` | Upper bound applied when auto-fitting bounds to features. |
| `minHeight` | `number` (px) | `500` | Minimum height of the map container. |
| `latLonAutoDetect` | `boolean` | `true` | Auto-detect numeric lat/lon column pairs and synthesize a WKT POINT column. |
| `basemaps` | `{ [name]: L.TileLayer }` | built-in | Replace the bundled basemap dictionary. |
| `tileOverlays` | `{ [name]: L.TileLayer }` | built-in | Tile overlays offered in the layer control. Pass `{}` to hide the built-in ones. |
| `styleControl` | `boolean` | `true` | Show the compact style control for default color, opacity, fill, stroke width and marker radius. |
| `styleStorageKey` | `string \| null` | query hash | Override the localStorage key used to persist style-control values. |
| `simplifyTolerance` | `number` | `0` | Initial turf-simplify tolerance in degrees. |
| `simplifyControl` | `boolean` | `true` | Show a live simplification tolerance slider. |
| `simplifyMaxTolerance` | `number` | `0.05` | Maximum tolerance exposed by the slider. |
| `simplifyStep` | `number` | `0.0001` | Slider step size. |
| `timeSlider` | `boolean` | `true` | Show a temporal slider when result rows contain time/date-like bindings. |
| `timeBindingNames` | `string[] \| null` | common names | Override temporal binding names (`time`, `date`, `datetime`, `timestamp`, `start`, `startDate`). |
| `timeMode` | `'cumulative' \| 'instant'` | `'cumulative'` | Show all features up to the selected time, or only features at the exact selected time. |
| `permalink` | `boolean` | `false` | Persist center, zoom, basemap and visible geometry columns in the URL hash. |
| `highlightOnHover` | `boolean` | `true` | Outline the hovered feature and bring it to the front, so overlapping features can be told apart. |
| `highlightColor` | `string` (CSS color) | `#ff1493` | Outline color of the hovered feature. |
| `labels` | `boolean` | `false` | Show feature labels permanently on the map at startup. |
| `labelControl` | `boolean` | `true` | Show the 🏷️ control that toggles permanent labels. |

## Background maps

The layer control (top right) offers these background maps, none of which
needs an API key:

| Name | Source |
|---|---|
| `openStreetMap` (default) | OpenStreetMap standard |
| `OSM Humanitarian` | OpenStreetMap, Humanitarian style |
| `CyclOSM` | OpenStreetMap, CyclOSM style |
| `openTopoMap` | OpenTopoMap |
| `ESRI World Imagery (Satellite)` | Esri satellite imagery |
| `ESRI World Topo` | Esri topographic map |
| `ESRI Light Gray` | Esri light gray canvas, a quiet background for data |
| `ESRI Dark Gray` | Esri dark gray canvas |
| `None` | No background map |

It also offers two tile overlays that can be combined with any background:
`OpenRailwayMap` (railway infrastructure) and `ESRI Place Names & Boundaries`
(useful on top of satellite imagery).

## Styling

The style control persists default visual settings in `localStorage`, keyed by
the current endpoint/query when YASQE is available. A per-row `?wktColor`
binding still overrides the selected default color for that feature.

## Simplification

The simplification slider adjusts turf-simplify tolerance for line and polygon
features. Points are never simplified. A value of `0` disables simplification.

## Time Slider

When result rows contain a `?time`, `?date`, `?datetime`, `?timestamp`,
`?start`, or `?startDate` binding, the plugin displays a time slider. The
default cumulative mode shows all dated features up to the selected value;
undated features remain visible.

## Describing entities

Ctrl+click (Cmd+click on macOS) a feature to list the triples where the
feature's entity (the first IRI binding of its row) is the subject.
Ctrl+Shift+click lists the triples where it is the object. The same works on
any IRI in a feature popup, and on IRIs inside the describe dialog itself.

The triples are fetched with a background `SELECT` query through
`yasr.executeQuery` (limited to 1000 rows), so the map keeps its results.
IRIs are abbreviated with the prefixes declared in the main query.

The dialog remembers the IRIs reached by Ctrl+clicking inside it. Its ◀ and ▶
buttons (or Alt+← and Alt+→) step back and forward through them, and ⏮
returns to the IRI the describe started from. Ctrl+clicking after going back
drops the forward steps, like a browser.

## Labels

A feature's label is taken from `?wktLabel`, `?label`, `?name` or `?title`
(in that order), else from the first literal binding whose name ends in
`Label`, `Name` or `Title` (e.g. `?stationLabel`). The label shows as a tooltip
when hovering the feature. The 🏷️ control (or the `labels` option) shows the
labels permanently on the map.

## Convention-based per-feature controls

Bindings the plugin recognizes when present in result rows:

| Binding | Effect |
|---|---|
| `?wktColor` | Override fill/stroke color for that feature. |
| `?wktLabel` | Plain-text popup content (replaces the default key/value table). |
| `?wktTooltip` | Hover tooltip text (takes precedence over the label). |

## Supported geometry literal datatypes

| Datatype | Parsed as |
|---|---|
| `http://www.opengis.net/ont/geosparql#wktLiteral` | WKT / CRS-prefixed WKT |
| `http://www.openlinksw.com/schemas/virtrdf#Geometry` | WKT |
| `http://www.w3.org/2003/01/geo/wgs84_pos#geometry` | WKT (common DBpedia style) |
| `http://www.opengis.net/ont/geosparql#geoJSONLiteral` | GeoJSON geometry |
| `http://www.opengis.net/ont/geosparql#gmlLiteral` | GML geometry |
| `http://www.opengis.net/ont/geosparql#geoHashLiteral` | GeoHash center point |
