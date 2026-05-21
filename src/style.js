import L from 'leaflet';

export const DEFAULT_STYLE_STATE = {
  color: '#3388ff',
  opacity: 0.8,
  fillOpacity: 0.7,
  weight: 2,
  radius: 4,
};

const STORAGE_PREFIX = 'yasgui-geo-style:';

export const hashString = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

export const getStyleStorageKey = (yasr, options = {}) => {
  if (options.styleStorageKey) return options.styleStorageKey;
  const query = yasr?.yasqe?.getValue?.() || yasr?.yasqe?.value || '';
  const endpoint = yasr?.config?.requestConfig?.endpoint || '';
  return `${STORAGE_PREFIX}${hashString(`${endpoint}\n${query}`)}`;
};

const clamp = (value, min, max, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
};

export const normalizeStyleState = (state = {}) => ({
  color: typeof state.color === 'string' && state.color ? state.color : DEFAULT_STYLE_STATE.color,
  opacity: clamp(state.opacity, 0, 1, DEFAULT_STYLE_STATE.opacity),
  fillOpacity: clamp(state.fillOpacity, 0, 1, DEFAULT_STYLE_STATE.fillOpacity),
  weight: clamp(state.weight, 0, 12, DEFAULT_STYLE_STATE.weight),
  radius: clamp(state.radius, 1, 30, DEFAULT_STYLE_STATE.radius),
});

export const loadStyleState = (key, storage = globalThis.localStorage) => {
  try {
    const raw = storage?.getItem?.(key);
    return normalizeStyleState(raw ? JSON.parse(raw) : DEFAULT_STYLE_STATE);
  } catch {
    return { ...DEFAULT_STYLE_STATE };
  }
};

export const saveStyleState = (key, state, storage = globalThis.localStorage) => {
  const normalized = normalizeStyleState(state);
  try {
    storage?.setItem?.(key, JSON.stringify(normalized));
  } catch {
    // localStorage can be unavailable in private modes; styling still works for the session.
  }
  return normalized;
};

export const resolveFeatureStyle = (feature, state, fallbackColor = DEFAULT_STYLE_STATE.color) => {
  const normalized = normalizeStyleState({ ...DEFAULT_STYLE_STATE, ...state, color: state?.color || fallbackColor });
  const color = feature?.properties?.wktColor?.value || normalized.color || fallbackColor;
  return {
    color,
    fillColor: color,
    weight: normalized.weight,
    radius: normalized.radius,
    opacity: normalized.opacity,
    fillOpacity: normalized.fillOpacity,
  };
};

export const addStyleControl = (map, initialState, onChange) => {
  const Control = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      let state = normalizeStyleState(initialState);
      const div = L.DomUtil.create('div', 'leaflet-bar yasgui-geo-style');

      // Toggle button (always visible)
      const toggle = document.createElement('a');
      toggle.href = '#';
      toggle.title = 'Style options';
      toggle.textContent = '🎨';
      toggle.style.fontSize = '16px';
      toggle.style.textAlign = 'center';
      toggle.style.textDecoration = 'none';
      toggle.style.lineHeight = '26px';
      toggle.style.display = 'block';

      // Collapsible panel (hidden by default)
      const panel = document.createElement('div');
      panel.style.display = 'none';
      panel.style.padding = '6px';
      panel.style.gap = '4px';
      panel.style.fontSize = '12px';
      panel.style.background = '#fff';
      panel.style.borderTop = '1px solid #ccc';

      let panelOpen = false;
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        panelOpen = !panelOpen;
        panel.style.display = panelOpen ? 'grid' : 'none';
      });

      const rangeInputs = {};

      const emit = () => onChange(normalizeStyleState(state));
      const row = (title, input) => {
        const label = document.createElement('label');
        label.title = title;
        label.style.display = 'grid';
        label.style.gap = '2px';
        const span = document.createElement('span');
        span.textContent = title;
        label.append(span, input);
        return label;
      };
      const range = (title, key, min, max, step) => {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(state[key]);
        input.oninput = () => { state = { ...state, [key]: Number(input.value) }; emit(); };
        rangeInputs[key] = input;
        return row(title, input);
      };
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = state.color;
      colorInput.oninput = () => { state = { ...state, color: colorInput.value }; emit(); };

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.textContent = 'Reset defaults';
      resetBtn.style.marginTop = '4px';
      resetBtn.style.fontSize = '11px';
      resetBtn.style.cursor = 'pointer';
      resetBtn.onclick = () => {
        state = { ...DEFAULT_STYLE_STATE };
        colorInput.value = state.color;
        for (const [key, input] of Object.entries(rangeInputs)) {
          input.value = String(state[key]);
        }
        emit();
      };

      panel.append(
        row('Stroke color', colorInput),
        range('Stroke opacity', 'opacity', 0, 1, 0.05),
        range('Fill opacity', 'fillOpacity', 0, 1, 0.05),
        range('Stroke thickness', 'weight', 0, 12, 1),
        range('Marker size', 'radius', 1, 30, 1),
        resetBtn,
      );

      div.append(toggle, panel);
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    },
  });
  return new Control().addTo(map);
};
