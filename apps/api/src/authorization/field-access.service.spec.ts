import type { PoolClient } from 'pg';
import { FieldAccessService } from './field-access.service';

describe('FieldAccessService', () => {
  it('omits protected fields denied by the active role', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { field_name: 'costUsd', access: 'omit' },
          { field_name: 'supplierStatus', access: 'omit' },
          { field_name: 'sourceSystem', access: 'omit' },
          { field_name: 'sourceRecordId', access: 'omit' },
        ],
      }),
    } as unknown as PoolClient;
    const service = new FieldAccessService();

    const result = await service.filterCatalogRecord(client, {
      id: 1,
      partName: 'Brake Pad',
      costUsd: '125.50',
      supplierStatus: 'approved',
      sourceSystem: 'erp',
      sourceRecordId: '123',
    });

    expect(result).toEqual({ id: 1, partName: 'Brake Pad' });
  });

  it('keeps protected fields explicitly allowed by the active role', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { field_name: 'costUsd', access: 'allow' },
          { field_name: 'supplierStatus', access: 'allow' },
          { field_name: 'sourceSystem', access: 'allow' },
          { field_name: 'sourceRecordId', access: 'allow' },
        ],
      }),
    } as unknown as PoolClient;
    const service = new FieldAccessService();
    const input = { id: 1, partName: 'Brake Pad', costUsd: '125.50' };

    await expect(service.filterCatalogRecord(client, input)).resolves.toEqual(
      input,
    );
  });
});
