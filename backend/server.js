import express from 'express';
import { readFileSync } from 'fs';
import { Client } from '@opensearch-project/opensearch';

const ENTRIES_INDEX = 'schmerzprotokoll-entries';
const SETTINGS_INDEX = 'schmerzprotokoll-settings';
const CHARAKTER_DEFAULT = ['ziehend', 'drückend'];

const app = express();
app.use(express.json());

let NGINX_APIKEY;
try {
  NGINX_APIKEY = readFileSync('/run/secrets/nginx_apikey', 'utf8').trim();
} catch {
  console.error('Docker secret "nginx_apikey" is required (expected at /run/secrets/nginx_apikey)');
  process.exit(1);
}

let OPENSEARCH_PASSWORD;
try {
  OPENSEARCH_PASSWORD = readFileSync('/run/secrets/opensearch_schmerzprotokoll_password', 'utf8').trim();
} catch {
  console.error('Docker secret "opensearch_schmerzprotokoll_password" is required (expected at /run/secrets/opensearch_schmerzprotokoll_password)');
  process.exit(1);
}

const client = new Client({
  node: process.env.OPENSEARCH_NODE || 'https://opensearch-node1:9200',
  auth: {
    username: process.env.OPENSEARCH_USERNAME || 'schmerzprotokoll',
    password: OPENSEARCH_PASSWORD,
  },
  ssl: { rejectUnauthorized: false }, // self-signed demo certs, matches bestehende OPENSEARCH_SSL_VERIFY:"false"-Konvention
});

const ENTRIES_MAPPING = {
  settings: { number_of_shards: 1, number_of_replicas: 0 }, // single-node cluster
  mappings: {
    properties: {
      datetime: { type: 'date', format: "yyyy-MM-dd'T'HH:mm" },
      intensity: { type: 'integer' },
      koerperteile: { type: 'keyword' },
      schmerzcharakter: { type: 'keyword' },
      medikation: {
        type: 'text',
        analyzer: 'german',
        fields: { keyword: { type: 'keyword', ignore_above: 256 } },
      },
      beeintraechtigung: { type: 'keyword' },
      kommentar: {
        type: 'text',
        analyzer: 'german',
        fields: { keyword: { type: 'keyword', ignore_above: 256 } },
      },
    },
  },
};

const SETTINGS_MAPPING = {
  settings: { number_of_shards: 1, number_of_replicas: 0 },
  mappings: { properties: { value: { type: 'keyword' } } },
};

async function ensureIndex(index, body) {
  const { body: exists } = await client.indices.exists({ index });
  if (!exists) {
    await client.indices.create({ index, body });
    console.log(`Created index "${index}"`);
  }
}

async function ensureIndices() {
  await ensureIndex(ENTRIES_INDEX, ENTRIES_MAPPING);
  await ensureIndex(SETTINGS_INDEX, SETTINGS_MAPPING);
}

app.use('/api', (req, res, next) => {
  if (req.headers['x-api-key'] !== NGINX_APIKEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Express 4 fängt rejected Promises aus async Handlern nicht selbst ab
// (anders als die alten synchronen better-sqlite3-throws) - ohne diesen
// Wrapper würden Fehler zu unhandled rejections statt sauberen 500ern.
const asyncHandler = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const toEntry = (hit) => ({ id: Number(hit._id), ...hit._source });

app.get('/api/entries', asyncHandler(async (req, res) => {
  const { body } = await client.search({
    index: ENTRIES_INDEX,
    body: {
      size: 10000, // OpenSearch-Default ist 10 - ohne explizites size werden Einträge sonst still abgeschnitten
      sort: [{ datetime: 'desc' }],
      query: { match_all: {} },
    },
  });
  res.json(body.hits.hits.map(toEntry));
}));

app.post('/api/entries', asyncHandler(async (req, res) => {
  const e = req.body;
  const source = {
    datetime: e.datetime,
    intensity: e.intensity,
    koerperteile: e.koerperteile ?? [],
    schmerzcharakter: e.schmerzcharakter ?? '',
    medikation: e.medikation ?? '',
    beeintraechtigung: e.beeintraechtigung ?? [],
    kommentar: e.kommentar ?? '',
  };
  await client.index({ index: ENTRIES_INDEX, id: String(e.id), body: source, refresh: true });
  res.status(201).json({ id: e.id, ...source });
}));

app.put('/api/entries/:id', asyncHandler(async (req, res) => {
  const e = req.body;
  const id = Number(req.params.id);
  const source = {
    datetime: e.datetime,
    intensity: e.intensity,
    koerperteile: e.koerperteile ?? [],
    schmerzcharakter: e.schmerzcharakter ?? '',
    medikation: e.medikation ?? '',
    beeintraechtigung: e.beeintraechtigung ?? [],
    kommentar: e.kommentar ?? '',
  };
  await client.index({ index: ENTRIES_INDEX, id: String(id), body: source, refresh: true });
  res.json({ id, ...source });
}));

app.delete('/api/entries/:id', asyncHandler(async (req, res) => {
  // {ignore:[404]} hält DELETE idempotent, wie das alte "DELETE ... WHERE id=?"
  await client.delete(
    { index: ENTRIES_INDEX, id: String(Number(req.params.id)), refresh: true },
    { ignore: [404] }
  );
  res.json({ ok: true });
}));

app.get('/api/charakter', asyncHandler(async (req, res) => {
  const { body, statusCode } = await client.get(
    { index: SETTINGS_INDEX, id: 'charakter' },
    { ignore: [404] }
  );
  if (statusCode === 404 || !body.found) return res.json(CHARAKTER_DEFAULT);
  res.json(body._source.value);
}));

app.put('/api/charakter', asyncHandler(async (req, res) => {
  await client.index({ index: SETTINGS_INDEX, id: 'charakter', body: { value: req.body }, refresh: true });
  res.json(req.body);
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

ensureIndices()
  .then(() => app.listen(3000, () => console.log('Backend listening on :3000')))
  .catch((err) => {
    console.error('Failed to initialize OpenSearch indices', err);
    process.exit(1);
  });
