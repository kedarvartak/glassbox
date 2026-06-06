/** JSON contract with the local CLI server (cli/src/server.ts). */

export type SegmentStatus = "live" | "gone" | "stale" | "spent" | "duplicate" | "unknown";

export interface SessionListItem {
  readonly locator: string;
  readonly sessionId: string;
  readonly projectPath: string;
  readonly tool: string;
  readonly endedAt: string;
  readonly messageCount: number;
  readonly toolCallCount: number;
  readonly memoryOpCount: number;
}

export interface SessionDetail {
  readonly meta: {
    readonly sessionId: string;
    readonly projectPath: string;
    readonly gitBranch: string | null;
    readonly toolVersion: string | null;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly messageCount: number;
    readonly turnCount: number;
    readonly toolCallCount: number;
    readonly fileOpCount: number;
    readonly memoryOpCount: number;
    readonly compactionCount: number;
    readonly warningCount: number;
  };
  readonly compaction:
    | {
        readonly observed: true;
        readonly count: number;
        readonly events: readonly {
          readonly id: string;
          readonly timestamp: string;
          readonly tokensBefore: number;
          readonly tokensAfter: number;
          readonly evictedMessageCount: number;
          readonly summary: string | null;
        }[];
      }
    | {
        readonly observed: false;
        readonly count: 0;
        readonly note: string;
      };
  readonly cost: {
    readonly totalUsd: number;
    readonly breakdown: {
      readonly inputUsd: number;
      readonly outputUsd: number;
      readonly cacheReadUsd: number;
      readonly cacheWriteUsd: number;
    };
    readonly cacheSavingsUsd: number;
    readonly models: readonly { readonly model: string; readonly priced: boolean }[];
    readonly unpricedMessages: number;
  };
  readonly xray: {
    readonly totalTokens: number;
    readonly segmentCount: number;
    readonly composition: readonly { readonly source: string; readonly tokens: number }[];
  };
  readonly reclaimable: {
    readonly totalTokens: number;
    readonly reclaimableTokens: number;
    readonly reclaimablePct: number;
    readonly byStatus: Readonly<Record<SegmentStatus, number>>;
    readonly wastedUsdPerTurn: number | null;
    readonly items: readonly {
      readonly status: SegmentStatus;
      readonly label: string;
      readonly reason: string;
      readonly tokens: number;
    }[];
  };
  readonly accuracy: {
    readonly note: string;
    readonly ratio: number | null;
    readonly sampleResponses: number;
  };
  readonly clean: {
    readonly actions: readonly {
      readonly type: "stop_referencing" | "re_read";
      readonly path: string;
      readonly reason: string;
      readonly reclaimableTokens: number;
      readonly confidence: "provable" | "heuristic";
      readonly claudeMdSnippet: string;
    }[];
    readonly compact: {
      readonly reclaimablePct: number;
      readonly reclaimableTokens: number;
      readonly spentTokens: number;
      readonly duplicateTokens: number;
      readonly suggestedSummaryFocus: string;
      readonly estimatedUsdSaved: number | null;
      readonly command: string;
    } | null;
    readonly summary: {
      readonly actionCount: number;
      readonly reclaimableTokens: number;
      readonly reclaimablePct: number;
      readonly estimatedUsdSaved: number | null;
    };
  };
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  sessions: () => getJSON<SessionListItem[]>("/api/sessions"),
  session: (locator: string) =>
    getJSON<SessionDetail>(`/api/session?locator=${encodeURIComponent(locator)}`),
};
