// Gives an sql.js database the small part of node:sqlite's DatabaseSync
// interface that store.js uses, so the same storage code runs in a browser.
export function adaptSqlJs(db) {
  const bind = (statement, args) => {
    if (!args.length) return;
    const named = args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]);
    statement.bind(named ? args[0] : args.map((v) => (v === undefined ? null : v)));
  };
  const lastId = () => db.exec('SELECT last_insert_rowid()')[0].values[0][0];

  return {
    exec(sql) {
      db.run(sql); // runs every statement in the string
    },
    prepare(sql) {
      const using = (args, fn) => {
        const statement = db.prepare(sql);
        try {
          bind(statement, args);
          return fn(statement);
        } finally {
          statement.free();
        }
      };
      return {
        run: (...args) => using(args, (st) => {
          st.step();
          return { changes: db.getRowsModified(), lastInsertRowid: lastId() };
        }),
        get: (...args) => using(args, (st) => (st.step() ? st.getAsObject() : undefined)),
        all: (...args) => using(args, (st) => {
          const rows = [];
          while (st.step()) rows.push(st.getAsObject());
          return rows;
        }),
      };
    },
    close: () => db.close(),
    /** The whole database as bytes, for saving. */
    export() {
      const bytes = db.export();
      db.run('PRAGMA foreign_keys = ON'); // sql.js reopens the database on export, which resets pragmas
      return bytes;
    },
  };
}
