// Copyright 2019-2023 Tauri Programme within The Commons Conservancy SPDX-License-Identifier:
// Rationale: docs/CLIENT_COMMENTS.md#line-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L1

import { invoke } from '@tauri-apps/api/core'

export interface QueryResult {
  /** The number of rows affected by the query. */
  rowsAffected: number
  // The last inserted `id`.
  // Rationale: docs/CLIENT_COMMENTS.md#block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L10
  lastInsertId?: number
}

// **Database** The `Database` class serves as the primary interface for communicating with the rust side of the sql plugin.
// Rationale: docs/CLIENT_COMMENTS.md#block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L21
export default class Database {
  path: string
  constructor(path: string) {
    this.path = path
  }

  // **load** A static initializer which connects to the underlying database and returns a `Database` instance once a connect…
  // Rationale: docs/CLIENT_COMMENTS.md#block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L33
  static async load(path: string): Promise<Database> {
    const _path = await invoke<string>('plugin:sql|load', {
      db: path
    })

    return new Database(_path)
  }

  // **get** A static initializer which synchronously returns an instance of the Database class while deferring the actual da…
  // Rationale: docs/CLIENT_COMMENTS.md#block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L56
  static get(path: string): Database {
    return new Database(path)
  }

  // **execute** Passes a SQL expression to the database for execution.
  // Rationale: docs/CLIENT_COMMENTS.md#block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L76
  async execute(query: string, bindValues?: unknown[]): Promise<QueryResult> {
    const [rowsAffected, lastInsertId] = await invoke<[number, number]>(
      'plugin:sql|execute',
      {
        db: this.path,
        query,
        values: bindValues ?? []
      }
    )
    return {
      lastInsertId,
      rowsAffected
    }
  }

  // **select** Passes in a SELECT query to the database for execution.
  // Rationale: docs/CLIENT_COMMENTS.md#block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L123
  async select<T>(query: string, bindValues?: unknown[]): Promise<T> {
    const result = await invoke<T>('plugin:sql|select', {
      db: this.path,
      query,
      values: bindValues ?? []
    })

    return result
  }

  // **close** Closes the database connection pool.
  // Rationale: docs/CLIENT_COMMENTS.md#block-src-tauri-vendor-tauri-plugin-sql-guest-js-index-ts-L151
  async close(db?: string): Promise<boolean> {
    const success = await invoke<boolean>('plugin:sql|close', {
      db
    })
    return success
  }
}
