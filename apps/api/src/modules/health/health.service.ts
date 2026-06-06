import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  async checkDb() {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        database: 'unreachable',
        detail: error instanceof Error ? error.message : 'unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
