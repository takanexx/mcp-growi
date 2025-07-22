import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const GROWI_API_BASE = "https://growi.myasp.jp/_api/v3";

// Growiページ一覧取得
async function fetchGrowiPages(apiToken: string): Promise<string[]> {
  try {
    const res = await fetch(`${GROWI_API_BASE}/pages/list`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    if (!data.pages || !Array.isArray(data.pages)) {
      throw new Error("Invalid response format from Growi API");
    }
    // ページパスのみ抽出
    return data.pages.map((page: any) => page.path || "");
  } catch (error) {
    console.error("Error fetching Growi pages:", error);
    return [];
  }
}

/**
 * 指定IDのGrowiページ本文を取得
 */
async function fetchGrowiPageBodyById(id: string, apiToken: string): Promise<{ ok: boolean; body?: string; error?: string }> {
  try {
    const url = `${GROWI_API_BASE}/page?pageId=${id}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP error! status: ${res.status}` };
    }
    const data = await res.json();

    if (data.ok === false) {
      return { ok: false, error: data.error || "Growi API returned ok: false" };
    }
    if (!data.page) {
      return { ok: false, error: "ページが存在しません" };
    }
    if (data.page.revision && typeof data.page.revision.body === "string") {
      return { ok: true, body: data.page.revision.body };
    } else {
      return { ok: false, error: "本文が取得できませんでした" };
    }
  } catch (error: any) {
    if (error && error.response && typeof error.response.text === "function") {
      const text = await error.response.text();
      console.error("Error fetching Growi page body by id:", error, text);
      return { ok: false, error: (error?.message || String(error)) + " | body: " + text };
    } else {
      console.error("Error fetching Growi page body by id:", error);
      return { ok: false, error: error?.message || String(error) };
    }
  }
}

/**
 * 指定パスのGrowiページ本文を取得
 */
async function fetchGrowiPageBody(path: string, apiToken: string): Promise<{ ok: boolean; body?: string; error?: string }> {
  try {
    const url = `${GROWI_API_BASE}/page?path=${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP error! status: ${res.status}` };
    }
    const data = await res.json();

    // Growi API仕様に従いエラーハンドリングを強化
    if (data.ok === false) {
      return { ok: false, error: data.error || "Growi API returned ok: false" };
    }
    if (!data.page) {
      return { ok: false, error: "ページが存在しません" };
    }
    if (data.page.revision && typeof data.page.revision.body === "string") {
      return { ok: true, body: data.page.revision.body };
    } else {
      return { ok: false, error: "本文が取得できませんでした" };
    }
  } catch (error: any) {
    // レスポンスbodyもエラー内容に含める
    if (error && error.response && typeof error.response.text === "function") {
      const text = await error.response.text();
      console.error("Error fetching Growi page body:", error, text);
      return { ok: false, error: (error?.message || String(error)) + " | body: " + text };
    } else {
      console.error("Error fetching Growi page body:", error);
      return { ok: false, error: error?.message || String(error) };
    }
  }
}

// Growiページ作成
async function createGrowiPage(path: string, body: string, apiToken: string): Promise<{ ok: boolean; pageId?: string; error?: string }> {
  try {
    // curlと同じbody・ヘッダーで送信
    const requestBody = {
      path,
      body,
      grant: 1,
    };
    console.log("createGrowiPage requestBody:", requestBody);

    const res = await fetch(`${GROWI_API_BASE}/page`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    let responseText = await res.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      data = {};
    }

    if (!res.ok) {
      return { ok: false, error: `HTTP error! status: ${res.status}, body: ${responseText}` };
    }
    if (data.page && data.page._id) {
      return { ok: true, pageId: data.page._id };
    } else {
      return { ok: false, error: data.error || "Unknown error, body: " + responseText };
    }
  } catch (error: any) {
    console.error("Error creating Growi page:", error);
    return { ok: false, error: error?.message || String(error) };
  }
}

// [1] サーバーインスタンスの初期化
const server = new Server(
  {
    name: "mcp-growi",
    version: "1.0.0",
    settingsSchema: {
      type: "object",
      properties: {
        apiToken: {
          type: "string",
          title: "Growi APIトークン",
          description: "Growi APIにアクセスするためのトークンを入力してください",
        },
      },
      required: ["apiToken"],
    },
    // 実行される際の初期プロンプト
    prompts: [
      {
        role: "system",
        content: `
          Growi MCPツールを操作する際は、以下の点に注意してください:

          - 必ず「こんにちは」と挨拶してから始めること。
          - ページが見つからない場合は、「10_20_Wikiフォルダ構成(https://growi.myasp.jp/6867bd3303ef1b644f7afb28)」を参照すること。
          - ページの削除は絶対に行わないこと。
          - ページの編集・作成時は、必ずpathとbodyの両方を指定すること。
          - 同じページへの連続書き込みは1秒以上間隔を空けること。
          `.trim()
      },
    ],
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// [2] 利用可能なToolの一覧を返す
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_pages",
        description: "Growiの全ページタイトル一覧を取得します",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "create_page",
        description: "指定したパスと本文でGrowiに新規ページを作成します",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "作成するページのパス" },
            body: { type: "string", description: "ページ本文" },
          },
          required: ["path", "body"],
        },
      },
      {
        name: "edit_page",
        description: "指定したパスのGrowiページを編集します（本文を上書き）",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "編集するページのパス" },
            body: { type: "string", description: "新しいページ本文" },
          },
          required: ["path", "body"],
        },
      },
      {
        name: "get_page",
        description: "指定したパスのGrowiページ本文を取得します",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "取得したいページのパス（例: /foo/bar）" },
          },
          required: ["path"],
        },
      },
      {
        name: "get_page_by_id",
        description: "指定したIDのGrowiページ本文を取得します",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "取得したいページのID" },
          },
          required: ["id"],
        },
      },
    ],
  };
});

// [3] Toolの利用
server.setRequestHandler(CallToolRequestSchema, async (request, context: any) => {
  // context.settings または process.env からAPIトークンを取得
  const apiToken = context?.settings?.apiToken || process.env.apiToken;
  if (!apiToken) {
    return {
      content: [
        {
          type: "text",
          text: "APIトークンが設定されていません。MCPサーバー設定画面でAPIトークンを入力するか、envでapiTokenを指定してください。",
        },
      ],
    };
  }

  if (request.params.name === "get_pages") {
    const titles = await fetchGrowiPages(apiToken);

    if (titles.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "ページタイトルの取得に失敗しました",
          },
        ],
      };
    }

    const resultText = `取得したページタイトル一覧:\n\n${titles.join("\n")}`;

    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  } else if (request.params.name === "create_page") {
    const { path, body } = request.params.arguments as any;
    if (!path || !body) {
      return {
        content: [
          {
            type: "text",
            text: `pathとbodyの両方が必要です\nrequest.params: ${JSON.stringify(request.params)}`,
          },
        ],
      };
    }
    const result = await createGrowiPage(path, body, apiToken);
    if (result.ok) {
      return {
        content: [
          {
            type: "text",
            text: `ページ作成に成功しました（ID: ${result.pageId}）`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `ページ作成に失敗しました: ${result.error || "不明なエラー"}`,
          },
        ],
      };
    }
  } else if (request.params.name === "edit_page") {
    const { path, body } = request.params.arguments as any;
    if (!path || !body) {
      return {
        content: [
          {
            type: "text",
            text: `pathとbodyの両方が必要です\nrequest.params: ${JSON.stringify(request.params)}`,
          },
        ],
      };
    }
    const result = await createGrowiPage(path, body, apiToken);
    if (result.ok) {
      return {
        content: [
          {
            type: "text",
            text: `ページ編集に成功しました（ID: ${result.pageId}）`,
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `ページ編集に失敗しました: ${result.error || "不明なエラー"}`,
          },
        ],
      };
    }
  } else if (request.params.name === "get_page") {
    const { path } = request.params.arguments as any;
    if (!path) {
      return {
        content: [
          {
            type: "text",
            text: `pathが必要です\nrequest.params: ${JSON.stringify(request.params)}`,
          },
        ],
      };
    }
    const result = await fetchGrowiPageBody(path, apiToken);
    if (result.ok) {
      return {
        content: [
          {
            type: "text",
            text: result.body ?? "",
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `ページ本文の取得に失敗しました: ${result.error || "不明なエラー"}`,
          },
        ],
      };
    }
  } else if (request.params.name === "get_page_by_id") {
    const { id } = request.params.arguments as any;
    if (!id) {
      return {
        content: [
          {
            type: "text",
            text: `idが必要です\nrequest.params: ${JSON.stringify(request.params)}`,
          },
        ],
      };
    }
    const result = await fetchGrowiPageBodyById(id, apiToken);
    if (result.ok) {
      return {
        content: [
          {
            type: "text",
            text: result.body ?? "",
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: `ページ本文の取得に失敗しました: ${result.error || "不明なエラー"}`,
          },
        ],
      };
    }
  } else {
    throw new Error("Unknown tool");
  }
});

const transport = new StdioServerTransport();
server.connect(transport);
