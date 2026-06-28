import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchEntity } from '../../database/entities/branch.entity';
import { BranchConfigEntity } from '../../database/entities/branch-config.entity';
import { BranchesRepository } from './branches.repository';
import { BranchesService } from './branches.service';
import { BranchesController } from './branches.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BranchEntity, BranchConfigEntity])],
  providers: [BranchesRepository, BranchesService],
  controllers: [BranchesController],
  exports: [BranchesService],
})
export class BranchesModule {}