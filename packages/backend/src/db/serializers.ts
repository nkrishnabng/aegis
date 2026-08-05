// Converts Prisma records (which store JSON blobs as strings and Dates as
// Date objects) into the shared wire types used by the REST API, WebSocket,
// and frontend.
import type {
  ChatMessage,
  Environment,
  ExecutionLog,
  HealingEvent,
  IssuePush,
  Project,
  Screenshot,
  TargetUrl,
  TestCase,
  TestRun,
  TestRunResult,
  TestStep,
  TokenUsage,
  User,
  VisualDiff,
} from "@prisma/client";
import type {
  ChatMessageRecord,
  ElementSelector,
  EnvironmentRecord,
  ExecutionLogCategory,
  ExecutionLogRecord,
  HealingEventRecord,
  IntegrationType,
  IssuePushRecord,
  IssuePushStatus,
  ProjectRecord,
  ScreenshotRecord,
  TargetUrlRecord,
  TestCasePriority,
  TestCaseRecord,
  TestCaseStatus,
  TestCaseType,
  TestRunRecord,
  TestRunResultRecord,
  TestStepAction,
  TestStepRecord,
  TokenUsageRecord,
  TokenUsageSource,
  UserSummary,
  VisualDiffRecord,
  VisualDiffStatus,
} from "@testingmcp/shared";

function serializeUserSummary(user: User): UserSummary {
  return { id: user.id, username: user.username, role: user.role === "admin" ? "admin" : "member" };
}

export function serializeTargetUrl(url: TargetUrl): TargetUrlRecord {
  return {
    id: url.id,
    projectId: url.projectId,
    url: url.url,
    title: url.title,
    lastInspectedAt: url.lastInspectedAt ? url.lastInspectedAt.toISOString() : null,
  };
}

export function serializeProject(
  project: Project & { urls: TargetUrl[] },
): ProjectRecord {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt.toISOString(),
    urls: project.urls.map(serializeTargetUrl),
  };
}

export function serializeChatMessage(message: ChatMessage): ChatMessageRecord {
  return {
    id: message.id,
    projectId: message.projectId,
    role: message.role as "user" | "assistant",
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

export function serializeTestStep(step: TestStep): TestStepRecord {
  return {
    id: step.id,
    testCaseId: step.testCaseId,
    order: step.order,
    action: step.action as TestStepAction,
    selector: step.selector
      ? (JSON.parse(step.selector) as ElementSelector)
      : null,
    locatorCandidates: step.locatorCandidates
      ? (JSON.parse(step.locatorCandidates) as ElementSelector[])
      : null,
    value: step.value,
    description: step.description,
    enabled: step.enabled,
  };
}

export function serializeTestCase(
  testCase: TestCase & {
    steps: TestStep[];
    createdBy?: User | null;
    lastModifiedBy?: User | null;
    _count?: { changeRequests: number };
  },
): TestCaseRecord {
  return {
    id: testCase.id,
    projectId: testCase.projectId,
    urlId: testCase.urlId,
    title: testCase.title,
    objective: testCase.objective,
    preconditions: testCase.preconditions,
    testData: JSON.parse(testCase.testData) as Record<string, unknown>,
    expectedResult: testCase.expectedResult,
    priority: testCase.priority as TestCasePriority,
    type: testCase.type as TestCaseType,
    module: testCase.module,
    status: testCase.status as TestCaseStatus,
    steps: testCase.steps
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(serializeTestStep),
    createdBy: testCase.createdBy ? serializeUserSummary(testCase.createdBy) : null,
    openChangeRequestCount: testCase._count?.changeRequests ?? 0,
    sourcePrompt: testCase.sourcePrompt,
    tags: JSON.parse(testCase.tags) as string[],
    version: testCase.version,
    lastModifiedBy: testCase.lastModifiedBy ? serializeUserSummary(testCase.lastModifiedBy) : null,
    createdAt: testCase.createdAt.toISOString(),
    updatedAt: testCase.updatedAt.toISOString(),
  };
}

export function serializeScreenshot(shot: Screenshot): ScreenshotRecord {
  return {
    id: shot.id,
    testRunResultId: shot.testRunResultId,
    stepOrder: shot.stepOrder,
    filePath: shot.filePath,
    takenAt: shot.takenAt.toISOString(),
  };
}

export function serializeTestRunResult(
  result: TestRunResult & { screenshots: Screenshot[] },
): TestRunResultRecord {
  return {
    id: result.id,
    testRunId: result.testRunId,
    testStepId: result.testStepId,
    stepOrder: result.stepOrder,
    action: result.action as TestRunResultRecord["action"],
    status: result.status as TestRunResultRecord["status"],
    actualResult: result.actualResult,
    errorMessage: result.errorMessage,
    suggestedFix: result.suggestedFix,
    recovered: result.recovered,
    durationMs: result.durationMs,
    pageUrl: result.pageUrl,
    screenshots: result.screenshots.map(serializeScreenshot),
  };
}

export function serializeTokenUsage(usage: TokenUsage): TokenUsageRecord {
  return {
    id: usage.id,
    projectId: usage.projectId,
    source: usage.source as TokenUsageSource,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    costUsd: usage.costUsd,
    createdAt: usage.createdAt.toISOString(),
  };
}

export function serializeExecutionLog(log: ExecutionLog): ExecutionLogRecord {
  return {
    id: log.id,
    testRunId: log.testRunId,
    level: log.level as ExecutionLogRecord["level"],
    category: log.category as ExecutionLogCategory,
    message: log.message,
    timestamp: log.timestamp.toISOString(),
  };
}

export function serializeIssuePush(row: IssuePush): IssuePushRecord {
  return {
    id: row.id,
    testRunId: row.testRunId,
    type: row.type as IntegrationType,
    status: row.status as IssuePushStatus,
    issueKey: row.issueKey,
    issueUrl: row.issueUrl,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    pushedAt: row.pushedAt ? row.pushedAt.toISOString() : null,
  };
}

export function serializeTestRun(
  run: TestRun & {
    results: (TestRunResult & { screenshots: Screenshot[] })[];
    logs: ExecutionLog[];
    issuePushes?: IssuePush[];
  },
): TestRunRecord {
  return {
    id: run.id,
    testCaseId: run.testCaseId,
    environmentId: run.environmentId,
    batchId: run.batchId,
    status: run.status as TestRunRecord["status"],
    triggeredBy: run.triggeredBy,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    tracePath: run.tracePath,
    videoPath: run.videoPath,
    continuedFromChat: run.continuedFromChat,
    resumedFromRunId: run.resumedFromRunId,
    resumedFromStepOrder: run.resumedFromStepOrder,
    dataRowIndex: run.dataRowIndex,
    inheritedResults: [],
    results: run.results
      .slice()
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .map(serializeTestRunResult),
    logs: run.logs.map(serializeExecutionLog),
    issuePushes: (run.issuePushes ?? []).map(serializeIssuePush),
  };
}

export function serializeEnvironment(environment: Environment): EnvironmentRecord {
  return {
    id: environment.id,
    projectId: environment.projectId,
    name: environment.name,
    baseUrl: environment.baseUrl,
    browser: environment.browser as EnvironmentRecord["browser"],
    headless: environment.headless,
    viewportWidth: environment.viewportWidth,
    viewportHeight: environment.viewportHeight,
    isDefault: environment.isDefault,
    hasCredentials: environment.credentialsEncrypted !== null,
    createdAt: environment.createdAt.toISOString(),
    updatedAt: environment.updatedAt.toISOString(),
  };
}

export function serializeVisualDiff(diff: VisualDiff): VisualDiffRecord {
  return {
    id: diff.id,
    testStepId: diff.testStepId,
    testRunResultId: diff.testRunResultId,
    baselinePath: diff.baselinePath,
    actualPath: diff.actualPath,
    diffPath: diff.diffPath,
    diffPercent: diff.diffPercent,
    status: diff.status as VisualDiffStatus,
    createdAt: diff.createdAt.toISOString(),
    resolvedAt: diff.resolvedAt ? diff.resolvedAt.toISOString() : null,
  };
}

export function serializeHealingEvent(event: HealingEvent): HealingEventRecord {
  return {
    id: event.id,
    testStepId: event.testStepId,
    testRunResultId: event.testRunResultId,
    oldSelector: JSON.parse(event.oldSelector) as ElementSelector,
    newSelector: JSON.parse(event.newSelector) as ElementSelector,
    confidence: event.confidence as HealingEventRecord["confidence"],
    note: event.note,
    screenshotPath: event.screenshotId,
    approved: event.approved,
    dismissed: event.dismissed,
    createdAt: event.createdAt.toISOString(),
  };
}
