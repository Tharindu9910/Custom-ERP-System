import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, type ReadStream } from 'fs';
import { mkdir, stat, writeFile } from 'fs/promises';
import { dirname, join, normalize, resolve } from 'path';

/**
 * Where uploaded files live. Local disk for now (UPLOAD_DIR); swapping to object
 * storage later only changes this class. Keys are relative paths we generate, never
 * user input.
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('UPLOAD_DIR') ?? 'uploads');
  }

  async save(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data, { flag: 'wx' });
  }

  async open(key: string): Promise<ReadStream | null> {
    const path = this.pathFor(key);
    try {
      await stat(path);
    } catch {
      return null;
    }
    return createReadStream(path);
  }

  private pathFor(key: string): string {
    const path = normalize(join(this.root, key));
    if (!path.startsWith(this.root)) throw new Error('Invalid storage key');
    return path;
  }
}
