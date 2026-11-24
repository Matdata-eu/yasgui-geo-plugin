/**
 * Demo host: the results pane of MatGUI showing only this plugin.
 *
 * The page loads MatGUI (@matdata/yasgui) and its own Yasr, so the plugin runs
 * the way it does in MatGUI: with the yasr host API (plugin toolbar, shared
 * describe panel, background queries), the MatData design tokens and the
 * light and dark theme. There is no SPARQL endpoint: background queries
 * (describe, node expansion) are answered from the triples of the demo.
 */

const MATGUI_THEME_KEY = 'matgui-demo-theme';

/** Namespace of the predicates made from result variables */
export const DEMO_NS = 'http://example.org/demo#';

/** Turn a SPARQL JSON term into N-Triples */
function toNTerm(term) {
  if (term.type === 'uri') return `<${term.value}>`;
  if (term.type === 'bnode') return `_:${term.value}`;
  const value = String(term.value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  if (term['xml:lang']) return `"${value}"@${term['xml:lang']}`;
  if (term.datatype) return `"${value}"^^<${term.datatype}>`;
  return `"${value}"`;
}

/** Resolve `<iri>` or `prefix:local` with the PREFIX lines of the query */
function resolveTerm(token, query) {
  if (!token) return null;
  if (token.startsWith('<')) return token.slice(1, -1);
  const [prefix, ...rest] = token.split(':');
  const match = new RegExp(`PREFIX\\s+${prefix}:\\s*<([^>]*)>`, 'i').exec(query);
  return match ? match[1] + rest.join(':') : null;
}

const TERM = '(<[^>]+>|[A-Za-z][\\w-]*:[^\\s.;,]*)';

/**
 * Answer the background queries that plugins and the describe panel send:
 * `DESCRIBE <iri>` and the describe panel's `CONSTRUCT { <iri> ?p ?o }` /
 * `CONSTRUCT { ?s ?p <iri> }`, as N-Triples.
 */
export function answerQuery(query, triples) {
  let iri = null;
  let outgoing = true;
  let incoming = true;
  const describe = new RegExp(`DESCRIBE\\s+${TERM}`, 'i').exec(query);
  const out = new RegExp(`\\{\\s*${TERM}\\s+\\?p\\s+\\?o`, 'i').exec(query);
  const inc = new RegExp(`\\{\\s*\\?s\\s+\\?p\\s+${TERM}`, 'i').exec(query);
  if (describe) {
    iri = resolveTerm(describe[1], query);
  } else if (out) {
    iri = resolveTerm(out[1], query);
    incoming = false;
  } else if (inc) {
    iri = resolveTerm(inc[1], query);
    outgoing = false;
  }
  const lines = [];
  if (iri) {
    for (const t of triples) {
      const isSubject = t.subject.type === 'uri' && t.subject.value === iri;
      const isObject = t.object.type === 'uri' && t.object.value === iri;
      if ((outgoing && isSubject) || (incoming && isObject)) {
        lines.push(`${toNTerm(t.subject)} ${toNTerm(t.predicate)} ${toNTerm(t.object)} .`);
      }
    }
  }
  return [...new Set(lines)].join('\n');
}

/**
 * Triples for the describe panel of SELECT results: the first IRI of each row
 * gets the other values of that row, with `demo:<variable>` as predicate.
 */
export function triplesFromSelect(json) {
  const vars = json?.head?.vars || [];
  const triples = [];
  for (const row of json?.results?.bindings || []) {
    const v = vars.find((name) => row[name]?.type === 'uri');
    if (!v) continue;
    for (const w of vars) {
      if (w === v || !row[w]) continue;
      triples.push({
        subject: row[v],
        predicate: { type: 'uri', value: `${DEMO_NS}${w}` },
        object: row[w],
      });
    }
  }
  return triples;
}

/** Light/dark switch on <html data-theme>, which MatGUI and its plugins follow */
export function setupThemeToggle(button) {
  let stored = null;
  try {
    stored = localStorage.getItem(MATGUI_THEME_KEY);
  } catch {
    // storage blocked: follow the system
  }
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const apply = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    button.textContent = theme === 'dark' ? 'Light theme' : 'Dark theme';
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  };
  apply(stored || (prefersDark ? 'dark' : 'light'));
  button.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    apply(next);
    try {
      localStorage.setItem(MATGUI_THEME_KEY, next);
    } catch {
      // not remembered
    }
  });
}

/**
 * Create MatGUI's Yasr in `parent`, showing only `plugin`.
 *
 * @param {HTMLElement} parent
 * @param {object} options
 * @param {string} options.plugin        Registered plugin name, as MatGUI names it ("Graph", "Table", "Geo")
 * @param {() => object} options.getPrefixes  Prefixes of the current dataset
 * @param {() => object[]} options.getTriples Triples that answer background queries
 * @param {object} [options.yasr]         Extra Yasr configuration
 */
export function createYasr(parent, { plugin, getPrefixes, getTriples, yasr = {} }) {
  const Yasr = window.Yasgui.Yasr;
  const names = Object.keys(Yasr.plugins);
  // Only this plugin (a falsy entry switches a plugin off); "error" still shows failed requests
  const plugins = Object.fromEntries(
    names.map((name) => [name, name === plugin || name === 'error' ? { enabled: true } : false])
  );
  return new Yasr(parent, {
    // Yasr merges this with its default order item by item, so list every plugin
    pluginOrder: [plugin, ...names.filter((name) => name !== plugin)],
    defaultPlugin: plugin,
    plugins,
    // Keep nothing in local storage: the dataset picker decides what is shown
    persistenceId: null,
    prefixes: () => getPrefixes(),
    executeQuery: (query) =>
      new Promise((resolve) => {
        // A short delay, so loading states are visible as they are with an endpoint
        setTimeout(() => {
          const text = answerQuery(query, getTriples());
          resolve({ text: async () => text, data: text, status: 200 });
        }, 350);
      }),
    ...yasr,
  });
}

/** Show SPARQL JSON results in the Yasr, as if a query just returned them */
export function showResults(yasr, json) {
  const { prefixes, ...results } = json;
  yasr.setResponse({
    data: JSON.stringify(results),
    contentType: 'application/sparql-results+json',
    status: 200,
    executionTime: 12,
  });
}
