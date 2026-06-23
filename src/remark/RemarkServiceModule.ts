/*
 * Filename: https://github.com/ccagml/leetcode-extension/src/remark/RemarkService.ts
 * Path: https://github.com/ccagml/leetcode-extension
 * Created Date: Saturday, October 14th 2023, 2:24:19 pm
 * Author: ccagml
 *
 * Copyright (c) 2023 ccagml . All rights reserved
 */

import {
  CancellationToken,
  CommentMode,
  CommentReply,
  CommentThread,
  CommentThreadCollapsibleState,
  Disposable,
  Position,
  Range,
  TextDocument,
  comments,
  window,
} from "vscode";

import { BABA, BABAMediator, BABAProxy, BabaStr, BaseCC } from "../BABA";
import { RemarkComment } from "../model/ConstDefind";
import { remarkDao } from "../dao/remarkDao";
import { getIncludeTemplate, includeTemplatesAuto } from "../utils/ConfigUtils";

interface IDocumentProblemInfo {
  fid?: string;
  qid?: string;
}

class RemarkService implements Disposable {
  private readonly remarkController;
  private readonly qidThreadMap: Map<string, CommentThread>;

  constructor() {
    this.qidThreadMap = new Map<string, CommentThread>();
    this.remarkController = comments.createCommentController("mmxlocal-remark", "MMX Local Remark");
    this.remarkController.options = { prompt: "新的笔记", placeHolder: "开始记录内容" };
    this.remarkController.commentingRangeProvider = {
      provideCommentingRanges: (_: TextDocument, __: CancellationToken) => undefined,
    };
  }

  private getProblemInfoByDocument(document: TextDocument): IDocumentProblemInfo {
    const content: string = document.getText();
    const matchResult: RegExpMatchArray | null = content.match(/@lc app=(.*) id=(.*) lang=(.*)/);
    if (!matchResult) {
      return {};
    }

    const fid = matchResult[2];
    const qid = BABA.getProxy(BabaStr.QuestionDataProxy).getQidByFid(fid);
    return {
      fid,
      qid: qid?.toString(),
    };
  }

  public async includeTemplates(document?: TextDocument): Promise<void> {
    const targetDocument = document || window.activeTextEditor?.document;
    if (!targetDocument) {
      void window.showWarningMessage("未找到当前题目的代码文件。");
      return;
    }

    const content: string = targetDocument.getText();
    const matchResult: RegExpMatchArray | null = content.match(/@lc app=(.*) id=(.*) lang=(.*)/);
    if (!matchResult || !matchResult[3]) {
      void window.showWarningMessage("当前文件不是 LeetCode 题目文件，无法插入模板。");
      return;
    }

    for (let i = 0; i < targetDocument.lineCount; i++) {
      const lineContent: string = targetDocument.lineAt(i).text;
      if (lineContent.indexOf("@lcpr-template-start") >= 0) {
        void window.showInformationMessage("模板已存在，无需重复插入。");
        return;
      }

      if (lineContent.indexOf("@lc code=start") >= 0) {
        const editor = window.activeTextEditor;
        if (!editor || editor.document.uri.toString() !== targetDocument.uri.toString()) {
          void window.showWarningMessage("请先激活当前题目的编辑器，再插入模板。");
          return;
        }

        await new Promise<void>((resolve) => {
          editor
            .edit((editBuilder) => {
              editBuilder.insert(new Position(i - 1, 0), getIncludeTemplate(matchResult[3]));
            })
            .then(async (success) => {
              if (success) {
                await editor.document.save();
                void window.showInformationMessage("已插入 includeTemplates。");
              }
              resolve();
            });
        });
        return;
      }
    }

    void window.showWarningMessage("未找到 @lc code=start，无法插入模板。");
  }

  public async startRemark(document: TextDocument): Promise<void> {
    const docInfo = this.getProblemInfoByDocument(document);
    if (!docInfo.qid) {
      return;
    }

    const existingThread = this.qidThreadMap.get(docInfo.qid);
    if (existingThread) {
      existingThread.dispose();
      this.qidThreadMap.delete(docInfo.qid);
    }

    const oldRemark = await this.getOldThreadRemarkByQid(docInfo.qid);
    for (let i = 0; i < document.lineCount; i++) {
      const lineContent: string = document.lineAt(i).text;
      if (lineContent.indexOf("@lc code=start") >= 0) {
        const thread = this.remarkController.createCommentThread(document.uri, new Range(i - 1, 0, i - 1, 0), oldRemark);
        thread.comments.forEach((comment) => {
          (comment as RemarkComment).parent = thread;
        });

        thread.contextValue = `qid=${docInfo.qid}`;
        thread.label = `${docInfo.fid || ""}`;
        thread.collapsibleState = CommentThreadCollapsibleState.Expanded;
        this.qidThreadMap.set(docInfo.qid, thread);
        break;
      }
    }
  }

  public async remarkCreateNote(reply: CommentReply): Promise<void> {
    await this.replyNote(reply);
  }

  public async remarkReplyNote(reply: CommentReply): Promise<void> {
    await this.replyNote(reply);
  }

  public async remarkDeleteNoteComment(comment: RemarkComment): Promise<void> {
    if (!comment.parent) {
      return;
    }

    comment.parent.comments = comment.parent.comments.filter((cmt) => (cmt as RemarkComment).id !== comment.id);
    await this.saveThreadRemark(comment.parent);
  }

  public async remarkCancelsaveNote(comment: RemarkComment): Promise<void> {
    if (!comment.parent) {
      return;
    }

    comment.parent.comments = comment.parent.comments.map((cmt) => {
      if ((cmt as RemarkComment).id === comment.id) {
        cmt.mode = CommentMode.Preview;
      }
      return cmt;
    });

    await this.saveThreadRemark(comment.parent);
  }

  public async remarkSaveNote(comment: RemarkComment): Promise<void> {
    await this.remarkCancelsaveNote(comment);
  }

  public async remarkEditNote(comment: RemarkComment): Promise<void> {
    if (!comment.parent) {
      return;
    }

    comment.parent.comments = comment.parent.comments.map((cmt) => {
      if ((cmt as RemarkComment).id === comment.id) {
        cmt.mode = CommentMode.Editing;
      }
      return cmt;
    });

    await this.saveThreadRemark(comment.parent);
  }

  private async replyNote(reply: CommentReply): Promise<void> {
    const thread = reply.thread;
    const newComment = new RemarkComment(reply.text, thread);
    thread.comments = [...thread.comments, newComment];
    await this.saveThreadRemark(thread);
  }

  private async saveThreadRemark(thread: CommentThread): Promise<void> {
    const params: URLSearchParams = new URLSearchParams(thread.contextValue || "");
    const qid = params.get("qid");
    if (!qid) {
      return;
    }

    const data = thread.comments.map((comment) => (comment as RemarkComment).getDbData());
    await remarkDao.setInfoByQid(qid, { data });
  }

  private async getOldThreadRemarkByQid(qid: string): Promise<RemarkComment[]> {
    const remarkData = await remarkDao.getInfoByQid(qid);
    const remarkDataBody = remarkData["data"] || [];
    return remarkDataBody.map((element) => RemarkComment.getObjByDbData(element));
  }

  public remarkClose(thread?: CommentThread): void {
    if (!thread) {
      return;
    }

    const params: URLSearchParams = new URLSearchParams(thread.contextValue || "");
    const qid = params.get("qid");
    thread.dispose();

    if (!qid) {
      return;
    }

    this.qidThreadMap.delete(qid);
  }

  public dispose(): void {
    this.qidThreadMap.forEach((thread) => thread.dispose());
    this.qidThreadMap.clear();
    this.remarkController.dispose();
  }
}

export const remarkService: RemarkService = new RemarkService();

export class RemarkProxy extends BABAProxy {
  static NAME = BabaStr.RemarkProxy;
  constructor() {
    super(RemarkProxy.NAME);
  }
}

export class RemarkMediator extends BABAMediator {
  static NAME = BabaStr.RemarkMediator;
  constructor() {
    super(RemarkMediator.NAME);
  }

  listNotificationInterests(): string[] {
    return [
      BabaStr.showProblemFinishOpen,
      BabaStr.BABACMD_remarkCreateNote,
      BabaStr.BABACMD_remarkClose,
      BabaStr.BABACMD_remarkReplyNote,
      BabaStr.BABACMD_remarkDeleteNoteComment,
      BabaStr.BABACMD_remarkCancelsaveNote,
      BabaStr.BABACMD_remarkSaveNote,
      BabaStr.BABACMD_remarkEditNote,
      BabaStr.BABACMD_startRemark,
      BabaStr.BABACMD_includeTemplates,
    ];
  }

  async handleNotification(_notification: BaseCC.BaseCC.INotification) {
    const body = _notification.getBody();
    switch (_notification.getName()) {
      case BabaStr.showProblemFinishOpen: {
        const activeDocument = window.activeTextEditor?.document;
        if (activeDocument && includeTemplatesAuto()) {
          await remarkService.includeTemplates(activeDocument);
        }
        break;
      }
      case BabaStr.BABACMD_remarkCreateNote:
        await remarkService.remarkCreateNote(body);
        break;
      case BabaStr.BABACMD_remarkClose:
        remarkService.remarkClose(body);
        break;
      case BabaStr.BABACMD_remarkReplyNote:
        await remarkService.remarkReplyNote(body);
        break;
      case BabaStr.BABACMD_remarkDeleteNoteComment:
        await remarkService.remarkDeleteNoteComment(body);
        break;
      case BabaStr.BABACMD_remarkCancelsaveNote:
        await remarkService.remarkCancelsaveNote(body);
        break;
      case BabaStr.BABACMD_remarkSaveNote:
        await remarkService.remarkSaveNote(body);
        break;
      case BabaStr.BABACMD_remarkEditNote:
        await remarkService.remarkEditNote(body);
        break;
      case BabaStr.BABACMD_startRemark:
        await remarkService.startRemark(body);
        break;
      case BabaStr.BABACMD_includeTemplates:
        await remarkService.includeTemplates(body);
        break;
      default:
        break;
    }
  }
}
