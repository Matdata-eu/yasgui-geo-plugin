import { describe, it, expect } from 'vitest';
import { renderPopup, POPUP_OPTIONS } from '../src/popup.js';

describe('renderPopup', () => {
  it('uses textContent for hostile values (no XSS)', () => {
    const props = {
      name: { type: 'literal', value: '<script>alert(1)</script>' },
    };
    const el = renderPopup(props);
    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toContain('<script>alert(1)</script>');
  });

  it('renders IRIs as anchors with rel=noopener', () => {
    const props = {
      page: { type: 'uri', value: 'https://example.org/x' },
    };
    const el = renderPopup(props);
    const a = el.querySelector('a');
    expect(a).not.toBeNull();
    expect(a.href).toBe('https://example.org/x');
    expect(a.rel).toContain('noopener');
  });

  it('renders image URIs as <img>', () => {
    const props = { thumb: { type: 'uri', value: 'https://example.org/pic.png' } };
    const el = renderPopup(props);
    expect(el.querySelector('img')).not.toBeNull();
  });

  it('respects skip option', () => {
    const props = { secret: { type: 'literal', value: 'hide-me' }, ok: { type: 'literal', value: 'show' } };
    const el = renderPopup(props, { skip: ['secret'] });
    expect(el.textContent).not.toContain('hide-me');
    expect(el.textContent).toContain('show');
  });

  it('lets long IRIs and literals wrap instead of overflowing', () => {
    const props = {
      s: { type: 'uri', value: 'https://example.org/' + 'a'.repeat(200) },
      v: { type: 'literal', value: 'b'.repeat(100) },
    };
    const el = renderPopup(props);
    expect(el.querySelector('a').style.overflowWrap).toBe('anywhere');
    for (const td of el.querySelectorAll('td')) expect(td.style.overflowWrap).toBe('anywhere');
  });

  it('collapses geometry literals with a show more / show less toggle', () => {
    const WKT = 'http://www.opengis.net/ont/geosparql#wktLiteral';
    const wkt = 'LINESTRING(' + Array.from({ length: 40 }, (_, i) => `4.${i} 50.${i}`).join(', ') + ')';
    const el = renderPopup({ geom: { type: 'literal', datatype: WKT, value: wkt } }, { geometryDatatypes: [WKT] });
    expect(el.textContent).not.toContain(wkt);
    el.querySelector('button').click();
    expect(el.textContent).toContain(wkt);
    expect(el.querySelector('button').textContent).toBe('(show less)');
    el.querySelector('button').click();
    expect(el.textContent).not.toContain(wkt);
  });

  it('does not collapse short literals that are not geometries', () => {
    const el = renderPopup({ v: { type: 'literal', value: 'x'.repeat(100) } });
    expect(el.querySelector('button')).toBeNull();
  });

  it('caps popup width and lets tall content scroll', () => {
    expect(POPUP_OPTIONS.maxWidth).toBeGreaterThan(0);
    const el = renderPopup({ v: { type: 'literal', value: 'x' } });
    expect(el.style.maxHeight).not.toBe('');
    expect(el.style.overflowY).toBe('auto');
    expect(el.querySelector('table.yasgui-geo-popup')).not.toBeNull();
  });
});
