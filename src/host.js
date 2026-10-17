// Feature detection for the yasr host API (MatGUI yasr, host API version 1).
//
// A host that offers it exposes `yasr.hostApi = { version: 1, describe: true,
// toolbar: true }` plus `yasr.describe(iri, options)` (a shared describe panel)
// and `yasr.getPluginToolbar()` (a toolbar slot under the yasr header). Hosts
// without it (today's published @matdata/yasgui, @zazuko/yasgui) get the
// plugin's own describe modal and Leaflet map controls.
//
// Detection looks at capabilities, never at version strings.

/** Label shown by the host as "Opened from Map". */
export const DESCRIBE_SOURCE = 'Map';

/**
 * True when the host draws the shared describe panel.
 * @param {Object} yasr
 * @returns {boolean}
 */
export const hasHostDescribe = (yasr) => !!(yasr?.hostApi?.describe && typeof yasr.describe === 'function');

/**
 * True when the host offers a plugin toolbar slot.
 * @param {Object} yasr
 * @returns {boolean}
 */
export const hasHostToolbar = (yasr) => !!(yasr?.hostApi?.toolbar && typeof yasr.getPluginToolbar === 'function');

/**
 * The host's plugin toolbar slot, or null when the host has none.
 * yasr empties the slot before every plugin draw(), so call this per draw.
 * @param {Object} yasr
 * @returns {HTMLElement|null}
 */
export const getHostToolbar = (yasr) => {
  if (!hasHostToolbar(yasr)) return null;
  try {
    return yasr.getPluginToolbar() || null;
  } catch (error) {
    console.warn('yasgui-geo-plugin: getPluginToolbar() failed, using map controls', error);
    return null;
  }
};

/**
 * Map the plugin's describe direction ('subject' | 'object') to the host's
 * ('outgoing' | 'incoming'). Host names pass through unchanged.
 * @param {string} [direction]
 * @returns {'outgoing'|'incoming'}
 */
export const toHostDirection = (direction) => (direction === 'object' || direction === 'incoming' ? 'incoming' : 'outgoing');

/**
 * Map a host direction back to the plugin's own ('subject' | 'object').
 * @param {string} [direction]
 * @returns {'subject'|'object'}
 */
export const toPluginDirection = (direction) => (direction === 'object' || direction === 'incoming' ? 'object' : 'subject');
