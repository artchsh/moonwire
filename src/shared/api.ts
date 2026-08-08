/**
 * Shared request/response types for the Moonwire API. Imported by both the
 * Worker (server) and the React client so the wire contract stays in one place.
 */

export type Scope = "read" | "write";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RELOCATION_REQUIRED"
  | "SETUP_ALREADY_COMPLETE"
  | "SETUP_REQUIRED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>;
  };
}

// ---- Auth ----

export interface SessionInfo {
  authenticated: boolean;
  setupRequired: boolean;
  username?: string;
}

export interface SetupRequest {
  username: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

/** A user account (an administrator). Passwords/hashes are never exposed. */
export interface UserDto {
  id: string;
  username: string;
  createdAt: number;
}

export interface CreateUserRequest {
  username: string;
  password: string;
}

export interface AgentTokenDto {
  id: string;
  name: string;
  scope: Scope;
  createdAt: number;
  lastUsedAt: number | null;
}

/** Returned only once, at creation time — the plaintext token is never stored. */
export interface CreatedAgentTokenDto extends AgentTokenDto {
  token: string;
}

export interface CreateTokenRequest {
  name: string;
  scope: Scope;
}

// ---- Boards / columns / cards ----

export interface BoardDto {
  id: string;
  name: string;
  position: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface ColumnDto {
  id: string;
  boardId: string;
  name: string;
  position: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface AttachmentDto {
  id: string;
  cardId: string;
  filename: string;
  contentType: string;
  size: number;
  width: number;
  height: number;
  position: number;
  createdAt: number;
  contentUrl: string;
  thumbnailUrl: string;
}

export interface CardDto {
  id: string;
  columnId: string;
  boardId: string;
  title: string;
  description: string;
  completed: boolean;
  position: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  attachments: AttachmentDto[];
}

export interface ColumnWithCards extends ColumnDto {
  cards: CardDto[];
}

export interface BoardSnapshot extends BoardDto {
  columns: ColumnWithCards[];
}

// Request bodies

export interface CreateBoardRequest {
  name: string;
}
export interface UpdateBoardRequest {
  name?: string;
  version: number;
}
export interface CreateColumnRequest {
  name: string;
}
export interface UpdateColumnRequest {
  name?: string;
  version: number;
}
export interface CreateCardRequest {
  title: string;
  description?: string;
}
export interface UpdateCardRequest {
  title?: string;
  description?: string;
  completed?: boolean;
  version: number;
}

/** Move a card to a destination column, positioned between two neighbours. */
export interface MoveCardRequest {
  toColumnId: string;
  beforeId?: string | null;
  afterId?: string | null;
  version: number;
}

/** Reorder a column within its board, positioned between two neighbours. */
export interface MoveColumnRequest {
  beforeId?: string | null;
  afterId?: string | null;
  version: number;
}

export interface MoveBoardRequest {
  beforeId?: string | null;
  afterId?: string | null;
  version: number;
}

/** Deleting a non-empty column requires naming where its cards go. */
export interface DeleteColumnRequest {
  relocateToColumnId?: string;
}

// ---- Operations ----

export interface StorageInfo {
  boards: number;
  columns: number;
  cards: number;
  attachments: number;
  attachmentBytes: number;
}

export interface ExportEnvelope {
  moonwireExportVersion: 1;
  exportedAt: number;
  boards: BoardDto[];
  columns: ColumnDto[];
  cards: Array<Omit<CardDto, "attachments">>;
  attachments: Array<Omit<AttachmentDto, "contentUrl" | "thumbnailUrl">>;
}
