import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeEntity } from '../../database/entities/employee.entity';
import { WorkersRepository } from './workers.repository';
import { WorkersService } from './workers.service';
import { WorkersController } from './workers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeEntity])],
  providers: [WorkersRepository, WorkersService],
  controllers: [WorkersController],
  exports: [WorkersService],
})
export class WorkersModule {}