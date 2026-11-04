import { Injectable, Logger } from '@nestjs/common';
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
      // The reason stays in the server log; a probe shouldn't see connection details
      new Logger(HealthService.name).error(error instanceof Error ? error.message : 'unknown error');
      return {
        status: 'error',
        database: 'unreachable',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
