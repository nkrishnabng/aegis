import type {
  AdminConfig,
  AgentActivityEventRecord,
  AuditLogEntryRecord,
  ChangeRequestRecord,
  ChatMessageRecord,
  DashboardSummary,
  EnvironmentInput,
  EnvironmentRecord,
  FailingTestRecord,
  FlowInput,
  FlowRecord,
  FlowSummary,
  FlowVersionRecord,
  HealingEventRecord,
  IntegrationInput,
  IntegrationSummary,
  IntegrationType,
  IssuePushRecord,
  ProjectMemberRecord,
  ProjectRecord,
  ProjectRole,
  ReportsSummary,
  TestCaseRecord,
  TestDataSetRecord,
  TestRunRecord,
  TestStepInput,
  TraceBundle,
  UsageTotals,
  UserSummary,
  VisualDiffRecord,
} from "@testingmcp/shared";
import { API_BASE_URL } from "./config";

type TestCaseEditPayload = Partial<Omit<TestCaseRecord, "steps">> & {
  steps?: TestStepInput[];
};

export class AuthError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    throw new AuthError("Not authenticated");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  login: (username: string, password: string) =>
    request<UserSummary>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<UserSummary>("/api/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/api/auth/password", { method: "PUT", body: JSON.stringify({ currentPassword, newPassword }) }),

  listUsers: () => request<UserSummary[]>("/api/users"),
  createUser: (username: string, password: string, role: "admin" | "member") =>
    request<UserSummary>("/api/users", { method: "POST", body: JSON.stringify({ username, password, role }) }),
  updateUser: (id: string, updates: { password?: string; role?: "admin" | "member" }) =>
    request<UserSummary>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(updates) }),
  getAdminConfig: () => request<AdminConfig>("/api/admin/config"),

  listProjects: () => request<ProjectRecord[]>("/api/projects"),
  createProject: (name: string) =>
    request<ProjectRecord>("/api/projects", { method: "POST", body: JSON.stringify({ name }) }),
  getProject: (id: string) => request<ProjectRecord>(`/api/projects/${id}`),
  updateProject: (id: string, name: string) =>
    request<ProjectRecord>(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  listMembers: (projectId: string) =>
    request<ProjectMemberRecord[]>(`/api/projects/${projectId}/members`),
  listAvailableMembers: (projectId: string) =>
    request<UserSummary[]>(`/api/projects/${projectId}/available-members`),
  addMember: (projectId: string, username: string, role: ProjectRole) =>
    request<ProjectMemberRecord>(`/api/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ username, role }),
    }),
  updateMemberRole: (projectId: string, userId: string, role: ProjectRole) =>
    request<ProjectMemberRecord>(`/api/projects/${projectId}/members/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),
  removeMember: (projectId: string, userId: string) =>
    request<void>(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" }),
  listAuditLog: (projectId: string) =>
    request<AuditLogEntryRecord[]>(`/api/projects/${projectId}/audit-log`),
  addUrl: (projectId: string, url: string) =>
    request<{ url: ProjectRecord["urls"][number]; reachable: boolean; reachabilityNote: string | null }>(
      `/api/projects/${projectId}/urls`,
      { method: "POST", body: JSON.stringify({ url }) },
    ),
  listTestCases: (projectId: string) =>
    request<TestCaseRecord[]>(`/api/projects/${projectId}/testcases`),
  listChat: (projectId: string) => request<ChatMessageRecord[]>(`/api/projects/${projectId}/chat`),
  listAgentActivity: (projectId: string) =>
    request<AgentActivityEventRecord[]>(`/api/projects/${projectId}/agent-activity`),
  getUsage: (projectId: string) => request<UsageTotals>(`/api/projects/${projectId}/usage`),
  getDashboard: (projectId: string) => request<DashboardSummary>(`/api/projects/${projectId}/dashboard`),
  getFailingTests: (projectId: string) =>
    request<FailingTestRecord[]>(`/api/projects/${projectId}/failing-tests`),
  getReports: (projectId: string) => request<ReportsSummary>(`/api/projects/${projectId}/reports`),
  runAll: (projectId: string, environmentId?: string, continueFromChatSession?: boolean) =>
    request<{ batchId: string; testRunIds: string[] }>(`/api/projects/${projectId}/testcases/run-all`, {
      method: "POST",
      body: JSON.stringify({ environmentId, continueFromChatSession }),
    }),

  listEnvironments: (projectId: string) =>
    request<EnvironmentRecord[]>(`/api/projects/${projectId}/environments`),
  createEnvironment: (projectId: string, input: EnvironmentInput) =>
    request<EnvironmentRecord>(`/api/projects/${projectId}/environments`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateEnvironment: (id: string, input: Partial<EnvironmentInput>) =>
    request<EnvironmentRecord>(`/api/environments/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteEnvironment: (id: string) => request<void>(`/api/environments/${id}`, { method: "DELETE" }),
  setEnvironmentCredentials: (id: string, values: Record<string, string>) =>
    request<EnvironmentRecord>(`/api/environments/${id}/credentials`, {
      method: "PUT",
      body: JSON.stringify({ values }),
    }),

  getIntegrations: (projectId: string) =>
    request<Record<IntegrationType, IntegrationSummary | null>>(`/api/projects/${projectId}/integrations`),
  updateIntegration: (projectId: string, type: IntegrationType, input: IntegrationInput) =>
    request<IntegrationSummary>(`/api/projects/${projectId}/integrations/${type}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  pushRunToTracker: (runId: string, type: IntegrationType) =>
    request<IssuePushRecord>(`/api/testruns/${runId}/push-to/${type}`, { method: "POST" }),

  listHealingEvents: (projectId: string) =>
    request<HealingEventRecord[]>(`/api/healing-events?projectId=${projectId}`),
  approveHealingEvent: (id: string, makePrimary: boolean) =>
    request<HealingEventRecord>(`/api/healing-events/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ makePrimary }),
    }),
  dismissHealingEvent: (id: string) =>
    request<HealingEventRecord>(`/api/healing-events/${id}/dismiss`, { method: "POST" }),

  getTestCase: (id: string) => request<TestCaseRecord>(`/api/testcases/${id}`),
  updateTestCase: (id: string, updates: TestCaseEditPayload) =>
    request<TestCaseRecord>(`/api/testcases/${id}`, { method: "PUT", body: JSON.stringify(updates) }),
  deleteTestCase: (id: string) => request<void>(`/api/testcases/${id}`, { method: "DELETE" }),
  reviewTestCase: (id: string, decision: "approve" | "reject", note?: string) =>
    request<TestCaseRecord>(`/api/testcases/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, note }),
    }),
  generateStep: (testCaseId: string, instruction: string) =>
    request<TestStepInput>(`/api/testcases/${testCaseId}/steps/generate`, {
      method: "POST",
      body: JSON.stringify({ instruction }),
    }),
  runTestCase: (id: string, environmentId?: string, continueFromChatSession?: boolean) =>
    request<TestRunRecord>(`/api/testcases/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ environmentId, continueFromChatSession }),
    }),
  exportUrl: (id: string) => `${API_BASE_URL}/api/testcases/${id}/export`,
  exportCiPackageUrl: (projectId: string) => `${API_BASE_URL}/api/projects/${projectId}/export-ci`,
  batchJunitUrl: (batchId: string) => `${API_BASE_URL}/api/testruns/batch/${batchId}/junit`,
  batchHtmlReportUrl: (batchId: string) => `${API_BASE_URL}/api/testruns/batch/${batchId}/html`,
  listChangeRequests: (testCaseId: string) =>
    request<ChangeRequestRecord[]>(`/api/testcases/${testCaseId}/change-requests`),
  createChangeRequest: (testCaseId: string, note: string) =>
    request<ChangeRequestRecord>(`/api/testcases/${testCaseId}/change-requests`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  resolveChangeRequest: (id: string) =>
    request<ChangeRequestRecord>(`/api/change-requests/${id}/resolve`, { method: "POST" }),
  getTestRun: (id: string) => request<TestRunRecord>(`/api/testruns/${id}`),
  getTestRunTrace: (id: string) => request<TraceBundle>(`/api/testruns/${id}/trace`),
  listRunsForTestCase: (testCaseId: string) =>
    request<TestRunRecord[]>(`/api/testruns/by-testcase/${testCaseId}`),
  listFlows: (projectId: string) => request<FlowSummary[]>(`/api/projects/${projectId}/flows`),
  createFlow: (projectId: string, input: FlowInput, steps: TestStepInput[]) =>
    request<FlowRecord>(`/api/projects/${projectId}/flows`, {
      method: "POST",
      body: JSON.stringify({ ...input, steps }),
    }),
  getFlow: (flowId: string) => request<FlowRecord>(`/api/flows/${flowId}`),
  updateFlowMetadata: (flowId: string, input: Partial<FlowInput>) =>
    request<FlowRecord>(`/api/flows/${flowId}`, { method: "PUT", body: JSON.stringify(input) }),
  createFlowVersion: (flowId: string, steps: TestStepInput[], note?: string | null) =>
    request<FlowVersionRecord>(`/api/flows/${flowId}/versions`, {
      method: "POST",
      body: JSON.stringify({ steps, note }),
    }),
  deleteFlow: (flowId: string) => request<void>(`/api/flows/${flowId}`, { method: "DELETE" }),
  insertFlowIntoTestCase: (testCaseId: string, flowVersionId: string) =>
    request<TestCaseRecord>(`/api/testcases/${testCaseId}/steps/insert-flow`, {
      method: "POST",
      body: JSON.stringify({ flowVersionId }),
    }),
  updateFlowBlock: (testCaseId: string, sourceFlowVersionId: string, toFlowVersionId: string) =>
    request<TestCaseRecord>(`/api/testcases/${testCaseId}/steps/update-flow-block`, {
      method: "POST",
      body: JSON.stringify({ sourceFlowVersionId, toFlowVersionId }),
    }),
  getTestDataSet: (testCaseId: string) =>
    request<TestDataSetRecord | null>(`/api/testcases/${testCaseId}/data-set`),
  uploadTestDataSet: (
    testCaseId: string,
    text: string,
    format: "csv" | "json",
    secretColumns: string[],
  ) =>
    request<TestDataSetRecord>(`/api/testcases/${testCaseId}/data-set`, {
      method: "PUT",
      body: JSON.stringify({ text, format, secretColumns }),
    }),
  updateDataSetSecretColumns: (testCaseId: string, secretColumns: string[]) =>
    request<TestDataSetRecord>(`/api/testcases/${testCaseId}/data-set`, {
      method: "PUT",
      body: JSON.stringify({ secretColumns }),
    }),
  deleteTestDataSet: (testCaseId: string) =>
    request<void>(`/api/testcases/${testCaseId}/data-set`, { method: "DELETE" }),
  runTestCaseWithData: (testCaseId: string, environmentId?: string) =>
    request<{ batchId: string; testRunIds: string[] }>(`/api/testcases/${testCaseId}/run-with-data`, {
      method: "POST",
      body: JSON.stringify({ environmentId }),
    }),
  rerunTestRun: (id: string, resumeFromStepOrder?: number) =>
    request<TestRunRecord>(`/api/testruns/${id}/rerun`, {
      method: "POST",
      body: JSON.stringify({ resumeFromStepOrder }),
    }),
  screenshotUrl: (filePath: string) => `${API_BASE_URL}/screenshots/${filePath}`,
  artifactUrl: (filePath: string) => `${API_BASE_URL}/artifacts/${filePath}`,
  visualRegressionUrl: (filePath: string) => `${API_BASE_URL}/visual-regression/${filePath}`,

  listVisualDiffs: (projectId: string) =>
    request<VisualDiffRecord[]>(`/api/visual-diffs?projectId=${projectId}`),
  approveVisualDiff: (id: string) =>
    request<VisualDiffRecord>(`/api/visual-diffs/${id}/approve`, { method: "POST" }),
  rejectVisualDiff: (id: string) =>
    request<VisualDiffRecord>(`/api/visual-diffs/${id}/reject`, { method: "POST" }),
};
