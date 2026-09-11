import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';

// ── Config ────────────────────────────────────────────────────────────────────
const PORT              = parseInt(process.env.PORT || '8080');
const AUTH_TOKEN        = process.env.MCP_AUTH_TOKEN?.trim();
const OAUTH_CLIENT_ID   = process.env.OAUTH_CLIENT_ID?.trim();
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET?.trim();
const WORKSPACE_ID      = process.env.TOGGL_WORKSPACE_ID ?? '';

// Multi-key rotation: TOGGL_API_KEYS (comma-separated) is preferred. Falls back to
// the legacy single TOGGL_API_KEY for backwards-compat with un-migrated deploys.
// Rotation is sticky-on-rate-limit: a successful request leaves the key index where
// it is; only 402/429 advances the index. If every key in the pool reports a
// rate-limit in one cycle, we fall back to the previous sleep-and-retry behaviour.
const KEYS = (process.env.TOGGL_API_KEYS || process.env.TOGGL_API_KEY || '')
  .split(',').map(s => s.trim()).filter(Boolean);
if (!KEYS.length) throw new Error('No Toggl API key configured (set TOGGL_API_KEYS or TOGGL_API_KEY)');
let keyIndex = 0;
console.log(`[KEY] Loaded ${KEYS.length} Toggl API key(s); starting on index 0`);

const currentAuth = () => Buffer.from(`${KEYS[keyIndex]}:api_token`).toString('base64');

function rotateKey(reason) {
  if (KEYS.length <= 1) return false;
  const prev = keyIndex;
  keyIndex = (keyIndex + 1) % KEYS.length;
  console.log(`[KEY] Rotated ${prev}→${keyIndex} (pool size ${KEYS.length}) — reason: ${reason}`);
  return true;
}

// ── Toggl API helpers ─────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function togglRequest(method, path, body, attempt = 1, rotations = 0) {
  const res = await fetch(`https://api.track.toggl.com${path}`, {
    method,
    headers: { 'Authorization': `Basic ${currentAuth()}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 402 || res.status === 429) {
    const text = await res.text();
    // Try a fresh key first; only sleep if every key in the pool has been tried this cycle.
    if (rotations < KEYS.length - 1 && rotateKey(`HTTP ${res.status} on key ${keyIndex}`)) {
      return togglRequest(method, path, body, attempt, rotations + 1);
    }
    const match = text.match(/reset in (\d+) second/);
    const wait  = match ? parseInt(match[1]) + 5 : 65;
    if (attempt <= 3) {
      console.log(`[KEY] All ${KEYS.length} keys rate-limited — sleeping ${wait}s before retry (attempt ${attempt}/3)`);
      await sleep(wait * 1000);
      return togglRequest(method, path, body, attempt + 1, 0);
    }
    throw new Error(`Rate limit exceeded across all ${KEYS.length} keys after 3 attempts`);
  }
  if (!res.ok) { const t = await res.text(); throw new Error(`Toggl ${res.status} ${path}: ${t.slice(0, 200)}`); }
  return res.json();
}

const togglGet  = p      => togglRequest('GET',  p);
const togglPost = (p, b) => togglRequest('POST', p, b);

async function listUsers() {
  const data = await togglGet(`/api/v9/workspaces/${WORKSPACE_ID}/workspace_users`);
  return data.map(u => ({ id: u.uid ?? u.id, name: u.name, email: u.email ?? '' }));
}

async function listProjects() {
  const all = [];
  let page = 1;
  while (true) {
    const data = await togglGet(`/api/v9/workspaces/${WORKSPACE_ID}/projects?active=both&per_page=200&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 200) break;
    page++;
  }
  return all.map(p => ({ id: p.id, name: p.name, client: p.client_name ?? '' }));
}

// Reports API v3 — cursor-paginated, queries all workspace members
async function fetchEntries(startDate, endDate, userIds) {
  const all = [];
  let firstRowNumber = 1;
  while (true) {
    const body = { start_date: startDate, end_date: endDate, page_size: 1000 };
    if (userIds?.length) body.user_ids = userIds;
    if (firstRowNumber > 1) body.first_row_number = firstRowNumber;
    const data = await togglPost(`/reports/api/v3/workspace/${WORKSPACE_ID}/search/time_entries`, body);
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    firstRowNumber = data[data.length - 1].row_number + 1;
    await sleep(300);
  }
  return all;
}

async function getMaps() {
  const [projects, users] = await Promise.all([listProjects(), listUsers()]);
  return {
    projMap: Object.fromEntries(projects.map(p => [p.id, p])),
    userMap: Object.fromEntries(users.map(u => [u.id, u])),
    users,
  };
}

function fmtDur(secs) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function toHrs(secs) { return Math.round(secs / 36) / 100; }

// ── MCP Server ────────────────────────────────────────────────────────────────
function buildMcpServer() {
  const server = new McpServer({ name: 'mcp-toggl', version: '2.0.0' });

  server.tool(
    'list_workspace_members',
    'List all members of the Toggl workspace with their IDs and emails',
    {},
    async () => {
      const users = await listUsers();
      return { content: [{ type: 'text', text: JSON.stringify(users, null, 2) }] };
    }
  );

  server.tool(
    'list_projects',
    'List all Toggl projects with their client names',
    {},
    async () => {
      const projects = await listProjects();
      return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
    }
  );

  server.tool(
    'get_time_entries',
    'Get detailed time entries for all workspace members (or a specific user) between two dates',
    {
      start_date: z.string().describe('Start date YYYY-MM-DD'),
      end_date:   z.string().describe('End date YYYY-MM-DD'),
      user_name:  z.string().optional().describe('Filter by user name (partial match, case-insensitive)'),
    },
    async ({ start_date, end_date, user_name }) => {
      const { projMap, userMap, users } = await getMaps();
      let userIds;
      if (user_name) {
        const matched = users.filter(u => u.name.toLowerCase().includes(user_name.toLowerCase()));
        if (!matched.length) return { content: [{ type: 'text', text: `No user found matching "${user_name}"` }] };
        userIds = matched.map(u => u.id);
      }
      const raw = await fetchEntries(start_date, end_date, userIds);
      const rows = [];
      for (const e of raw) {
        const proj = projMap[e.project_id] ?? { name: 'No project', client: '' };
        const user = userMap[e.user_id]    ?? { name: e.username ?? 'Unknown', email: '' };
        for (const te of e.time_entries ?? []) {
          rows.push({
            user: user.name, client: proj.client, project: proj.name,
            description: e.description ?? '', start: te.start, stop: te.stop,
            duration_hrs: toHrs(te.seconds), duration: fmtDur(te.seconds),
          });
        }
      }
      rows.sort((a, b) => b.start.localeCompare(a.start));
      const total = rows.reduce((s, r) => s + r.duration_hrs, 0);
      return { content: [{ type: 'text', text: `${rows.length} entries · ${Math.round(total * 100) / 100} hrs\n\n${JSON.stringify(rows, null, 2)}` }] };
    }
  );

  server.tool(
    'get_daily_summary',
    'Get a summary of what each team member worked on for a specific day',
    {
      date:      z.string().describe('Date YYYY-MM-DD'),
      user_name: z.string().optional().describe('Filter by user name (partial match, case-insensitive)'),
    },
    async ({ date, user_name }) => {
      const { projMap, userMap, users } = await getMaps();
      let userIds;
      if (user_name) {
        const matched = users.filter(u => u.name.toLowerCase().includes(user_name.toLowerCase()));
        if (!matched.length) return { content: [{ type: 'text', text: `No user found matching "${user_name}"` }] };
        userIds = matched.map(u => u.id);
      }
      const raw = await fetchEntries(date, date, userIds);
      if (!raw.length) return { content: [{ type: 'text', text: `No time entries found for ${date}` }] };
      const byUser = {};
      for (const e of raw) {
        const user = userMap[e.user_id] ?? { name: e.username ?? 'Unknown' };
        const proj = projMap[e.project_id] ?? { name: 'No project', client: '' };
        if (!byUser[user.name]) byUser[user.name] = { secs: 0, tasks: [] };
        const secs = (e.time_entries ?? []).reduce((s, te) => s + te.seconds, 0);
        byUser[user.name].secs += secs;
        const label = [
          proj.client && `[${proj.client}]`,
          proj.name !== 'No project' && proj.name,
          e.description,
        ].filter(Boolean).join(' — ');
        if (label) byUser[user.name].tasks.push(`  ${fmtDur(secs)}: ${label}`);
      }
      const lines = [`Daily summary for ${date}`, '─'.repeat(40)];
      for (const [name, { secs, tasks }] of Object.entries(byUser).sort()) {
        lines.push(`\n${name} — ${fmtDur(secs)} (${toHrs(secs)} hrs)`);
        lines.push(...tasks);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  server.tool(
    'get_user_summary',
    'Get total hours per team member for a date range, broken down by project',
    {
      start_date: z.string().describe('Start date YYYY-MM-DD'),
      end_date:   z.string().describe('End date YYYY-MM-DD'),
    },
    async ({ start_date, end_date }) => {
      const { projMap, userMap } = await getMaps();
      const raw = await fetchEntries(start_date, end_date);
      const byUser = {};
      for (const e of raw) {
        const user = userMap[e.user_id] ?? { name: e.username ?? 'Unknown' };
        const proj = projMap[e.project_id] ?? { name: 'No project', client: '' };
        if (!byUser[user.name]) byUser[user.name] = { secs: 0, byProj: {} };
        const secs = (e.time_entries ?? []).reduce((s, te) => s + te.seconds, 0);
        byUser[user.name].secs += secs;
        const key = proj.client ? `${proj.client} › ${proj.name}` : proj.name;
        byUser[user.name].byProj[key] = (byUser[user.name].byProj[key] ?? 0) + secs;
      }
      const lines = [`User summary: ${start_date} → ${end_date}`, '─'.repeat(40)];
      for (const [name, { secs, byProj }] of Object.entries(byUser).sort()) {
        lines.push(`\n${name} — ${fmtDur(secs)} (${toHrs(secs)} hrs)`);
        for (const [proj, s] of Object.entries(byProj).sort(([, a], [, b]) => b - a))
          lines.push(`  ${fmtDur(s).padEnd(8)} ${proj}`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );


  server.tool(
    'get_client_summary',
    'Get total hours per client for a date range, broken down by project and team member',
    {
      start_date:  z.string().describe('Start date YYYY-MM-DD'),
      end_date:    z.string().describe('End date YYYY-MM-DD'),
      client_name: z.string().optional().describe('Filter by client name (partial match, case-insensitive)'),
    },
    async ({ start_date, end_date, client_name }) => {
      const { projMap, userMap } = await getMaps();
      const raw = await fetchEntries(start_date, end_date);
      const byClient = {};
      for (const e of raw) {
        const proj = projMap[e.project_id] ?? { name: 'No project', client: '' };
        const user = userMap[e.user_id] ?? { name: e.username ?? 'Unknown' };
        const client = proj.client || '(no client)';
        if (client_name && !client.toLowerCase().includes(client_name.toLowerCase())) continue;
        if (!byClient[client]) byClient[client] = { secs: 0, byProject: {}, byUser: {} };
        const secs = (e.time_entries ?? []).reduce((s, te) => s + te.seconds, 0);
        byClient[client].secs += secs;
        byClient[client].byProject[proj.name] = (byClient[client].byProject[proj.name] ?? 0) + secs;
        byClient[client].byUser[user.name] = (byClient[client].byUser[user.name] ?? 0) + secs;
      }
      if (!Object.keys(byClient).length) {
        const filter = client_name ? ` for client matching "${client_name}"` : '';
        return { content: [{ type: 'text', text: `No entries found${filter} between ${start_date} and ${end_date}` }] };
      }
      const lines = [`Client summary: ${start_date} → ${end_date}`, '─'.repeat(40)];
      for (const [client, { secs, byProject, byUser }] of Object.entries(byClient).sort()) {
        lines.push(`\n${client} — ${fmtDur(secs)} (${toHrs(secs)} hrs)`);
        lines.push('  By project:');
        for (const [proj, s] of Object.entries(byProject).sort(([, a], [, b]) => b - a))
          lines.push(`    ${fmtDur(s).padEnd(8)} ${proj}`);
        lines.push('  By team member:');
        for (const [user, s] of Object.entries(byUser).sort(([, a], [, b]) => b - a))
          lines.push(`    ${fmtDur(s).padEnd(8)} ${user}`);
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  return server;
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const authCodes = {};

// ── OAuth 2.0 PKCE routes ─────────────────────────────────────────────────────
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  const base = `https://${req.headers.host}`;
  res.json({ resource: `${base}/mcp`, authorization_servers: [base] });
});

app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const base = `https://${req.headers.host}`;
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/oauth/token`,
    grant_types_supported: ['authorization_code', 'client_credentials'],
    code_challenge_methods_supported: ['S256'],
    response_types_supported: ['code'],
  });
});

app.get('/authorize', (req, res) => {
  const { response_type, client_id, redirect_uri, code_challenge, code_challenge_method, state } = req.query;
  if (client_id !== OAUTH_CLIENT_ID) { res.status(401).json({ error: 'invalid_client' }); return; }
  if (response_type !== 'code') { res.status(400).json({ error: 'unsupported_response_type' }); return; }
  if (!code_challenge) { res.status(400).json({ error: 'code_challenge required' }); return; }
  const code = randomUUID();
  authCodes[code] = {
    codeChallenge: code_challenge, codeChallengeMethod: code_challenge_method || 'S256',
    redirectUri: redirect_uri, expiresAt: Date.now() + 5 * 60 * 1000,
  };
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);
  res.redirect(redirectUrl.toString());
});

app.post('/oauth/token', (req, res) => {
  if (!OAUTH_CLIENT_ID || !AUTH_TOKEN) { res.status(500).json({ error: 'server_misconfigured' }); return; }
  const grant_type = req.body.grant_type;
  if (grant_type === 'authorization_code') {
    if (req.body.client_id !== OAUTH_CLIENT_ID || req.body.client_secret !== OAUTH_CLIENT_SECRET) {
      res.status(401).json({ error: 'invalid_client' }); return;
    }
    const { code, code_verifier, redirect_uri } = req.body;
    const stored = authCodes[code];
    if (!stored || stored.expiresAt < Date.now()) { res.status(400).json({ error: 'invalid_grant' }); return; }
    const expected = createHash('sha256').update(code_verifier).digest('base64url');
    if (expected !== stored.codeChallenge) { res.status(400).json({ error: 'invalid_grant' }); return; }
    if (redirect_uri && redirect_uri !== stored.redirectUri) { res.status(400).json({ error: 'invalid_grant' }); return; }
    delete authCodes[code];
    res.json({ access_token: AUTH_TOKEN, token_type: 'Bearer', expires_in: 2592000 });
    return;
  }
  if (!OAUTH_CLIENT_SECRET) { res.status(500).json({ error: 'server_misconfigured' }); return; }
  let client_id, client_secret;
  const basicAuth = req.headers['authorization'];
  if (basicAuth?.startsWith('Basic ')) {
    const decoded = Buffer.from(basicAuth.slice(6), 'base64').toString();
    const colon = decoded.indexOf(':');
    client_id = decoded.slice(0, colon); client_secret = decoded.slice(colon + 1);
  } else { client_id = req.body.client_id; client_secret = req.body.client_secret; }
  if (client_id !== OAUTH_CLIENT_ID || client_secret !== OAUTH_CLIENT_SECRET) {
    res.status(401).json({ error: 'invalid_client' }); return;
  }
  res.json({ access_token: AUTH_TOKEN, token_type: 'Bearer', expires_in: 2592000 });
});

// ── Bearer token middleware ────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (['/health', '/authorize', '/oauth/token'].includes(req.path) || req.path.startsWith('/.well-known/')) return next();
  if (!AUTH_TOKEN) return next();
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).set('WWW-Authenticate', `Bearer resource_metadata="https://${req.headers.host}/.well-known/oauth-protected-resource"`).json({ error: 'Unauthorized' });
    return;
  }
  if (authHeader.slice(7) !== AUTH_TOKEN) {
    res.status(401).set('WWW-Authenticate', 'Bearer error="invalid_token"').json({ error: 'Unauthorized' });
    return;
  }
  next();
});

// ── MCP session management ────────────────────────────────────────────────────
const SESSION_TTL = 30 * 60 * 1000;
const sessions = new Map(); // sessionId -> { server, transport, timer }

function closeSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return;
  clearTimeout(s.timer);
  try { s.server.close(); } catch {}
  sessions.delete(sessionId);
  console.log(`[SESSION] Closed session ${sessionId}`);
}

// ── MCP endpoint ──────────────────────────────────────────────────────────────
app.all('/mcp', async (req, res) => {
  const isInit = req.method === 'POST' && req.body?.method === 'initialize';
  let sessionId = req.headers['mcp-session-id'];

  // Fast path: known active session — reset TTL and reuse.
  if (sessionId && sessions.has(sessionId)) {
    const s = sessions.get(sessionId);
    clearTimeout(s.timer);
    s.timer = setTimeout(() => closeSession(sessionId), SESSION_TTL);
    res.setHeader('mcp-session-id', sessionId);
    await s.transport.handleRequest(req, res, req.body);
    return;
  }

  // Initialize with no session id — create a fresh session.
  if (isInit && !sessionId) {
    sessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => sessionId });
    const server = buildMcpServer();
    await server.connect(transport);
    const timer = setTimeout(() => closeSession(sessionId), SESSION_TTL);
    sessions.set(sessionId, { server, transport, timer });
    console.log(`[SESSION] New session ${sessionId}`);
    res.setHeader('mcp-session-id', sessionId);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // Unknown session id — return 404 per MCP spec. A well-behaved client
  // will reinitialize. Do NOT silently resurrect — see
  // PM-Labs/mcp-playwright@1d75780 for root-cause analysis.
  if (sessionId) {
    res.status(404).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Session not found' },
      id: null
    });
    return;
  }

  // No session id and not initialize — malformed.
  res.status(400).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
    id: null
  });
});

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'mcp-toggl', version: '2.0.0' }));

app.listen(PORT, () => console.log(`Toggl MCP on :${PORT}`));
