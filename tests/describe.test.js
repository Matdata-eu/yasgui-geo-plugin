import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DescribeModal,
  DESCRIBE_LIMIT,
  buildDescribeQuery,
  describeDirection,
  findEntityIri,
  isDescribeClick,
  parseDescribeResponse,
  toPrefixedName,
} from '../src/describe.js';
import { renderPopup } from '../src/popup.js';

const jsonResponse = (bindings) => {
  const content = JSON.stringify({ head: { vars: [] }, results: { bindings } });
  return { ok: true, content, text: async () => content };
};

afterEach(() => {
  // Escape closes every modal a test left open, removing its keydown listener.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  document.body.textContent = '';
});

describe('buildDescribeQuery', () => {
  it('selects the triples where the IRI is the subject', () => {
    const q = buildDescribeQuery('http://example.org/a', 'subject');
    expect(q).toContain('SELECT ?p ?o WHERE {\n  <http://example.org/a> ?p ?o .\n}');
    expect(q).toContain(`LIMIT ${DESCRIBE_LIMIT}`);
  });

  it('selects the triples where the IRI is the object', () => {
    const q = buildDescribeQuery('http://example.org/a', 'object');
    expect(q).toContain('SELECT ?s ?p WHERE {\n  ?s ?p <http://example.org/a> .\n}');
  });

  it('declares the query prefixes and abbreviates the IRI', () => {
    const q = buildDescribeQuery('http://example.org/a', 'subject', { ex: 'http://example.org/' });
    expect(q.startsWith('PREFIX ex: <http://example.org/>\n\n')).toBe(true);
    expect(q).toContain('ex:a ?p ?o');
  });

  it('escapes characters that would break out of the IRI', () => {
    const q = buildDescribeQuery('http://example.org/a> } DROP ALL { <x', 'subject');
    expect(q).not.toContain('a> }');
    expect(q).toContain('%3E');
  });

  it('drops malformed prefixes', () => {
    const q = buildDescribeQuery('http://example.org/a', 'subject', { 'bad prefix': 'http://example.org/', ok: 'http://x/ y' });
    expect(q).not.toContain('PREFIX');
  });
});

describe('helpers', () => {
  it('detects Ctrl and Cmd clicks and the Shift direction', () => {
    expect(isDescribeClick({ ctrlKey: true })).toBe(true);
    expect(isDescribeClick({ metaKey: true })).toBe(true);
    expect(isDescribeClick({})).toBe(false);
    expect(describeDirection({ shiftKey: true })).toBe('object');
    expect(describeDirection({})).toBe('subject');
  });

  it('finds the first IRI binding of a row', () => {
    expect(findEntityIri({
      label: { type: 'literal', value: 'x' },
      s: { type: 'uri', value: 'http://example.org/s' },
      t: { type: 'uri', value: 'http://example.org/t' },
    })).toBe('http://example.org/s');
    expect(findEntityIri({ label: { type: 'literal', value: 'x' } })).toBeNull();
  });

  it('abbreviates with the longest matching prefix', () => {
    const prefixes = { ex: 'http://example.org/', exa: 'http://example.org/a/' };
    expect(toPrefixedName('http://example.org/a/b', prefixes)).toBe('exa:b');
    expect(toPrefixedName('http://other.org/b', prefixes)).toBeNull();
  });

  it('parses yasr responses, strings and parsed JSON', async () => {
    const b = [{ p: { type: 'uri', value: 'http://p' } }];
    expect(await parseDescribeResponse(jsonResponse(b))).toEqual(b);
    expect(await parseDescribeResponse(JSON.stringify({ results: { bindings: b } }))).toEqual(b);
    expect(await parseDescribeResponse({ results: { bindings: b } })).toEqual(b);
    await expect(parseDescribeResponse({ content: '{}' })).rejects.toThrow();
  });
});

describe('DescribeModal', () => {
  it('runs a background query and lists the triples', async () => {
    const executeQuery = vi.fn(async () => jsonResponse([
      { p: { type: 'uri', value: 'http://example.org/label' }, o: { type: 'literal', value: '<b>x</b>', 'xml:lang': 'en' } },
      { p: { type: 'uri', value: 'http://example.org/type' }, o: { type: 'uri', value: 'http://example.org/Area' } },
    ]));
    const yasr = { executeQuery, getPrefixes: () => ({ ex: 'http://example.org/' }) };
    await new DescribeModal(yasr).describe('http://example.org/a', 'subject');

    expect(executeQuery).toHaveBeenCalledTimes(1);
    const [query, opts] = executeQuery.mock.calls[0];
    expect(query).toContain('ex:a ?p ?o');
    expect(opts.acceptHeader).toBe('application/sparql-results+json');

    const modal = document.querySelector('.yasgui-geo-describe');
    expect(modal.querySelector('.yasgui-geo-describe-title').textContent).toBe('ex:a as subject');
    const rows = modal.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('ex:label');
    expect(rows[0].textContent).toContain('@en');
    expect(modal.querySelector('b')).toBeNull();
  });

  it('describes an IRI in the results when it is Ctrl+Shift+clicked', async () => {
    const executeQuery = vi.fn(async () => jsonResponse([
      { p: { type: 'uri', value: 'http://example.org/type' }, o: { type: 'uri', value: 'http://example.org/Area' } },
    ]));
    const modal = new DescribeModal({ executeQuery });
    await modal.describe('http://example.org/a', 'subject');
    const link = [...document.querySelectorAll('tbody a')].find(a => a.textContent === 'http://example.org/Area');
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, shiftKey: true }));
    await vi.waitFor(() => expect(executeQuery).toHaveBeenCalledTimes(2));
    expect(executeQuery.mock.calls[1][0]).toContain('?s ?p <http://example.org/Area>');
    expect(document.querySelectorAll('.yasgui-geo-describe')).toHaveLength(1);
  });

  it('shows an error when the query fails', async () => {
    const yasr = { executeQuery: vi.fn(async () => { throw new Error('boom'); }) };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await new DescribeModal(yasr).describe('http://example.org/a', 'object');
    expect(document.querySelector('.yasgui-geo-describe-error').textContent).toContain('boom');
  });

  it('explains when background queries are unavailable', async () => {
    await new DescribeModal({}).describe('http://example.org/a', 'subject');
    expect(document.querySelector('.yasgui-geo-describe-error').textContent).toContain('not available');
  });

  it('closes on Escape', async () => {
    await new DescribeModal({}).describe('http://example.org/a', 'subject');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.yasgui-geo-describe')).toBeNull();
  });
});

describe('popup IRIs', () => {
  it('call onIriCtrlClick on Ctrl+click and keep plain clicks as links', () => {
    const onIriCtrlClick = vi.fn();
    const el = renderPopup({ s: { type: 'uri', value: 'http://example.org/s' } }, { onIriCtrlClick });
    const a = el.querySelector('a');
    const plain = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(plain);
    expect(onIriCtrlClick).not.toHaveBeenCalled();
    const ctrlShift = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, shiftKey: true });
    a.dispatchEvent(ctrlShift);
    expect(onIriCtrlClick).toHaveBeenCalledWith('http://example.org/s', 'object');
    expect(ctrlShift.defaultPrevented).toBe(true);
  });
});

describe('DescribeModal navigation history', () => {
  const iriResponse = (next) => jsonResponse([
    { p: { type: 'uri', value: 'http://example.org/next' }, o: { type: 'uri', value: next } },
  ]);
  const ctrlClick = async (iri, opts = {}) => {
    const link = await vi.waitFor(() => {
      const found = [...document.querySelectorAll('tbody a')].find(a => a.title === iri);
      if (!found) throw new Error(`no link to ${iri} yet`);
      return found;
    });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, ...opts }));
  };
  const navButton = (cls) => document.querySelector(`.yasgui-geo-describe-${cls}`);
  const title = () => document.querySelector('.yasgui-geo-describe-title').textContent;

  // a -> b -> c, each node linking to the next.
  const setup = async () => {
    const executeQuery = vi.fn(async (query) => {
      if (query.includes('<http://example.org/a>')) return iriResponse('http://example.org/b');
      if (query.includes('<http://example.org/b>')) return iriResponse('http://example.org/c');
      return iriResponse('http://example.org/d');
    });
    const modal = new DescribeModal({ executeQuery });
    await modal.describe('http://example.org/a', 'subject');
    await ctrlClick('http://example.org/b');
    await vi.waitFor(() => expect(title()).toBe('http://example.org/b as subject'));
    await ctrlClick('http://example.org/c', { shiftKey: true });
    await vi.waitFor(() => expect(title()).toBe('http://example.org/c as object'));
    return { modal, executeQuery };
  };

  it('disables back and forward on a fresh describe', async () => {
    await new DescribeModal({ executeQuery: async () => iriResponse('http://example.org/b') })
      .describe('http://example.org/a', 'subject');
    expect(navButton('start').disabled).toBe(true);
    expect(navButton('back').disabled).toBe(true);
    expect(navButton('forward').disabled).toBe(true);
  });

  it('steps back and forward through Ctrl+clicked IRIs, keeping their direction', async () => {
    await setup();
    expect(navButton('back').disabled).toBe(false);
    expect(navButton('forward').disabled).toBe(true);

    navButton('back').click();
    await vi.waitFor(() => expect(title()).toBe('http://example.org/b as subject'));
    expect(navButton('forward').disabled).toBe(false);

    navButton('forward').click();
    await vi.waitFor(() => expect(title()).toBe('http://example.org/c as object'));
    expect(navButton('forward').disabled).toBe(true);
  });

  it('returns to the original describe', async () => {
    const { executeQuery } = await setup();
    navButton('start').click();
    await vi.waitFor(() => expect(title()).toBe('http://example.org/a as subject'));
    expect(executeQuery.mock.calls.at(-1)[0]).toContain('<http://example.org/a> ?p ?o');
    expect(navButton('back').disabled).toBe(true);
    expect(navButton('forward').disabled).toBe(false);
  });

  it('drops the forward steps when a new IRI is Ctrl+clicked after going back', async () => {
    const { modal } = await setup();
    await modal.backToStart();
    await ctrlClick('http://example.org/b');
    await vi.waitFor(() => expect(title()).toBe('http://example.org/b as subject'));
    expect(modal.history.map(e => e.iri)).toEqual(['http://example.org/a', 'http://example.org/b']);
    expect(navButton('forward').disabled).toBe(true);
  });

  it('supports Alt+Left and Alt+Right', async () => {
    await setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }));
    await vi.waitFor(() => expect(title()).toBe('http://example.org/b as subject'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }));
    await vi.waitFor(() => expect(title()).toBe('http://example.org/c as object'));
  });

  it('starts a new history on a describe from outside the modal', async () => {
    const { modal } = await setup();
    await modal.describe('http://example.org/x', 'subject');
    expect(modal.history).toEqual([{ iri: 'http://example.org/x', direction: 'subject' }]);
    expect(navButton('back').disabled).toBe(true);
  });
});
