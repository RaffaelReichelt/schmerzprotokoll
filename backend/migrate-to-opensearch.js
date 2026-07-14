import { readFileSync } from 'fs';
import Database from 'better-sqlite3';
import { Client } from '@opensearch-project/opensearch';

const ENTRIES_INDEX = 'schmerzprotokoll-entries';
const SETTINGS_INDEX = 'schmerzprotokoll-settings';

const OPENSEARCH_PASSWORD = readFileSync('/run/secrets/opensearch_schmerzprotokoll_password', 'utf8').trim();
const client = new Client({
  node: process.env.OPENSEARCH_NODE || 'https://opensearch-node1:9200',
  auth: { username: process.env.OPENSEARCH_USERNAME || 'schmerzprotokoll', password: OPENSEARCH_PASSWORD },
  ssl: { rejectUnauthorized: false },
});

const db = new Database('/data/schmerzprotokoll.db', { readonly: true, fileMustExist: true });

async function main() {
  for (const index of [ENTRIES_INDEX, SETTINGS_INDEX]) {
    const { body: exists } = await client.indices.exists({ index });
    if (!exists) {
      throw new Error(`Index "${index}" existiert noch nicht - zuerst server.js starten (legt sie beim Boot an), dann erneut ausführen.`);
    }
  }

  const rows = db.prepare('SELECT * FROM entries').all();
  const bulkBody = [];
  for (const row of rows) {
    bulkBody.push({ index: { _index: ENTRIES_INDEX, _id: String(row.id) } });
    bulkBody.push({
      datetime: row.datetime,
      intensity: row.intensity,
      koerperteile: JSON.parse(row.koerperteile),
      schmerzcharakter: row.schmerzcharakter,
      medikation: row.medikation,
      beeintraechtigung: JSON.parse(row.beeintraechtigung),
      kommentar: row.kommentar,
    });
  }

  const charakterRow = db.prepare("SELECT value FROM settings WHERE key='charakter'").get();
  if (charakterRow) {
    bulkBody.push({ index: { _index: SETTINGS_INDEX, _id: 'charakter' } });
    bulkBody.push({ value: JSON.parse(charakterRow.value) });
  }

  if (bulkBody.length === 0) {
    console.log('Nichts zu migrieren (keine Einträge, kein charakter-Setting).');
    return;
  }

  const { body: result } = await client.bulk({ body: bulkBody, refresh: true });
  if (result.errors) {
    const failed = result.items.filter((it) => it.index?.error);
    console.error(`${failed.length} von ${rows.length + (charakterRow ? 1 : 0)} Bulk-Items fehlgeschlagen:`);
    console.error(JSON.stringify(failed, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`${rows.length} Einträge${charakterRow ? ' + charakter-Setting' : ''} erfolgreich migriert.`);
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => db.close());
