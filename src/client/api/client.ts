import type {
  SessionInfo,
  AgentTokenDto,
  CreatedAgentTokenDto,
  Scope,
  BoardDto,
  BoardSnapshot,
  ColumnDto,
  CardDto,
  StorageInfo,
  UserDto,
  ApiErrorBody,
  ErrorCode,
} from "../../shared/api";

export class ApiClientError extends Error {
  code: ErrorCode;
  status: number;
  fields?: Record<string, string>;
  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = body.error.code;
    this.fields = body.error.fields;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new ApiClientError(res.status, (data as ApiErrorBody) ?? { error: { code: "INTERNAL_ERROR", message: "Request failed" } });
  }
  return data as T;
}

export const api = {
  // Auth
  session: () => request<SessionInfo>("GET", "/api/v1/auth/session"),
  setup: (username: string, password: string) =>
    request<SessionInfo>("POST", "/api/v1/auth/setup", { username, password }),
  login: (username: string, password: string) =>
    request<SessionInfo>("POST", "/api/v1/auth/login", { username, password }),
  logout: () => request<void>("POST", "/api/v1/auth/logout"),

  // Users
  listUsers: () => request<{ users: UserDto[] }>("GET", "/api/v1/users"),
  createUser: (username: string, password: string) =>
    request<UserDto>("POST", "/api/v1/users", { username, password }),
  deleteUser: (id: string) => request<void>(`DELETE`, `/api/v1/users/${id}`),

  // Tokens
  listTokens: () => request<{ tokens: AgentTokenDto[] }>("GET", "/api/v1/tokens"),
  createToken: (name: string, scope: Scope) =>
    request<CreatedAgentTokenDto>("POST", "/api/v1/tokens", { name, scope }),
  deleteToken: (id: string) => request<void>("DELETE", `/api/v1/tokens/${id}`),

  // Boards
  listBoards: () => request<{ boards: BoardDto[] }>("GET", "/api/v1/boards"),
  createBoard: (name: string) => request<BoardDto>("POST", "/api/v1/boards", { name }),
  snapshot: (id: string) => request<BoardSnapshot>("GET", `/api/v1/boards/${id}/snapshot`),
  updateBoard: (id: string, version: number, name: string) =>
    request<BoardDto>("PATCH", `/api/v1/boards/${id}`, { version, name }),
  moveBoard: (id: string, version: number, beforeId?: string | null, afterId?: string | null) =>
    request<BoardDto>("POST", `/api/v1/boards/${id}/move`, { version, beforeId, afterId }),
  deleteBoard: (id: string) => request<void>("DELETE", `/api/v1/boards/${id}`),

  // Columns
  createColumn: (boardId: string, name: string) =>
    request<ColumnDto>("POST", `/api/v1/boards/${boardId}/columns`, { name }),
  updateColumn: (id: string, version: number, name: string) =>
    request<ColumnDto>("PATCH", `/api/v1/columns/${id}`, { version, name }),
  moveColumn: (id: string, version: number, beforeId?: string | null, afterId?: string | null) =>
    request<ColumnDto>("POST", `/api/v1/columns/${id}/move`, { version, beforeId, afterId }),
  deleteColumn: (id: string, relocateToColumnId?: string) =>
    request<void>("DELETE", `/api/v1/columns/${id}`, relocateToColumnId ? { relocateToColumnId } : {}),

  // Cards
  createCard: (columnId: string, title: string, description?: string) =>
    request<CardDto>("POST", `/api/v1/columns/${columnId}/cards`, { title, description }),
  getCard: (id: string) => request<CardDto>("GET", `/api/v1/cards/${id}`),
  updateCard: (
    id: string,
    version: number,
    patch: { title?: string; description?: string; completed?: boolean },
  ) => request<CardDto>("PATCH", `/api/v1/cards/${id}`, { version, ...patch }),
  moveCard: (
    id: string,
    version: number,
    toColumnId: string,
    beforeId?: string | null,
    afterId?: string | null,
  ) => request<CardDto>("POST", `/api/v1/cards/${id}/move`, { version, toColumnId, beforeId, afterId }),
  deleteCard: (id: string) => request<void>("DELETE", `/api/v1/cards/${id}`),

  // Attachments
  uploadAttachments: (cardId: string, files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    return fetch(`/api/v1/cards/${cardId}/attachments`, {
      method: "POST",
      credentials: "include",
      body: form,
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok && res.status !== 400) throw new ApiClientError(res.status, data as ApiErrorBody);
      return data as { attachments: CardDto["attachments"]; errors: Array<{ filename: string; error: string }> };
    });
  },
  deleteAttachment: (id: string) => request<void>("DELETE", `/api/v1/attachments/${id}`),

  // Operations
  storage: () => request<StorageInfo>("GET", "/api/v1/storage"),
  exportData: () => request<unknown>("GET", "/api/v1/export"),
};
