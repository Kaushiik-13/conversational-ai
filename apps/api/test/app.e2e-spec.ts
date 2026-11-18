import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { HealthResponse } from './../src/app.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.DATABASE_URL ??=
      'postgresql://automotive_app:test-only@127.0.0.1:1/automotive_search';
    process.env.ACCESS_TOKEN_SECRET ??=
      'test-access-secret-with-at-least-32-bytes';
    process.env.REFRESH_TOKEN_SECRET ??=
      'test-refresh-secret-with-at-least-32-bytes';
    process.env.ALLOWED_ORIGINS ??= 'http://localhost:4200';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((response) => {
        const body = response.body as HealthResponse;

        expect(body.status).toBe('ok');
        expect(body.service).toBe('automotive-search-api');
        expect(typeof body.timestamp).toBe('string');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
