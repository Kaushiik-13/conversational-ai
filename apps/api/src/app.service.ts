import { Injectable } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  service: 'automotive-search-api';
  timestamp: string;
}

@Injectable()
export class AppService {
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'automotive-search-api',
      timestamp: new Date().toISOString(),
    };
  }
}
