# Exporting results

The plugin adds an **Export** menu (toggle via `options.exportControl`, default
`true`): in the plugin toolbar on hosts with the yasr host API, or as a
download button at the top right of the map on other hosts. It writes the currently displayed
features to a downloaded file in one of three formats.

| Format  | Filename          | Notes                                                                 |
|---------|-------------------|-----------------------------------------------------------------------|
| GeoJSON | `results.geojson` | Verbatim copy of the in-memory feature collection.                    |
| Copy    | clipboard         | Copies formatted GeoJSON to the clipboard for paste into issues, notebooks or editors. |
| PNG     | `map.png`         | Captures the current map viewport as an image. Browser tile CORS rules can affect third-party basemap pixels. |
| KML     | `results.kml`     | Supports `Point`, `LineString`, `Polygon` (incl. holes). Uses `wktLabel` or `name` as placemark name. |
| CSV     | `results.csv`     | One row per feature, one column per binding variable + a synthesized `wkt` column. |

Features from every visible geometry column are merged. Hidden layers (toggled
off in the layers control) are still exported, because export operates on the
parsed result set, not on what is currently rendered.

## CSV escaping

Values containing commas, quotes or newlines are wrapped in double quotes and
internal quotes are doubled, per RFC 4180.

## Disabling the control

```js
new Yasgui(el, {
  yasr: { plugins: { geo: { exportControl: false } } },
});
```
