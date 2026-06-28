import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkerEntity } from '../../database/entities/worker.entity';
import { WorkersRepository } from './workers.repository';
import { WorkersService } from './workers.service';
import { WorkersController } from './workers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WorkerEntity])],
  providers: [WorkersRepository, WorkersService],
  controllers: [WorkersController],
  exports: [WorkersService],
})
export class WorkersModule {}