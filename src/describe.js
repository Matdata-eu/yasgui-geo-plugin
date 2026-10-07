// Ctrl+click (Cmd+click on macOS) "describe" support, mirroring the table
// plugin: Ctrl+click shows the triples where an IRI is the subject,
// Ctrl+Shift+click the triples where it is the object. The triples are fetched
// with a background query (yasr.executeQuery) and shown in a modal, so the
// current results stay on the map.
//
// All values are inserted via textContent to prevent XSS from hostile endpoints.

/** Maximum number of rows fetched per describe query. */
export const DESCRIBE_LIMIT = 1000;

const SAFE_LOCAL_NAME = /^[A-Za-z0-9_](?:[A-Za-z0-9_\-.]*[A-Za-z0-9_-])?$/;
const SAFE_PREFIX = /^(?:[A-Za-z][A-Za-z0-9_\-.]*[A-Za-z0-9_-]|[A-Za-z])?$/;
const UNSAFE_IRI_CHARS = /[<>"{}|\\^`\s]/g;

const isIRI = (binding) => binding && (binding.type === 'uri' || binding.type === 'iri');

/**
 * True when a mouse event asks for a describe (Ctrl, or Cmd on macOS).
 * @param {MouseEvent} ev
 * @returns {boolean}
 */
export const isDescribeClick = (ev) => !!(ev && (ev.ctrlKey || ev.metaKey));

/**
 * Direction requested by a describe click: Shift asks for the triples where
 * the IRI is the object.
 * @param {MouseEvent} ev
 * @returns {'subject'|'object'}
 */
export const describeDirection = (ev) => (ev?.shiftKey ? 'object' : 'subject');

/**
 * Keep only well-formed prefix declarations.
 * @param {unknown} prefixes
 * @returns {Record<string, string>}
 */
export const sanitizePrefixes = (prefixes) => {
  const result = {};
  if (!prefixes || typeof prefixes !== 'object') return result;
  for (const [prefix, namespace] of Object.entries(prefixes)) {
    if (typeof namespace !== 'string' || !namespace || /[<>"{}|\\^`\s]/.test(namespace)) continue;
    if (!SAFE_PREFIX.test(prefix)) continue;
    result[prefix] = namespace;
  }
  return result;
};

/**
 * Abbreviate an IRI with the longest matching prefix, or null when none fits.
 * @param {string} iri
 * @param {Record<string, string>} prefixes
 * @returns {string|null}
 */
export const toPrefixedName = (iri, prefixes) => {
  let best = null;
  for (const [prefix, namespace] of Object.entries(prefixes)) {
    if (iri.startsWith(namespace) && (!best || namespace.length > best.namespace.length)) {
      best = { prefix, namespace };
    }
  }
  if (!best) return null;
  const local = iri.substring(best.namespace.length);
  if (local !== '' && !SAFE_LOCAL_NAME.test(local)) return null;
  return `${best.prefix}:${local}`;
};

const toSparqlTerm = (iri, prefixes) =>
  toPrefixedName(iri, prefixes) ?? `<${iri.replace(UNSAFE_IRI_CHARS, encodeURIComponent)}>`;

/**
 * Build the SELECT query listing the triples where `iri` is the subject
 * (`?p ?o`) or the object (`?s ?p`). A SELECT is used rather than a CONSTRUCT
 * so every endpoint answers with SPARQL JSON, which needs no RDF parser.
 * @param {string} iri
 * @param {'subject'|'object'} direction
 * @param {Record<string, string>} [prefixes]
 * @returns {string}
 */
export const buildDescribeQuery = (iri, direction, prefixes = {}) => {
  const safePrefixes = sanitizePrefixes(prefixes);
  const term = toSparqlTerm(iri, safePrefixes);
  const body = direction === 'object'
    ? `SELECT ?s ?p WHERE {\n  ?s ?p ${term} .\n}`
    : `SELECT ?p ?o WHERE {\n  ${term} ?p ?o .\n}`;
  const prefixLines = Object.entries(safePrefixes)
    .map(([prefix, namespace]) => `PREFIX ${prefix}: <${namespace}>`)
    .join('\n');
  const query = `${body}\nLIMIT ${DESCRIBE_LIMIT}`;
  return prefixLines ? `${prefixLines}\n\n${query}` : query;
};

/**
 * Extract the SPARQL JSON bindings from a yasr.executeQuery response, which is
 * a fetch-like object exposing `content` and/or `text()`.
 * @param {unknown} response
 * @returns {Promise<Array<Object>>}
 */
export const parseDescribeResponse = async (response) => {
  let json = response;
  if (typeof response === 'string') {
    json = JSON.parse(response);
  } else if (response && !response.results) {
    const raw = typeof response.content === 'string'
      ? response.content
      : (typeof response.text === 'function' ? await response.text() : '');
    json = JSON.parse(raw);
  }
  const bindings = json?.results?.bindings;
  if (!Array.isArray(bindings)) throw new Error('Unexpected response: no SPARQL JSON bindings');
  return bindings;
};

/**
 * The entity a feature row is about: the first IRI binding of the row.
 * @param {Object} properties - SPARQL bindings of the row
 * @returns {string|null}
 */
export const findEntityIri = (properties) => {
  for (const binding of Object.values(properties || {})) {
    if (isIRI(binding)) return binding.value;
  }
  return null;
};

/**
 * Prefixes declared in the main query, falling back to the ones YASR knows.
 * @param {Object} yasr
 * @returns {Record<string, string>}
 */
export const getQueryPrefixes = (yasr) => {
  try {
    const yasqe = yasr?.yasgui?.tab?.yasqe || yasr?.tab?.yasqe;
    if (yasqe && typeof yasqe.getPrefixesFromQuery === 'function') {
      return sanitizePrefixes(yasqe.getPrefixesFromQuery());
    }
    if (typeof yasr?.getPrefixes === 'function') return sanitizePrefixes(yasr.getPrefixes());
  } catch (error) {
    console.warn('yasgui-geo-plugin: could not read query prefixes', error);
  }
  return {};
};

const directionLabel = (direction) => (direction === 'object' ? 'as object' : 'as subject');

/**
 * Modal showing the triples of a described IRI. One instance is reused for
 * consecutive describes; a new describe aborts the previous one. IRIs
 * Ctrl+clicked inside the modal are kept in a history that the header's back,
 * forward and back-to-start buttons (and Alt+←/→) walk through.
 */
export class DescribeModal {
  /**
   * @param {Object} yasr - YASR instance exposing executeQuery
   * @param {Document} [doc]
   */
  constructor(yasr, doc = document) {
    this.yasr = yasr;
    this.doc = doc;
    this.backdrop = null;
    this.abortController = null;
    /** @type {Array<{iri: string, direction: 'subject'|'object'}>} */
    this.history = [];
    this.historyIndex = -1;
    this.onKeyDown = (ev) => {
      if (ev.key === 'Escape') this.close();
      else if (ev.altKey && ev.key === 'ArrowLeft' && this.canGoBack()) {
        ev.preventDefault();
        this.back();
      } else if (ev.altKey && ev.key === 'ArrowRight' && this.canGoForward()) {
        ev.preventDefault();
        this.forward();
      }
    };
  }

  /**
   * Fetch and show the triples where `iri` is the subject or the object.
   * Starts a fresh navigation history with this IRI as its first entry.
   * @param {string} iri
   * @param {'subject'|'object'} direction
   * @returns {Promise<void>}
   */
  describe(iri, direction) {
    this.history = [{ iri, direction }];
    this.historyIndex = 0;
    return this.load();
  }

  /**
   * Describe an IRI reached from the modal itself, adding it to the history.
   * Entries after the current one (left by going back) are dropped.
   * @param {string} iri
   * @param {'subject'|'object'} direction
   * @returns {Promise<void>}
   */
  navigate(iri, direction) {
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push({ iri, direction });
    this.historyIndex = this.history.length - 1;
    return this.load();
  }

  /** True when there is a previous entry in the history. */
  canGoBack() {
    return this.historyIndex > 0;
  }

  /** True when there is a next entry in the history. */
  canGoForward() {
    return this.historyIndex < this.history.length - 1;
  }

  /** Show the previous entry of the history. */
  back() {
    return this.goTo(this.historyIndex - 1);
  }

  /** Show the next entry of the history. */
  forward() {
    return this.goTo(this.historyIndex + 1);
  }

  /** Show the first entry of the history: the original describe. */
  backToStart() {
    return this.goTo(0);
  }

  /** @private */
  goTo(index) {
    if (index < 0 || index >= this.history.length || index === this.historyIndex) return Promise.resolve();
    this.historyIndex = index;
    return this.load();
  }

  /** @private Fetch and show the current history entry. */
  async load() {
    const { iri, direction } = this.history[this.historyIndex];
    const prefixes = getQueryPrefixes(this.yasr);
    const body = this.open(iri, direction, prefixes);
    body.appendChild(this.message('Loading…'));

    if (typeof this.yasr?.executeQuery !== 'function') {
      this.replaceBody(body, this.message('Background queries are not available in this Yasgui setup.', true));
      return;
    }
    const controller = new AbortController();
    this.abortController = controller;
    try {
      const response = await this.yasr.executeQuery(buildDescribeQuery(iri, direction, prefixes), {
        acceptHeader: 'application/sparql-results+json',
        signal: controller.signal,
      });
      const bindings = await parseDescribeResponse(response);
      if (controller.signal.aborted) return;
      this.replaceBody(body, this.renderResults(bindings, direction, prefixes));
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return;
      console.error('yasgui-geo-plugin: describe query failed', iri, direction, error);
      this.replaceBody(body, this.message(`Query failed: ${error?.message || error}`, true));
    } finally {
      if (this.abortController === controller) this.abortController = null;
    }
  }

  /** Close the modal and abort a running query. */
  close() {
    this.abortController?.abort();
    this.abortController = null;
    this.backdrop?.remove();
    this.backdrop = null;
    this.doc.removeEventListener('keydown', this.onKeyDown);
  }

  /** @private */
  open(iri, direction, prefixes) {
    this.close();
    const doc = this.doc;
    const backdrop = doc.createElement('div');
    backdrop.className = 'yasgui-geo-describe-backdrop';
    backdrop.addEventListener('click', (ev) => {
      if (ev.target === backdrop) this.close();
    });

    const modal = doc.createElement('div');
    modal.className = 'yasgui-geo-describe';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', `Triples of ${iri} ${directionLabel(direction)}`);

    const header = doc.createElement('div');
    header.className = 'yasgui-geo-describe-header';
    const title = doc.createElement('div');
    title.className = 'yasgui-geo-describe-title';
    const name = doc.createElement('a');
    name.href = iri;
    name.target = '_blank';
    name.rel = 'noopener noreferrer';
    name.title = iri;
    name.textContent = toPrefixedName(iri, prefixes) ?? iri;
    const dir = doc.createElement('span');
    dir.className = 'yasgui-geo-describe-direction';
    dir.textContent = ` ${directionLabel(direction)}`;
    title.append(name, dir);

    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'yasgui-geo-describe-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.close());
    header.append(this.renderNavigation(), title, closeBtn);

    const body = doc.createElement('div');
    body.className = 'yasgui-geo-describe-body';

    const footer = doc.createElement('div');
    footer.className = 'yasgui-geo-describe-footer';
    footer.textContent = 'Ctrl+click an IRI to describe it, Ctrl+Shift+click for the triples where it is the object. Alt+←/→ to go back or forward.';

    modal.append(header, body, footer);
    backdrop.appendChild(modal);
    doc.body.appendChild(backdrop);
    this.backdrop = backdrop;
    doc.addEventListener('keydown', this.onKeyDown);
    closeBtn.focus();
    return body;
  }

  /** @private Back to start, back and forward buttons. */
  renderNavigation() {
    const doc = this.doc;
    const nav = doc.createElement('div');
    nav.className = 'yasgui-geo-describe-nav';
    const button = (cls, text, label, enabled, onClick) => {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = `yasgui-geo-describe-nav-btn ${cls}`;
      btn.textContent = text;
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.disabled = !enabled;
      btn.addEventListener('click', onClick);
      return btn;
    };
    nav.append(
      button('yasgui-geo-describe-start', '⏮', 'Back to start', this.canGoBack(), () => this.backToStart()),
      button('yasgui-geo-describe-back', '◀', 'Back (Alt+←)', this.canGoBack(), () => this.back()),
      button('yasgui-geo-describe-forward', '▶', 'Forward (Alt+→)', this.canGoForward(), () => this.forward()),
    );
    return nav;
  }

  /** @private */
  replaceBody(body, content) {
    body.textContent = '';
    body.appendChild(content);
  }

  /** @private */
  message(text, isError = false) {
    const p = this.doc.createElement('p');
    p.className = isError ? 'yasgui-geo-describe-message yasgui-geo-describe-error' : 'yasgui-geo-describe-message';
    p.textContent = text;
    return p;
  }

  /** @private */
  renderResults(bindings, direction, prefixes) {
    const doc = this.doc;
    const wrapper = doc.createElement('div');
    if (bindings.length === 0) {
      wrapper.appendChild(this.message('No triples found.'));
      return wrapper;
    }
    const columns = direction === 'object' ? ['s', 'p'] : ['p', 'o'];
    const headers = direction === 'object' ? ['Subject', 'Predicate'] : ['Predicate', 'Object'];
    const table = doc.createElement('table');
    table.className = 'yasgui-geo-describe-table';
    const thead = doc.createElement('thead');
    const headRow = doc.createElement('tr');
    for (const label of headers) {
      const th = doc.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    const tbody = doc.createElement('tbody');
    for (const row of bindings) {
      const tr = doc.createElement('tr');
      for (const col of columns) {
        const td = doc.createElement('td');
        td.appendChild(this.renderTerm(row[col], prefixes));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    wrapper.appendChild(table);
    const count = doc.createElement('p');
    count.className = 'yasgui-geo-describe-message';
    count.textContent = bindings.length >= DESCRIBE_LIMIT
      ? `Showing the first ${DESCRIBE_LIMIT} triples.`
      : `${bindings.length} triple${bindings.length === 1 ? '' : 's'}`;
    wrapper.appendChild(count);
    return wrapper;
  }

  /** @private */
  renderTerm(term, prefixes) {
    const doc = this.doc;
    if (!term) return doc.createTextNode('');
    if (isIRI(term)) {
      const a = doc.createElement('a');
      a.href = term.value;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = term.value;
      a.textContent = toPrefixedName(term.value, prefixes) ?? term.value;
      a.addEventListener('click', (ev) => {
        if (!isDescribeClick(ev)) return;
        ev.preventDefault();
        this.navigate(term.value, describeDirection(ev));
      });
      return a;
    }
    const span = doc.createElement('span');
    if (term.type === 'bnode') {
      span.textContent = `_:${term.value}`;
      return span;
    }
    span.textContent = term.value;
    const lang = term['xml:lang'];
    const suffix = lang
      ? `@${lang}`
      : (term.datatype ? `^^${toPrefixedName(term.datatype, prefixes) ?? `<${term.datatype}>`}` : '');
    if (suffix) {
      const meta = doc.createElement('span');
      meta.className = 'yasgui-geo-describe-meta';
      meta.textContent = suffix;
      span.append(' ', meta);
    }
    return span;
  }
}
