import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

// Rate limits are lifted in setup-env.js, before AppModule is loaded
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

export const BRANCH = {
  naiwala: '00000000-0000-0000-0000-000000000001', // ROOFING, main
  veyangoda: '00000000-0000-0000-0000-000000000002', // WORKSHOP, no override
  thangalla: '00000000-0000-0000-0000-000000000003', // ROOFING_WORKSHOP, override Override@123
} as const;
export type BranchKey = keyof typeof BRANCH;

export const PASSWORDS: Record<string, string> = {
  superadmin: 'Super@123',
  admin: 'Admin@123',
  auditor1: 'Auditor@123',
};
export const OVERRIDE_PASSWORD = 'Override@123';

export interface Res<T = any> {
  status: number;
  body: any;
  data: T;
  code: string | undefined;
  details: any;
}

export interface Caller {
  get<T = any>(url: string): Promise<Res<T>>;
  post<T = any>(url: string, body?: unknown): Promise<Res<T>>;
  put<T = any>(url: string, body?: unknown): Promise<Res<T>>;
  patch<T = any>(url: string, body?: unknown): Promise<Res<T>>;
}

/** One booted app per spec file, with cached logins. */
export class TestApp {
  private tokens = new Map<string, string>();
  constructor(readonly app: INestApplication) {}

  static async boot(): Promise<TestApp> {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = configureApp(
      moduleRef.createNestApplication({ logger: false }),
    );
    await app.init();
    return new TestApp(app);
  }

  get db(): DataSource {
    return this.app.get(DataSource);
  }

  async close(): Promise<void> {
    await this.app.close();
  }

  async login(
    username: string,
    password = PASSWORDS[username] ?? 'Dev@1234',
  ): Promise<Res> {
    return wrap(
      await request(this.app.getHttpServer())
        .post('/auth/login')
        .send({ username, password }),
    );
  }

  async token(username: string, password?: string): Promise<string> {
    const cached = this.tokens.get(username);
    if (cached) return cached;
    const r = await this.login(username, password);
    if (r.status !== 200)
      throw new Error(
        `login ${username} → ${r.status} ${JSON.stringify(r.body)}`,
      );
    this.tokens.set(username, r.data.accessToken);
    return r.data.accessToken;
  }

  forget(username: string): void {
    this.tokens.delete(username);
  }

  /** Calls as a user; `branch` sets X-Branch-Id (how head office picks a branch). */
  as(username: string, opts: { branch?: string; token?: string } = {}): Caller {
    const server = this.app.getHttpServer();
    const send = async (
      method: 'get' | 'post' | 'put' | 'patch',
      url: string,
      body?: unknown,
    ) => {
      const once = async () => {
        const token = opts.token ?? (await this.token(username));
        let req = request(server)
          [method](url)
          .set('authorization', `Bearer ${token}`);
        if (opts.branch)
          req = req.set(
            'x-branch-id',
            BRANCH[opts.branch as BranchKey] ?? opts.branch,
          );
        if (body !== undefined) req = req.send(body as object);
        return wrap(await req);
      };
      const res = await once();
      // A cached login can be revoked by another client of the same user (refresh-token
      // replay revokes every session); sign in again once, as the web app does
      if (res.status === 401 && !opts.token) {
        this.forget(username);
        return once();
      }
      return res;
    };
    return {
      get: (url) => send('get', url),
      post: (url, body) => send('post', url, body ?? {}),
      put: (url, body) => send('put', url, body ?? {}),
      patch: (url, body) => send('patch', url, body ?? {}),
    };
  }

  /** Multipart upload of a design photo. */
  async upload(
    username: string,
    file: Buffer,
    filename = 'design.png',
    contentType = 'image/png',
    branch?: BranchKey,
  ): Promise<Res> {
    let req = request(this.app.getHttpServer())
      .post('/attachments')
      .set('authorization', `Bearer ${await this.token(username)}`);
    if (branch) req = req.set('x-branch-id', BRANCH[branch]);
    return wrap(
      await req
        .field('purpose', 'DESIGN_PHOTO')
        .attach('file', file, { filename, contentType }),
    );
  }

  /** Ticks or unticks one permission for a role on Role Permissions, as the Super Admin. */
  async setGrant(role: string, action: string, granted: boolean): Promise<Res> {
    const [perm] = await this.sql<{ permission_id: string }>(
      `SELECT permission_id FROM permission WHERE action = $1`,
      [action],
    );
    if (!perm) throw new Error(`no permission ${action}`);
    return this.as('superadmin').patch('/permissions/roles', {
      role,
      updates: [{ permission_id: perm.permission_id, granted }],
    });
  }

  /** Runs `fn` while `role` holds `action`, then restores what the role had. */
  async withGrant<T>(role: string, action: string, fn: () => Promise<T>): Promise<T> {
    const [had] = await this.sql<{ granted: boolean }>(
      `SELECT rp.granted FROM role_permission rp JOIN permission p ON p.permission_id = rp.permission_id
       WHERE rp.role = $1 AND p.action = $2`,
      [role, action],
    );
    const set = await this.setGrant(role, action, true);
    if (set.status !== 200) throw new Error(`grant ${action} to ${role} → ${set.status} ${JSON.stringify(set.body)}`);
    try {
      return await fn();
    } finally {
      await this.setGrant(role, action, had?.granted ?? false);
    }
  }

  async sql<T = any>(query: string, params: unknown[] = []): Promise<T[]> {
    return this.db.query(query, params);
  }

  async stock(branch: BranchKey, sku: string): Promise<number> {
    const rows = await this.sql<{ quantity: string }>(
      `SELECT s.quantity FROM branch_stock s JOIN item i ON i.item_id = s.item_id WHERE s.branch_id = $1 AND i.sku = $2`,
      [BRANCH[branch], sku],
    );
    return rows.length ? Number(rows[0].quantity) : 0;
  }

  /** Held for open orders (Docs/decisions/0003). */
  async reserved(branch: BranchKey, sku: string): Promise<number> {
    const rows = await this.sql<{ reserved_quantity: string }>(
      `SELECT s.reserved_quantity FROM branch_stock s JOIN item i ON i.item_id = s.item_id WHERE s.branch_id = $1 AND i.sku = $2`,
      [BRANCH[branch], sku],
    );
    return rows.length ? Number(rows[0].reserved_quantity) : 0;
  }

  async itemId(sku: string): Promise<string> {
    const rows = await this.sql<{ item_id: string }>(
      `SELECT item_id FROM item WHERE sku = $1`,
      [sku],
    );
    if (!rows.length) throw new Error(`no item ${sku}`);
    return rows[0].item_id;
  }
}

function wrap(r: request.Response): Res {
  // Keep the raw text when the body is not JSON, so failures show what came back
  const body =
    r.body && Object.keys(r.body).length
      ? r.body
      : r.text
        ? { text: r.text }
        : {};
  return {
    status: r.status,
    body,
    data: body.data,
    code: body.error?.code,
    details: body.error?.details,
  };
}
