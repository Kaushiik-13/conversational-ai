import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  accessKey,
  applyFieldAccess,
  collectAccessMappings,
  type FieldAccessDecision,
  type ModelDocument,
} from './model-access';

const fixture = () =>
  JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../../packages/cube-query/test/fixtures/automotive-model.json',
      ),
      'utf8',
    ),
  ) as ModelDocument;

const COST = { resource_type: 'catalog.part', field_name: 'costUsd' };
const SUPPLIER = {
  resource_type: 'catalog.part',
  field_name: 'supplierStatus',
};
const decide = (cost: FieldAccessDecision, supplier: FieldAccessDecision) =>
  new Map<string, FieldAccessDecision>([
    [accessKey(COST), cost],
    [accessKey(SUPPLIER), supplier],
  ]);

describe('model field access', () => {
  it('finds the distinct access mappings a model declares', () => {
    const mappings = collectAccessMappings(fixture());
    expect(mappings).toHaveLength(2);
    expect(mappings).toEqual(expect.arrayContaining([COST, SUPPLIER]));
  });

  it('keeps the very same document when everything is allowed', () => {
    const document = fixture();
    const result = applyFieldAccess(document, decide('allow', 'allow'));
    expect(result.document).toBe(document);
    expect(result.hidden).toEqual([]);
  });

  it('hides every cost field, in every section, when cost is omitted', () => {
    const document = fixture();
    const before = JSON.stringify(document);
    const result = applyFieldAccess(document, decide('omit', 'allow'));

    expect(result.hidden).toEqual([
      'average_cost_usd',
      'cost_usd',
      'max_cost_usd',
      'min_cost_usd',
      'total_cost_usd',
    ]);
    for (const name of [
      'total_cost_usd',
      'average_cost_usd',
      'min_cost_usd',
      'max_cost_usd',
    ]) {
      expect(result.document.measures[name]).toBeUndefined();
    }
    expect(result.document.dimensions.cost_usd).toBeUndefined();
    expect(result.document.record_fields.cost_usd).toBeUndefined();
    // Everything else stays, including the other guarded field.
    expect(result.document.measures.part_count).toBeDefined();
    expect(result.document.measures.total_weight_kg).toBeDefined();
    expect(result.document.dimensions.supplier_status).toBeDefined();
    expect(result.document.dimensions.region).toBeDefined();
    // The original is never modified.
    expect(JSON.stringify(document)).toBe(before);
  });

  it('hides the supplier status independently of cost', () => {
    const result = applyFieldAccess(fixture(), decide('allow', 'omit'));
    expect(result.hidden).toEqual(['supplier_status']);
    expect(result.document.dimensions.supplier_status).toBeUndefined();
    expect(result.document.record_fields.supplier_status).toBeUndefined();
    expect(result.document.dimensions.cost_usd).toBeDefined();
  });

  it('treats a masked field as hidden', () => {
    const result = applyFieldAccess(fixture(), decide('mask', 'allow'));
    expect(result.hidden).toContain('total_cost_usd');
  });

  it('denies a guarded field that has no decision', () => {
    const result = applyFieldAccess(fixture(), new Map());
    expect(result.hidden).toEqual(
      expect.arrayContaining(['total_cost_usd', 'supplier_status']),
    );
  });

  it('never hides a field that declares no access mapping', () => {
    const result = applyFieldAccess(fixture(), new Map());
    expect(result.document.measures.part_count).toBeDefined();
    expect(result.document.dimensions.manufacturer).toBeDefined();
    expect(result.document.lookup_fields.part_number).toBeDefined();
  });
});
