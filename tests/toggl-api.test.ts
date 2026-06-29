import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TogglAPI, TogglAPIError } from '../src/toggl-api.js';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock('node-fetch', () => ({
  default: fetchMock,
}));

function response({
  status,
  text = '',
  json,
  retryAfter,
}: {
  status: number;
  text?: string;
  json?: unknown;
  retryAfter?: string;
}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: vi.fn((name: string) => (name.toLowerCase() === 'retry-after' ? retryAfter : null)),
    },
    text: vi.fn(async () => text),
    json: vi.fn(async () => json),
  };
}

describe('toggl api errors', () => {
  afterEach(() => {
    fetchMock.mockReset();
  });

  it('parses Toggl quota reset seconds from 402 responses', async () => {
    fetchMock.mockResolvedValue(
      response({
        status: 402,
        text: 'You have hit your hourly limit for API calls. The quota will reset in 133 seconds.',
      })
    );

    const api = new TogglAPI('token');
    await expect(api.getWorkspaces()).rejects.toMatchObject({
      code: 'TOGGL_QUOTA_LIMIT',
      status: 402,
      retry_after_seconds: 133,
    });
    await expect(api.getWorkspaces()).rejects.toBeInstanceOf(TogglAPIError);
  });

  it('returns structured rate limit errors instead of sleeping for long retry windows', async () => {
    fetchMock.mockResolvedValue(response({ status: 429, retryAfter: '60' }));

    const api = new TogglAPI('token');
    await expect(api.getWorkspaces()).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      retry_after_seconds: 60,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('TogglAPI write methods', () => {
  let api: TogglAPI;

  beforeEach(() => {
    api = new TogglAPI('test-api-key');
    fetchMock.mockReset();
  });

  it('createProject sends POST to /workspaces/{id}/projects', async () => {
    const mockProject = { id: 123, name: 'New Project', workspace_id: 456, active: true, billable: false };
    fetchMock.mockResolvedValueOnce(response({ status: 200, json: mockProject }));

    const result = await api.createProject(456, { name: 'New Project' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.track.toggl.com/api/v9/workspaces/456/projects',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'New Project' }) })
    );
    expect(result.id).toBe(123);
    expect(result.name).toBe('New Project');
  });

  it('updateProject sends PUT to /workspaces/{id}/projects/{pid}', async () => {
    const mockProject = { id: 123, name: 'Renamed', workspace_id: 456, active: true };
    fetchMock.mockResolvedValueOnce(response({ status: 200, json: mockProject }));

    const result = await api.updateProject(456, 123, { name: 'Renamed' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.track.toggl.com/api/v9/workspaces/456/projects/123',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(result.name).toBe('Renamed');
  });

  it('createTask sends POST to /workspaces/{wid}/projects/{pid}/tasks', async () => {
    const mockTask = { id: 789, name: 'My Task', project_id: 123, workspace_id: 456, active: true };
    fetchMock.mockResolvedValueOnce(response({ status: 200, json: mockTask }));

    const result = await api.createTask(456, 123, { name: 'My Task', project_id: 123 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.track.toggl.com/api/v9/workspaces/456/projects/123/tasks',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.id).toBe(789);
    expect(result.name).toBe('My Task');
  });

  it('updateTask sends PUT to /workspaces/{wid}/projects/{pid}/tasks/{tid}', async () => {
    const mockTask = { id: 789, name: 'Updated Task', project_id: 123, workspace_id: 456, active: true };
    fetchMock.mockResolvedValueOnce(response({ status: 200, json: mockTask }));

    const result = await api.updateTask(456, 123, 789, { name: 'Updated Task' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.track.toggl.com/api/v9/workspaces/456/projects/123/tasks/789',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(result.name).toBe('Updated Task');
  });

  it('createClient sends POST to /workspaces/{id}/clients', async () => {
    const mockClient = { id: 555, name: 'ACME Corp', workspace_id: 456, archived: false };
    fetchMock.mockResolvedValueOnce(response({ status: 200, json: mockClient }));

    const result = await api.createClient(456, { name: 'ACME Corp' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.track.toggl.com/api/v9/workspaces/456/clients',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.id).toBe(555);
    expect(result.name).toBe('ACME Corp');
  });
});
