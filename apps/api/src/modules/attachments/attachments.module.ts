import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { StorageService } from './storage.service';

@Module({
  providers: [StorageService, AttachmentsService],
  controllers: [AttachmentsController],
  exports: [AttachmentsService, StorageService],
})
export class AttachmentsModule {}
