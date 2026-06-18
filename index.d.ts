// Type declarations for yasgui-geo-tg.
// A YASR plugin that renders SPARQL results containing WKT, GeoJSON or GML
// geometries on a Leaflet map.

import type * as L from 'leaflet';
import type { FeatureCollection } from 'geojson';

export interface InitialView {
  /** [lat, lon] center of the initial map view. */
  center: [number, number];
  /** Initial zoom level. */
  zoom: number;
}

export type DarkModeOption = 'auto' | boolean;
export type TimeModeOption = 'cumulative' | 'instant';

export interface GeoPluginOptions {
  /** Auto-detect numeric `?lat`/`?lon` column pairs and synthesize a point column. Default `true`. */
  latLonAutoDetect?: boolean;
  /** Default stroke / fill color for features lacking `?wktColor`. Default `'#3388ff'`. */
  defaultColor?: string;
  /** Name of the default basemap. Default `'openStreetMap'`. */
  defaultBasemap?: string;
  /** Initial map center and zoom. */
  initialView?: InitialView;
  /** Maximum zoom for fitting bounds. Default `14`. */
  maxZoom?: number;
  /** Minimum container height in pixels. Default `500`. */
  minHeight?: number;
  /** Custom basemaps dictionary. When omitted, a built-in set is used. */
  basemaps?: Record<string, L.Layer> | null;
  /** Cluster point layers above `clusterMinPoints`. Default `true`. */
  clustering?: boolean;
  /** Minimum number of points before clustering kicks in. Default `50`. */
  clusterMinPoints?: number;
  /** Cluster radius passed to leaflet.markercluster. Default `60`. */
  maxClusterRadius?: number;
  /** Render a heatmap overlay for point layers. Default `false`. */
  heatmap?: boolean;
  /** Heatmap blob radius. Default `25`. */
  heatmapRadius?: number;
  /** Heatmap blur. Default `15`. */
  heatmapBlur?: number;
  /** Enable polygon/rectangle drawing tools that emit a GeoSPARQL filter. Default `false`. */
  drawing?: boolean;
  /** Simplification tolerance in degrees (turf-simplify). `0` disables. Default `0`. */
  simplifyTolerance?: number;
  /** Show interactive simplification tolerance slider. Default `true`. */
  simplifyControl?: boolean;
  /** Max simplification tolerance exposed by the slider. Default `0.05`. */
  simplifyMaxTolerance?: number;
  /** Step size for the simplification slider. Default `0.0001`. */
  simplifyStep?: number;
  /** Show export-to-GeoJSON/KML/CSV control. Default `true`. */
  exportControl?: boolean;
  /** Persist map state in the URL hash. Default `false`. */
  permalink?: boolean;
  /** Show live coordinate readout. Default `true`. */
  showCoordinates?: boolean;
  /** Show distance-measure tool. Default `true`. */
  measure?: boolean;
  /** Show persisted style controls for default color/opacity/weight/radius. Default `true`. */
  styleControl?: boolean;
  /** Override the localStorage key used for persisted style controls. */
  styleStorageKey?: string | null;
  /** Show a time slider when common date/time bindings are present. Default `true`. */
  timeSlider?: boolean;
  /** Binding names considered temporal by the time slider. */
  timeBindingNames?: string[] | null;
  /** Whether the time slider shows only one instant or all features up to that time. Default `'cumulative'`. */
  timeMode?: TimeModeOption;
  /** Use dark basemap when OS prefers dark color scheme. Default `'auto'`. */
  darkMode?: DarkModeOption;
}

export interface YasrLike {
  results?: {
    getBindings(): Array<Record<string, { value: string; type?: string; datatype?: string }>>;
  };
  resultsEl?: HTMLElement;
  config?: { plugins?: { geo?: GeoPluginOptions } };
}

export default class GeoPlugin {
  static readonly priority: number;
  static readonly hideFromSelection: boolean;
  label: string;
  priority: number;
  helpReference: string;
  options: Required<GeoPluginOptions>;
  constructor(yasr: YasrLike);
  draw(): Promise<void>;
  canHandleResults(): boolean;
  getIcon(): HTMLElement;
}

