import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { toBranchDate, type AttachmentPurpose } from '@erp/shared';
import type { Actor } from '../../common/actor';
import { ERR } from '../../common/errors';
import { StorageService } from './storage.service';

export interface UploadedImage {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface AttachmentDto {
  attachment_id: string;
  file_name: string;
  file_type: string;
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Checks the file really is the image type it claims to be (magic bytes). */
function sniffImage(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Design photos and other files. An upload is unlinked until the order that uses it
 * is saved; it is then linked to the order line (entity_type 'order_line').
 */
@Injectable()
export class AttachmentsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly storage: StorageService,
  ) {}

  async upload(file: UploadedImage | undefined, purpose: AttachmentPurpose, actor: Actor): Promise<AttachmentDto> {
    if (!file || file.size === 0 || file.size > MAX_UPLOAD_BYTES) throw new BadRequestException(ERR.ATTACHMENT_INVALID);
    const type = sniffImage(file.buffer);
    if (!type) throw new BadRequestException(ERR.ATTACHMENT_INVALID);

    const id = randomUUID();
    const key = `${purpose.toLowerCase()}/${toBranchDate().slice(0, 7)}/${id}.${EXT[type]}`;
    await this.storage.save(key, file.buffer);
    const name = file.originalname.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || `photo.${EXT[type]}`;
    await this.ds.query(
      `INSERT INTO attachment (attachment_id, purpose, file_name, file_type, file_url, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, purpose, name, type, key, actor.user_id],
    );
    return { attachment_id: id, file_name: name, file_type: type };
  }

  /** The uploader can always read their file; once linked, anyone at the order's branch can. */
  async openFile(id: string, actor: Actor): Promise<StreamableFile> {
    const rows: { file_url: string; file_type: string; file_name: string }[] = await this.ds.query(
      `SELECT a.file_url, a.file_type, a.file_name FROM attachment a
       LEFT JOIN order_line l ON a.entity_type = 'order_line' AND l.line_id = a.entity_id
       LEFT JOIN "order" o ON o.order_id = l.order_id
       WHERE a.attachment_id = $1 AND (a.uploaded_by = $2 OR o.branch_id = $3)`,
      [id, actor.user_id, actor.branch_id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException(ERR.ATTACHMENT_NOT_FOUND);
    const stream = await this.storage.open(row.file_url);
    if (!stream) throw new NotFoundException(ERR.ATTACHMENT_NOT_FOUND);
    return new StreamableFile(stream, { type: row.file_type, disposition: `inline; filename="${row.file_name}"` });
  }

  /**
   * Links design photos to the lines that use them. A photo may be the actor's own
   * unlinked upload, or one already on a line of the same order (kept in an edit).
   */
  async linkToLines(em: EntityManager, orderId: string, links: { attachment_id: string; line_id: string }[], actor: Actor): Promise<void> {
    for (const link of links) {
      const rows: { attachment_id: string }[] = await em.query(
        `SELECT a.attachment_id FROM attachment a
         LEFT JOIN order_line l ON a.entity_type = 'order_line' AND l.line_id = a.entity_id
         WHERE a.attachment_id = $1 AND a.purpose = 'DESIGN_PHOTO'
           AND ((a.entity_id IS NULL AND a.uploaded_by = $2) OR l.order_id = $3)
         FOR UPDATE OF a`,
        [link.attachment_id, actor.user_id, orderId],
      );
      if (!rows[0]) throw new BadRequestException(ERR.ATTACHMENT_NOT_FOUND);
      await em.query(`UPDATE attachment SET entity_type = 'order_line', entity_id = $2 WHERE attachment_id = $1`, [link.attachment_id, link.line_id]);
    }
  }
}
