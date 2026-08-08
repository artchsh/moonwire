/**
 * Hand-authored OpenAPI 3.1 document describing the public Moonwire API.
 * Kept in lockstep with the routers; both auth schemes (cookie + bearer) are
 * declared so agents can discover how to authenticate.
 */

type Op = {
  summary: string;
  scope?: "read" | "write" | "admin" | "public";
  requestBody?: boolean;
};

function operation(method: string, op: Op) {
  const security =
    op.scope === "public"
      ? []
      : op.scope === "admin"
        ? [{ cookieAuth: [] }]
        : [{ cookieAuth: [] }, { bearerAuth: [] }];
  return {
    [method]: {
      summary: op.summary,
      security,
      ...(op.requestBody
        ? { requestBody: { content: { "application/json": { schema: { type: "object" } } } } }
        : {}),
      responses: {
        "200": { description: "Success" },
        "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        "401": { description: "Unauthenticated" },
        "403": { description: "Forbidden" },
        "404": { description: "Not found" },
        "409": { description: "Conflict / relocation required" },
      },
    },
  };
}

export function buildOpenApi() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Moonwire API",
      version: "1.0.0",
      description:
        "Self-hosted multi-board kanban. The same versioned API serves the web UI and AI agents. " +
        "Authenticate as a human via the session cookie, or as an agent via a Bearer token " +
        "(read or write scope).",
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "mw_session" },
        bearerAuth: { type: "http", scheme: "bearer", description: "Agent token, e.g. `mw_...`" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                fields: { type: "object", additionalProperties: { type: "string" } },
              },
              required: ["code", "message"],
            },
          },
        },
      },
    },
    paths: {
      "/health": operation("get", { summary: "Liveness + database probe", scope: "public" }),
      "/api/v1/auth/session": operation("get", { summary: "Current session / setup state", scope: "public" }),
      "/api/v1/auth/setup": operation("post", { summary: "First-run administrator setup", scope: "public", requestBody: true }),
      "/api/v1/auth/login": operation("post", { summary: "Administrator login", scope: "public", requestBody: true }),
      "/api/v1/auth/logout": operation("post", { summary: "Administrator logout", scope: "admin" }),
      "/api/v1/tokens": {
        ...operation("get", { summary: "List agent tokens", scope: "admin" }),
        ...operation("post", { summary: "Create an agent token (plaintext shown once)", scope: "admin", requestBody: true }),
      },
      "/api/v1/tokens/{id}": operation("delete", { summary: "Revoke an agent token", scope: "admin" }),
      "/api/v1/boards": {
        ...operation("get", { summary: "List boards", scope: "read" }),
        ...operation("post", { summary: "Create a board", scope: "write", requestBody: true }),
      },
      "/api/v1/boards/{id}/snapshot": operation("get", { summary: "Full board snapshot (columns + cards + attachments)", scope: "read" }),
      "/api/v1/boards/{id}/events": operation("get", { summary: "Change log since ?since=<revision>; resync=true means refetch the snapshot", scope: "read" }),
      "/api/v1/boards/{id}": {
        ...operation("patch", { summary: "Rename a board (version-checked)", scope: "write", requestBody: true }),
        ...operation("delete", { summary: "Delete a board and its contents", scope: "write" }),
      },
      "/api/v1/boards/{id}/move": operation("post", { summary: "Reorder a board", scope: "write", requestBody: true }),
      "/api/v1/boards/{id}/columns": operation("post", { summary: "Create a column", scope: "write", requestBody: true }),
      "/api/v1/columns/{id}": {
        ...operation("patch", { summary: "Rename a column (version-checked)", scope: "write", requestBody: true }),
        ...operation("delete", { summary: "Delete a column (relocate cards if non-empty)", scope: "write", requestBody: true }),
      },
      "/api/v1/columns/{id}/move": operation("post", { summary: "Reorder a column", scope: "write", requestBody: true }),
      "/api/v1/columns/{id}/cards": operation("post", { summary: "Create a card", scope: "write", requestBody: true }),
      "/api/v1/cards/{id}": {
        ...operation("get", { summary: "Get a card with attachments", scope: "read" }),
        ...operation("patch", { summary: "Edit card title/description (version-checked)", scope: "write", requestBody: true }),
        ...operation("delete", { summary: "Delete a card", scope: "write" }),
      },
      "/api/v1/cards/{id}/move": operation("post", { summary: "Move a card between/within columns", scope: "write", requestBody: true }),
      "/api/v1/cards/{cardId}/attachments": {
        ...operation("get", { summary: "List a card's attachments", scope: "read" }),
        ...operation("post", { summary: "Upload image attachments (multipart/form-data)", scope: "write", requestBody: true }),
      },
      "/api/v1/attachments/{id}/content": operation("get", { summary: "Download original image bytes", scope: "read" }),
      "/api/v1/attachments/{id}/thumbnail": operation("get", { summary: "Download image for thumbnails", scope: "read" }),
      "/api/v1/attachments/{id}": operation("delete", { summary: "Delete an attachment", scope: "write" }),
      "/api/v1/export": operation("get", { summary: "Export all data as JSON", scope: "read" }),
      "/api/v1/restore": operation("post", { summary: "Replace all data from a JSON export", scope: "admin", requestBody: true }),
      "/api/v1/storage": operation("get", { summary: "Row counts and attachment byte usage", scope: "read" }),
    },
  };
}
