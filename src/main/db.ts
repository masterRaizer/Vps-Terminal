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
   CREATE INDEX hosts_group ON hosts(group_id);`,
  `ALTER TABLE hosts ADD COLUMN options TEXT NOT NULL DEFAULT '{}';`,
  `CREATE TABLE ssh_keys (
     id TEXT PRIMARY KEY,
     label TEXT NOT NULL,
     type TEXT NOT NULL,
     bits INTEGER,
     public_key TEXT,
     fingerprint TEXT,
     encrypted INTEGER NOT NULL DEFAULT 0,
     has_passphrase INTEGER NOT NULL DEFAULT 0,
     private_enc BLOB NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE identities (
     id TEXT PRIMARY KEY,
     label TEXT NOT NULL,
     username TEXT NOT NULL,
     key_id TEXT REFERENCES ssh_keys(id) ON DELETE SET NULL,
     has_password INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   );
   CREATE TABLE integrations (
     id TEXT PRIMARY KEY,
     kind TEXT NOT NULL,
     name TEXT NOT NULL,
     url TEXT NOT NULL,
     auth_mode TEXT NOT NULL,
     login TEXT NOT NULL DEFAULT '',
     group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
     identity_id TEXT REFERENCES identities(id) ON DELETE SET NULL,
     ssh_port INTEGER NOT NULL DEFAULT 22,
     ssh_user TEXT NOT NULL DEFAULT 'root',
     last_sync_at INTEGER,
     last_error TEXT,
     has_secret INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   );
   ALTER TABLE hosts ADD COLUMN country TEXT;
   ALTER TABLE hosts ADD COLUMN country_source TEXT NOT NULL DEFAULT 'auto';
   ALTER TABLE hosts ADD COLUMN identity_id TEXT REFERENCES identities(id) ON DELETE SET NULL;
   ALTER TABLE hosts ADD COLUMN key_hint TEXT;
   ALTER TABLE hosts ADD COLUMN source TEXT;
   ALTER TABLE hosts ADD COLUMN external_id TEXT;
   CREATE INDEX hosts_source ON hosts(source, external_id);
   UPDATE hosts SET key_hint = substr(notes, 7) WHERE notes LIKE 'Ключ: %' AND auth = 'key';`
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
