import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { ATTACHMENT_PURPOSES } from '@erp/shared';
import { toActor } from '../../common/actor';
import { BranchId, CurrentUser, RequirePermissions } from '../../common/decorators';
import type { RequestUser } from '../../common/types';
import { ZodPipe } from '../../common/zod.pipe';
import { AttachmentsService, MAX_UPLOAD_BYTES, type UploadedImage } from './attachments.service';

const UploadBodySchema = z.object({ purpose: z.enum(ATTACHMENT_PURPOSES) });

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  /** Multipart upload: field "file" (JPEG/PNG/WebP, ≤ 5 MB) and "purpose". */
  @Post()
  @RequirePermissions('create:roofing_order')
  // A little over the limit so an oversize file reaches the service and gets ATT_002
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1 } }))
  upload(
    @UploadedFile() file: UploadedImage | undefined,
    @Body(new ZodPipe(UploadBodySchema)) body: z.infer<typeof UploadBodySchema>,
    @CurrentUser() u: RequestUser,
    @BranchId() b: string | null,
  ) {
    return this.attachments.upload(file, body.purpose, toActor(u, b));
  }

  @Get(':id/file')
  file(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: RequestUser, @BranchId() b: string | null) {
    return this.attachments.openFile(id, toActor(u, b));
  }
}
