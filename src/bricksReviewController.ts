import * as path from "path";
import * as vscode from "vscode";

import { createNewMMXCard, ReviewCard, ReviewRating } from "./algo/mmx";
import { BABA, BabaStr } from "./BABA";
import { bricksDataService } from "./bricksData/BricksDataService";
import { treeDataService } from "./treeData/TreeDataService";

export const onReviewUpdated = new vscode.EventEmitter<string>();

type ReviewRootKind = "review" | "new";

interface ReviewRootItem extends vscode.TreeItem {
  kind: "root";
  rootKind: ReviewRootKind;
}

interface ReviewLeafItem extends vscode.TreeItem {
  kind: "leaf";
  qid: string;
  card: ReviewCard;
}

type ReviewTreeItem = ReviewRootItem | ReviewLeafItem;

const REVIEW_ROOT_LABEL = "\u6e29\u6545\u77e5\u65b0";
const NEW_ROOT_LABEL = "\u65e5\u62f1\u4e00\u5352";
const MAX_DAILY_REVIEW = 10;

export async function showReviewPanel(qid: string, problemName: string): Promise<void> {
  const currentCard = bricksDataService.getCard(qid);
  const isNew = currentCard === undefined;
  const card = currentCard || createNewMMXCard();

  const panel = vscode.window.createWebviewPanel(
    "lcprReviewRating",
    `${isNew ? NEW_ROOT_LABEL : REVIEW_ROOT_LABEL}: ${problemName}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: false }
  );

  panel.webview.html = buildReviewHtml(problemName, isNew, card);

  const receiveDisposable = panel.webview.onDidReceiveMessage(
    async (message: { command: string; rating?: ReviewRating }) => {
      if (message.command === "dismiss") {
        panel.dispose();
        return;
      }

      if (message.command === "submitRating" && message.rating !== undefined) {
        await bricksDataService.submitReview(qid, message.rating);
        panel.dispose();
        onReviewUpdated.fire(qid);
        vscode.window.showInformationMessage("\u5df2\u8bb0\u5f55\u672c\u6b21\u5b66\u4e60\u60c5\u51b5\u3002");
      }
    }
  );

  panel.onDidDispose(() => receiveDisposable.dispose());
}

export class BricksReviewTreeProvider implements vscode.TreeDataProvider<ReviewTreeItem> {
  private onDidChange = new vscode.EventEmitter<void>();
  private context: vscode.ExtensionContext | undefined;
  readonly onDidChangeTreeData = this.onDidChange.event;

  constructor() {
    onReviewUpdated.event(() => this.refresh());
  }

  refresh(): void {
    this.onDidChange.fire();
  }

  initialize(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  getTreeItem(element: ReviewTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ReviewTreeItem): ReviewTreeItem[] {
    const reviewQueue = bricksDataService.getDueQueue();
    const newQueue = bricksDataService.getTodayLearnedQueue();

    if (!element) {
      return [
        this.createRootItem("review", REVIEW_ROOT_LABEL, `${reviewQueue.length} / ${MAX_DAILY_REVIEW}`),
        this.createRootItem("new", NEW_ROOT_LABEL, `${newQueue.length}`),
      ];
    }

    if (element.kind === "root") {
      const items = element.rootKind === "review" ? reviewQueue : newQueue;
      if (items.length === 0) {
        return [this.createEmptyLeaf(element.rootKind)];
      }
      return items.map(({ qid, card }) => this.createLeaf(qid, card, element.rootKind));
    }

    return [];
  }

  private createRootItem(rootKind: ReviewRootKind, label: string, description: string): ReviewRootItem {
    return {
      kind: "root",
      rootKind,
      label,
      description,
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      contextValue: "reviewRoot",
    };
  }

  private createEmptyLeaf(rootKind: ReviewRootKind): ReviewLeafItem {
    return {
      kind: "leaf",
      qid: "",
      card: createNewMMXCard(0),
      label:
        rootKind === "review"
          ? "\u4eca\u5929\u6ca1\u6709\u5206\u914d\u5230\u590d\u4e60\u9898\u76ee"
          : "\u4eca\u5929\u8fd8\u6ca1\u6709\u65b0\u7684\u5b66\u4e60\u8bb0\u5f55",
      description:
        rootKind === "review"
          ? `\u6bcf\u65e5\u4e0a\u9650 ${MAX_DAILY_REVIEW} \u9898\uff0c\u660e\u5929\u518d\u7ee7\u7eed`
          : "\u505a\u5b8c\u4e00\u9053\u9898\u5e76\u6253\u5206\u540e\u4f1a\u51fa\u73b0\u5728\u8fd9\u91cc",
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: "reviewEmpty",
    };
  }

  private createLeaf(qid: string, card: ReviewCard, rootKind: ReviewRootKind): ReviewLeafItem {
    const questionProxy = BABA.getProxy(BabaStr.QuestionDataProxy);
    const questionNode = questionProxy.getNodeByQid(qid) || questionProxy.getNodeById(qid);
    const baseItem = questionNode ? (treeDataService.getTreeItem(questionNode) as vscode.TreeItem) : undefined;
    const fallbackLabel = questionNode ? `ID:${questionNode.id}.${questionNode.name} ` : `ID:${qid}`;
    const tooltipParts = [typeof baseItem?.tooltip === "string" ? baseItem.tooltip : ""];

    if (questionNode?.difficulty) {
      tooltipParts.push(`\u96be\u5ea6: ${questionNode.difficulty}`);
    }
    tooltipParts.push(`\u72b6\u6001: ${this.getStateText(card.state)}`);
    tooltipParts.push(`\u590d\u4e60\u6b21\u6570: ${card.repetition}`);
    tooltipParts.push(rootKind === "review" ? "\u5206\u7c7b: \u6e29\u6545\u77e5\u65b0" : "\u5206\u7c7b: \u65e5\u62f1\u4e00\u5352");

    return {
      kind: "leaf",
      qid,
      card,
      label: baseItem?.label || fallbackLabel,
      iconPath: this.getReviewIconPath(baseItem),
      resourceUri: baseItem?.resourceUri || questionNode?.TNMUri,
      tooltip: tooltipParts.filter(Boolean).join("\n"),
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command:
        baseItem?.command ||
        ({
          command: "mmxlocal.openBricksQuestion",
          title: "Open question",
          arguments: [qid],
        } as vscode.Command),
      contextValue: "reviewLeaf",
    };
  }

  private getStateText(state: ReviewCard["state"]): string {
    return getStateText(state);
  }

  private getReviewIconPath(baseItem: vscode.TreeItem | undefined): vscode.TreeItem["iconPath"] {
    if (this.context) {
      return this.context.asAbsolutePath(path.join("resources", "check.png"));
    }

    return path.join(__dirname, "..", "..", "resources", "check.png") || baseItem?.iconPath;
  }
}

export const bricksReviewTreeProvider = new BricksReviewTreeProvider();

function buildReviewHtml(problemName: string, isNew: boolean, card: ReviewCard): string {
  const subtitle = isNew
    ? "\u8fd9\u9053\u9898\u5b8c\u6210\u540e\uff0c\u7ed9\u81ea\u5df1\u6253\u4e00\u4e2a\u7b80\u5355\u7684\u5206\u3002"
    : `\u5f53\u524d\u72b6\u6001\uff1a${getStateText(card.state)}\uff0c\u5df2\u590d\u4e60 ${card.repetition} \u6b21\u3002`;

  const bucketLabel = isNew ? NEW_ROOT_LABEL : REVIEW_ROOT_LABEL;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>\u5b66\u4e60\u6253\u5206</title>
  <style>
    :root {
      --bg: #101826;
      --panel: #182233;
      --border: #2e3b52;
      --text: #f3f6fb;
      --muted: #93a1b8;
      --green: #1fbf75;
      --amber: #f0a22e;
      --red: #e15858;
      --accent: #5ec2ff;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: radial-gradient(circle at top, #22304a 0%, #101826 58%, #080d16 100%);
      color: var(--text);
      font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
    }

    .panel {
      width: min(520px, 100%);
      background: rgba(24, 34, 51, 0.96);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 28px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.36);
    }

    .eyebrow {
      color: var(--accent);
      font-size: 12px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    h1 {
      margin: 12px 0 8px;
      font-size: 24px;
      line-height: 1.35;
      word-break: break-word;
    }

    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
    }

    .question {
      margin-top: 20px;
      padding: 16px;
      border-left: 3px solid var(--accent);
      background: rgba(94, 194, 255, 0.08);
      border-radius: 10px;
      color: var(--text);
    }

    .buttons {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 24px;
    }

    button {
      border: 1px solid transparent;
      border-radius: 14px;
      padding: 18px 12px;
      cursor: pointer;
      color: inherit;
      background: transparent;
      transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
      font: inherit;
    }

    button:hover {
      transform: translateY(-1px);
    }

    .btn-title {
      display: block;
      font-size: 16px;
      font-weight: 700;
    }

    .easy {
      border-color: rgba(31, 191, 117, 0.35);
      background: rgba(31, 191, 117, 0.12);
    }

    .fuzzy {
      border-color: rgba(240, 162, 46, 0.35);
      background: rgba(240, 162, 46, 0.12);
    }

    .again {
      border-color: rgba(225, 88, 88, 0.35);
      background: rgba(225, 88, 88, 0.12);
    }

    .footer {
      margin-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      color: var(--muted);
      font-size: 12px;
    }

    .link {
      background: none;
      border: none;
      padding: 0;
      color: var(--muted);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
  </style>
</head>
<body>
  <div class="panel">
    <div class="eyebrow">${bucketLabel}</div>
    <h1>${escapeHtml(problemName)}</h1>
    <p>${escapeHtml(subtitle)}</p>
    <div class="question">\u505a\u5b8c\u4e4b\u540e\uff0c\u5feb\u901f\u7ed9\u81ea\u5df1\u6253\u4e00\u4e2a\u5206\u5c31\u53ef\u4ee5\u3002</div>
    <div class="buttons">
      <button class="easy" onclick="rate(2)">
        <span class="btn-title">\u719f\u6089</span>
      </button>
      <button class="fuzzy" onclick="rate(1)">
        <span class="btn-title">\u6a21\u7cca</span>
      </button>
      <button class="again" onclick="rate(0)">
        <span class="btn-title">\u5fd8\u8bb0</span>
      </button>
    </div>
    <div class="footer">
      <span>\u5feb\u6377\u952e\uff1a1 \u5fd8\u8bb0\uff0c2 \u6a21\u7cca\uff0c3 \u719f\u6089\uff0cEsc \u8df3\u8fc7</span>
      <button class="link" onclick="dismiss()">\u8df3\u8fc7</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function rate(rating) {
      vscode.postMessage({ command: "submitRating", rating });
    }
    function dismiss() {
      vscode.postMessage({ command: "dismiss" });
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "1") rate(0);
      if (event.key === "2") rate(1);
      if (event.key === "3") rate(2);
      if (event.key === "Escape") dismiss();
    });
  </script>
</body>
</html>`;
}

function getStateText(state: ReviewCard["state"]): string {
  switch (state) {
    case "new":
      return "\u521d\u6b21\u590d\u4e60";
    case "learning":
      return "\u5b66\u4e60\u4e2d";
    case "relearning":
      return "\u91cd\u5b66\u4e2d";
    case "review":
      return "\u590d\u4e60\u4e2d";
    default:
      return state;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
