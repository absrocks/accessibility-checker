import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { scanScore } from './score.js';
import { fingerprint } from './urls.js';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL,
  origin TEXT NOT NULL,
  standard TEXT NOT NULL,
  best_practices INTEGER NOT NULL DEFAULT 0,
  viewport TEXT NOT NULL,
  max_pages INTEGER NOT NULL,
  status TEXT NOT NULL,            -- queued | running | done | failed
  error TEXT,
  engine TEXT,
  score INTEGER,
  pages_scanned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  score INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS pages_scan ON pages(scan_id);

CREATE TABLE IF NOT EXISTS rules (
  rule_id TEXT PRIMARY KEY,
  help TEXT,
  description TEXT,
  help_url TEXT,
  tags TEXT
);

-- One row per rule per page: the worst outcome that rule had on that page.
CREATE TABLE IF NOT EXISTS rule_results (
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  outcome TEXT NOT NULL,           -- fail | review | pass | inapplicable
  impact_rank INTEGER NOT NULL DEFAULT 0,
  nodes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page_id, rule_id)
);
CREATE INDEX IF NOT EXISTS rule_results_scan ON rule_results(scan_id);

-- A finding lives across scans; its fingerprint is rule + page + element.
CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  rule_id TEXT NOT NULL,
  url TEXT NOT NULL,
  page_title TEXT,
  selector TEXT,
  html TEXT,
  summary TEXT,
  impact_rank INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,              -- fail | review
  status TEXT NOT NULL DEFAULT 'open',  -- open | dismissed
  dismiss_reason TEXT,
  status_changed_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS findings_rule ON findings(rule_id);

CREATE TABLE IF NOT EXISTS scan_findings (
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  finding_id INTEGER NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  PRIMARY KEY (scan_id, finding_id)
);
CREATE INDEX IF NOT EXISTS scan_findings_finding ON scan_findings(finding_id);
`;

const SORTS = {
  severity: 'f.impact_rank DESC, f.id ASC',
  id: 'f.id ASC',
  url: 'f.url ASC, f.id ASC',
  status: 'f.status ASC, f.impact_rank DESC, f.id ASC',
  rule: 'f.rule_id ASC, f.id ASC',
};

export function openStore(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);

  const now = () => new Date().toISOString();
  const tx = (fn) => {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  const q = (sql) => db.prepare(sql);

  const stmt = {
    insertScan: q(`INSERT INTO scans (url, origin, standard, best_practices, viewport, max_pages, status, engine, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`),
    getScan: q('SELECT * FROM scans WHERE id = ?'),
    insertPage: q('INSERT INTO pages (scan_id, url, title, score, error) VALUES (?, ?, ?, ?, ?)'),
    upsertRule: q(`INSERT INTO rules (rule_id, help, description, help_url, tags) VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(rule_id) DO UPDATE SET help = excluded.help, description = excluded.description,
                     help_url = excluded.help_url, tags = excluded.tags`),
    insertRuleResult: q('INSERT INTO rule_results (scan_id, page_id, rule_id, outcome, impact_rank, nodes) VALUES (?, ?, ?, ?, ?, ?)'),
    findingByPrint: q('SELECT id FROM findings WHERE fingerprint = ?'),
    insertFinding: q(`INSERT INTO findings (fingerprint, rule_id, url, page_title, selector, html, summary, impact_rank, kind, first_seen_at, last_seen_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    touchFinding: q(`UPDATE findings SET page_title = ?, html = ?, summary = ?, impact_rank = ?, kind = ?, last_seen_at = ? WHERE id = ?`),
    linkFinding: q('INSERT OR IGNORE INTO scan_findings (scan_id, page_id, finding_id, kind) VALUES (?, ?, ?, ?)'),
    bumpPages: q('UPDATE scans SET pages_scanned = pages_scanned + 1 WHERE id = ?'),
  };

  return {
    db,
    close: () => db.close(),

    // ---- scans -----------------------------------------------------------

    createScan({ url, origin, standard, bestPractices, viewport, maxPages, engine }) {
      const r = stmt.insertScan.run(url, origin, standard, bestPractices ? 1 : 0, viewport, maxPages, engine, now());
      return stmt.getScan.get(Number(r.lastInsertRowid));
    },

    getScan: (id) => stmt.getScan.get(id),

    listScans(site) {
      return q(`
        SELECT s.*,
          (SELECT COUNT(*) FROM scan_findings sf WHERE sf.scan_id = s.id AND sf.kind = 'fail') AS fail_count,
          (SELECT COUNT(*) FROM scan_findings sf JOIN findings f ON f.id = sf.finding_id
             WHERE sf.scan_id = s.id AND sf.kind = 'fail' AND f.impact_rank = 4) AS critical_count
        FROM scans s
        WHERE ($site IS NULL OR s.origin = $site)
        ORDER BY s.id DESC`).all({ $site: site || null });
    },

    listSites: () => q('SELECT DISTINCT origin FROM scans ORDER BY origin').all().map((r) => r.origin),

    markRunning: (id) => q(`UPDATE scans SET status = 'running', started_at = ? WHERE id = ?`).run(now(), id),

    markFailed: (id, error) =>
      q(`UPDATE scans SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`).run(String(error), now(), id),

    /** Close out a scan: average the page scores, or fail it if no page loaded. */
    finishScan(id) {
      const pages = q('SELECT score, error FROM pages WHERE scan_id = ?').all(id);
      const loaded = pages.filter((p) => !p.error);
      if (!loaded.length) {
        const why = pages[0]?.error || 'No pages were scanned';
        q(`UPDATE scans SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`).run(why, now(), id);
      } else {
        q(`UPDATE scans SET status = 'done', score = ?, finished_at = ? WHERE id = ?`).run(
          scanScore(loaded.map((p) => p.score)),
          now(),
          id,
        );
      }
      return stmt.getScan.get(id);
    },

    /** Scans left queued or running by a previous process can never finish. */
    failInterrupted: () =>
      q(`UPDATE scans SET status = 'failed', error = 'Interrupted: the checker was restarted', finished_at = ?
         WHERE status IN ('queued', 'running')`).run(now()).changes,

    deleteScan(id) {
      return tx(() => {
        const changes = q('DELETE FROM scans WHERE id = ?').run(id).changes;
        // Findings never seen in any remaining scan have nothing to show.
        q('DELETE FROM findings WHERE id NOT IN (SELECT finding_id FROM scan_findings)').run();
        return changes;
      });
    },

    // ---- storing results -------------------------------------------------

    savePage(scanId, result) {
      const at = now();
      return tx(() => {
        if (result.error) {
          stmt.insertPage.run(scanId, result.url, null, null, result.error);
          stmt.bumpPages.run(scanId);
          return;
        }
        const pageId = Number(
          stmt.insertPage.run(scanId, result.url, result.title || null, result.score ?? null, null).lastInsertRowid,
        );
        for (const m of result.meta) {
          stmt.upsertRule.run(m.id, m.help || null, m.description || null, m.helpUrl || null, JSON.stringify(m.tags || []));
        }
        for (const r of result.rules) {
          stmt.insertRuleResult.run(scanId, pageId, r.id, r.outcome, r.impactRank || 0, r.nodes || 0);
        }
        for (const f of result.findings) {
          const print = fingerprint(f.ruleId, result.url, f.selector);
          const existing = stmt.findingByPrint.get(print);
          let findingId;
          if (existing) {
            findingId = existing.id;
            stmt.touchFinding.run(result.title || null, f.html, f.summary || null, f.impactRank || 0, f.kind, at, findingId);
          } else {
            findingId = Number(
              stmt.insertFinding.run(
                print, f.ruleId, result.url, result.title || null, f.selector, f.html,
                f.summary || null, f.impactRank || 0, f.kind, at, at,
              ).lastInsertRowid,
            );
          }
          stmt.linkFinding.run(scanId, pageId, findingId, f.kind);
        }
        stmt.bumpPages.run(scanId);
      });
    },

    // ---- reading results -------------------------------------------------

    scanPages: (scanId) =>
      q(`SELECT p.*,
           (SELECT COUNT(*) FROM scan_findings sf WHERE sf.page_id = p.id AND sf.kind = 'fail') AS fail_count,
           (SELECT COUNT(*) FROM scan_findings sf WHERE sf.page_id = p.id AND sf.kind = 'review') AS review_count
         FROM pages p WHERE p.scan_id = ? ORDER BY p.id`).all(scanId),

    /** Per-rule rollup for a scan, with open/dismissed finding counts. */
    scanRules(scanId) {
      const rules = q(`
        SELECT rr.rule_id,
          MAX(CASE rr.outcome WHEN 'fail' THEN 3 WHEN 'review' THEN 2 WHEN 'pass' THEN 1 ELSE 0 END) AS outcome_rank,
          MAX(CASE WHEN rr.outcome IN ('fail', 'review') THEN rr.impact_rank ELSE 0 END) AS impact_rank,
          SUM(CASE WHEN rr.outcome IN ('fail', 'review') THEN 1 ELSE 0 END) AS pages_affected,
          r.help, r.description, r.help_url, r.tags
        FROM rule_results rr LEFT JOIN rules r ON r.rule_id = rr.rule_id
        WHERE rr.scan_id = ? GROUP BY rr.rule_id`).all(scanId);
      const counts = q(`
        SELECT f.rule_id, f.status, COUNT(*) AS n
        FROM scan_findings sf JOIN findings f ON f.id = sf.finding_id
        WHERE sf.scan_id = ? GROUP BY f.rule_id, f.status`).all(scanId);
      const byRule = new Map();
      for (const c of counts) {
        const entry = byRule.get(c.rule_id) || { open: 0, dismissed: 0 };
        entry[c.status] = c.n;
        byRule.set(c.rule_id, entry);
      }
      const outcomes = ['inapplicable', 'pass', 'review', 'fail'];
      return rules.map((r) => ({
        rule_id: r.rule_id,
        outcome: outcomes[r.outcome_rank],
        impact_rank: r.impact_rank,
        pages_affected: r.pages_affected,
        help: r.help,
        description: r.description,
        help_url: r.help_url,
        tags: JSON.parse(r.tags || '[]'),
        open: byRule.get(r.rule_id)?.open || 0,
        dismissed: byRule.get(r.rule_id)?.dismissed || 0,
      }));
    },

    /** Open failed findings in a scan, counted by severity rank. */
    scanSeverity(scanId) {
      const rows = q(`
        SELECT f.impact_rank, COUNT(*) AS n
        FROM scan_findings sf JOIN findings f ON f.id = sf.finding_id
        WHERE sf.scan_id = ? AND sf.kind = 'fail' AND f.status = 'open'
        GROUP BY f.impact_rank`).all(scanId);
      const out = [0, 0, 0, 0, 0];
      for (const r of rows) out[r.impact_rank] = r.n;
      return out;
    },

    /**
     * Findings matching the filters, newest state. With `scanId` the list is
     * what that scan saw; without it, every finding ever recorded.
     */
    findFindings({ scanId, ruleId, pageId, kind, status, impact, sort } = {}) {
      const where = [];
      const params = {};
      let from = 'findings f';
      if (scanId) {
        from = 'scan_findings sf JOIN findings f ON f.id = sf.finding_id';
        where.push('sf.scan_id = $scan');
        params.$scan = scanId;
        if (pageId) {
          where.push('sf.page_id = $page');
          params.$page = pageId;
        }
        if (kind) {
          where.push('sf.kind = $kind');
          params.$kind = kind;
        }
      } else if (kind) {
        where.push('f.kind = $kind');
        params.$kind = kind;
      }
      if (ruleId) {
        where.push('f.rule_id = $rule');
        params.$rule = ruleId;
      }
      if (status) {
        where.push('f.status = $status');
        params.$status = status;
      }
      if (impact) {
        where.push('f.impact_rank = $impact');
        params.$impact = impact;
      }
      return q(`
        SELECT f.*, r.help AS rule_help
        FROM ${from} LEFT JOIN rules r ON r.rule_id = f.rule_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY ${SORTS[sort] || SORTS.severity}
        LIMIT 50000`).all(params);
    },

    getFinding(id) {
      const finding = q(`
        SELECT f.*, r.help AS rule_help, r.description AS rule_description, r.help_url AS rule_help_url, r.tags AS rule_tags
        FROM findings f LEFT JOIN rules r ON r.rule_id = f.rule_id WHERE f.id = ?`).get(id);
      if (!finding) return null;
      finding.seen_in = q(`
        SELECT s.id, s.created_at, s.finished_at FROM scan_findings sf JOIN scans s ON s.id = sf.scan_id
        WHERE sf.finding_id = ? ORDER BY s.id`).all(id);
      return finding;
    },

    setFindingStatus(ids, status, reason) {
      const at = now();
      const update = q('UPDATE findings SET status = ?, dismiss_reason = ?, status_changed_at = ? WHERE id = ? AND status != ?');
      return tx(() => {
        let changed = 0;
        for (const id of ids) {
          changed += update.run(status, status === 'dismissed' ? reason || null : null, at, id, status).changes;
        }
        return changed;
      });
    },

    /** Finished scans, oldest first, with open failed findings by severity. */
    trend(site, limit = 12) {
      const scans = q(`
        SELECT id, url, score, finished_at, pages_scanned FROM scans
        WHERE status = 'done' AND ($site IS NULL OR origin = $site)
        ORDER BY id DESC LIMIT $limit`).all({ $site: site || null, $limit: limit });
      return scans.reverse().map((s) => ({ ...s, severity: this.scanSeverity(s.id) }));
    },
  };
}
