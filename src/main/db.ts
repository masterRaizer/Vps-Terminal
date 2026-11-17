import Database from 'better-sqlite3'

export type Db = Database.Database

const MIGRATIONS: string[] = [
  `CREATE TABLE groups (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     parent_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
     color TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE hosts (
     id TEXT PRIMARY KEY,
     label TEXT NOT NULL,
     address TEXT NOT NULL,
     port INTEGER NOT NULL DEFAULT 22,
     username TEXT NOT NULL,
     auth TEXT NOT NULL CHECK (auth IN ('password','key','agent')),
     key_id TEXT,
     group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
     color TEXT,
     tags TEXT NOT NULL DEFAULT '[]',
     favorite INTEGER NOT NULL DEFAULT 0,
     notes TEXT NOT NULL DEFAULT '',
     has_password INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     last_connected_at INTEGER
   );
   CREATE INDEX hosts_group ON hosts(group_id);`
]

export function openDb(file: string): Db {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  const version = db.pragma('user_version', { simple: true }) as number
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
  return db
}
