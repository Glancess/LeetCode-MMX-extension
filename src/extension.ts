/*
 * Filename: https://github.com/ccagml/leetcode-extension/src/extension.ts
 * Path: https://github.com/ccagml/leetcode-extension
 * Created Date: Monday, October 31st 2022, 10:16:47 am
 * Author: ccagml
 *
 * Copyright (c) 2022 ccagml . All rights reserved.
 */

import { ExtensionContext, window, commands, Uri, CommentReply, TextDocument } from "vscode";
import { TreeNodeModel } from "./model/TreeNodeModel";
import { treeColor } from "./treeColor/TreeColorModule";
import { ShowMessage } from "./utils/OutputUtils";
import { ChildCallMediator, ChildCallProxy } from "./childCall/childCallModule";
import { markdownService } from "./service/MarkdownService";
import { BricksType, OutPutType, RemarkComment } from "./model/ConstDefind";
import { BricksDataMediator, BricksDataProxy } from "./bricksData/BricksDataService";
import { BABA, BabaStr } from "./BABA";
import { StatusBarTimeMediator, StatusBarTimeProxy } from "./statusBarTime/StatusBarTimeModule";
import { StatusBarMediator, StatusBarProxy } from "./statusBar/StatusBarModule";
import { LogOutputMediator, LogOutputProxy } from "./logOutput/logOutputModule";
import { RemarkMediator, RemarkProxy } from "./remark/RemarkServiceModule";
import { FileButtonMediator, FileButtonProxy } from "./fileButton/FileButtonModule";
import { QuestionDataMediator, QuestionDataProxy } from "./questionData/QuestionDataModule";
import { TreeDataMediator, TreeDataProxy, treeDataService } from "./treeData/TreeDataService";
import { CommitResultMediator, CommitResultProxy } from "./commitResult/CommitResultModule";
import { SolutionProxy, SolutionMediator } from "./solution/SolutionModule";
import { PreviewMediator, PreviewProxy } from "./preView/PreviewModule";
import { DebugMediator, DebugProxy } from "./debug/DebugModule";
import { RankScoreDataMediator, RankScoreDataProxy } from "./rankScore/RankScoreDataModule";
import { TodayDataMediator, TodayDataProxy } from "./todayData/TodayDataModule";
import { RecentContestMediator, RecentContestProxy } from "./recentContestData/RecentContestDataModule";
import { ContestQuestionMediator, ContestQuestionProxy } from "./recentContestData/ContestQuestionDataModule";
import { bricksReviewTreeProvider } from "./bricksReviewController";

//==================================BABA========================================

// 激活插�?
/**
 * The main function of the extension. It is called when the extension is activated.
 * @param {ExtensionContext} context - ExtensionContext
 */

let lcpr_timer_sec;
let lcpr_timer_min;
export async function activate(context: ExtensionContext): Promise<void> {
  try {
    BABA.init([
      StatusBarTimeMediator,
      StatusBarTimeProxy,
      StatusBarProxy,
      StatusBarMediator,
      RemarkProxy,
      RemarkMediator,
      LogOutputProxy,
      LogOutputMediator,
      FileButtonProxy,
      FileButtonMediator,
      QuestionDataProxy,
      QuestionDataMediator,
      TreeDataProxy,
      TreeDataMediator,
      BricksDataProxy,
      BricksDataMediator,
      CommitResultProxy,
      CommitResultMediator,
      SolutionProxy,
      SolutionMediator,
      PreviewProxy,
      PreviewMediator,
      DebugProxy,
      DebugMediator,
      ChildCallProxy,
      ChildCallMediator,
      RankScoreDataProxy,
      RankScoreDataMediator,
      TodayDataProxy,
      TodayDataMediator,
      RecentContestProxy,
      RecentContestMediator,
      ContestQuestionProxy,
      ContestQuestionMediator,
    ]);

    // 资源管理
    context.subscriptions.push(
      markdownService,
      BABA,
      window.registerFileDecorationProvider(treeColor),
      window.createTreeView("MMXQuestionExplorer", { treeDataProvider: treeDataService, showCollapseAll: true }),
      window.createTreeView("MMXReviewExplorer", { treeDataProvider: bricksReviewTreeProvider, showCollapseAll: true }),
      commands.registerCommand("mmxlocal.deleteCache", () => BABA.sendNotification(BabaStr.DeleteCache)),
      commands.registerCommand("mmxlocal.toggleLeetCodeCn", () => {
        BABA.sendNotification(BabaStr.TreeData_switchEndpoint);
      }),
      commands.registerCommand("mmxlocal.signin", () => BABA.sendNotification(BabaStr.BABACMD_Login)),
      commands.registerCommand("mmxlocal.signout", () => BABA.sendNotification(BabaStr.BABACMD_LoginOut)),
      commands.registerCommand("mmxlocal.previewProblem", (node: TreeNodeModel) => {
        BABA.sendNotification(BabaStr.BABACMD_previewProblem, { input: node, isSideMode: false });
      }),
      commands.registerCommand("mmxlocal.showProblem", (node: TreeNodeModel) => {
        BABA.sendNotification(BabaStr.BABACMD_showProblem, node);
      }),
      commands.registerCommand("mmxlocal.pickOne", () => {
        BABA.sendNotification(BabaStr.BABACMD_pickOne);
      }),
      commands.registerCommand("mmxlocal.deleteAllCache", () => BABA.sendNotification(BabaStr.BABACMD_deleteAllCache)),
      commands.registerCommand("leetcode.searchScoreRange", () => {
        BABA.sendNotification(BabaStr.BABACMD_searchScoreRange);
      }),
      commands.registerCommand("mmxlocal.searchProblem", () => BABA.sendNotification(BabaStr.BABACMD_searchProblem)),
      commands.registerCommand("mmxlocal.getHelp", (input: TreeNodeModel | Uri) =>
        BABA.sendNotification(BabaStr.BABACMD_getHelp, input)
      ),
      commands.registerCommand("mmxlocal.refresh", () => {
        BABA.sendNotification(BabaStr.BABACMD_refresh);
        bricksReviewTreeProvider.refresh();
      }),
      commands.registerCommand("mmxlocal.testSolution", (uri?: Uri) => {
        BABA.sendNotification(BabaStr.BABACMD_testSolution, { uri: uri });
      }),

      commands.registerCommand("mmxlocal.reTestSolution", (uri?: Uri) => {
        BABA.sendNotification(BabaStr.BABACMD_reTestSolution, { uri: uri });
      }),
      commands.registerCommand("mmxlocal.testCaseDef", (uri?, allCase?) => {
        BABA.sendNotification(BabaStr.BABACMD_testCaseDef, { uri: uri, allCase: allCase });
      }),
      commands.registerCommand("mmxlocal.tesCaseArea", (uri, testCase?) => {
        BABA.sendNotification(BabaStr.BABACMD_tesCaseArea, { uri: uri, testCase: testCase });
      }),

      commands.registerCommand("mmxlocal.submitSolution", (uri?: Uri) => {
        BABA.sendNotification(BabaStr.BABACMD_submitSolution, { uri: uri });
      }),
      commands.registerCommand("mmxlocal.openBricksQuestion", async (qid: string) => {
        const node = BABA.getProxy(BabaStr.QuestionDataProxy).getNodeByQid(qid);
        if (!node) {
          window.showWarningMessage(`Unable to find question for qid ${qid}.`);
          return;
        }
        BABA.sendNotification(BabaStr.BABACMD_previewProblem, { input: node, isSideMode: false });
      }),
      commands.registerCommand("mmxlocal.setDefaultLanguage", () => {
        BABA.sendNotification(BabaStr.BABACMD_setDefaultLanguage);
      }),
      commands.registerCommand("mmxlocal.addFavorite", (node: TreeNodeModel) => {
        BABA.sendNotification(BabaStr.BABACMD_addFavorite, { node: node });
      }),

      commands.registerCommand("mmxlocal.removeFavorite", (node: TreeNodeModel) => {
        BABA.sendNotification(BabaStr.BABACMD_removeFavorite, { node: node });
      }),
      commands.registerCommand("mmxlocal.problems.sort", () => {
        BABA.sendNotification(BabaStr.BABACMD_problems_sort);
      }),
      commands.registerCommand("mmxlocal.statusBarTime.start", () => {
        BABA.sendNotification(BabaStr.BABACMD_statusBarTime_start);
      }),
      commands.registerCommand("mmxlocal.statusBarTime.stop", () => {
        BABA.sendNotification(BabaStr.BABACMD_statusBarTime_stop);
      }),
      commands.registerCommand("mmxlocal.statusBarTime.reset", () => {
        BABA.sendNotification(BabaStr.BABACMD_statusBarTime_reset);
      }),
      commands.registerCommand("mmxlocal.setBricksType0", (node: TreeNodeModel) =>
        BABA.sendNotification(BabaStr.BABACMD_setBricksType, { node: node, type: BricksType.TYPE_0 })
      ),
      commands.registerCommand("mmxlocal.setBricksType1", (node: TreeNodeModel) =>
        BABA.sendNotification(BabaStr.BABACMD_setBricksType, { node: node, type: BricksType.TYPE_1 })
      ),
      commands.registerCommand("mmxlocal.setBricksType2", (node: TreeNodeModel) =>
        BABA.sendNotification(BabaStr.BABACMD_setBricksType, { node: node, type: BricksType.TYPE_2 })
      ),
      commands.registerCommand("mmxlocal.setBricksType3", (node: TreeNodeModel) =>
        BABA.sendNotification(BabaStr.BABACMD_setBricksType, { node: node, type: BricksType.TYPE_3 })
      ),
      commands.registerCommand("mmxlocal.setBricksType4", (node: TreeNodeModel) =>
        BABA.sendNotification(BabaStr.BABACMD_setBricksType, { node: node, type: BricksType.TYPE_4 })
      ),
      commands.registerCommand("mmxlocal.setBricksType5", (node: TreeNodeModel) =>
        BABA.sendNotification(BabaStr.BABACMD_setBricksType, { node: node, type: BricksType.TYPE_5 })
      ),
      commands.registerCommand("mmxlocal.setBricksType6", (node: TreeNodeModel) =>
        BABA.sendNotification(BabaStr.BABACMD_setBricksType, { node: node, type: BricksType.TYPE_6 })
      ),
      commands.registerCommand("mmxlocal.newBrickGroup", () => BABA.sendNotification(BabaStr.BABACMD_newBrickGroup)),
      commands.registerCommand("mmxlocal.addQidToGroup", (a) => BABA.sendNotification(BabaStr.BABACMD_addQidToGroup, a)),
      commands.registerCommand("mmxlocal.removeBrickGroup", (a) =>
        BABA.sendNotification(BabaStr.BABACMD_removeBrickGroup, a)
      ),
      commands.registerCommand("mmxlocal.removeBricksNeedReviewDay", (a) =>
        BABA.sendNotification(BabaStr.BABACMD_removeBricksNeedReviewDay, a)
      ),
      commands.registerCommand("mmxlocal.removeBricksNeedReviewDayNode", (a) =>
        BABA.sendNotification(BabaStr.BABACMD_removeBricksNeedReviewDayNode, a)
      ),

      commands.registerCommand("mmxlocal.removeBricksHave", (a) =>
        BABA.sendNotification(BabaStr.BABACMD_removeBricksHave, a)
      ),
      commands.registerCommand("mmxlocal.removeQidFromGroup", (node) =>
        BABA.sendNotification(BabaStr.BABACMD_removeQidFromGroup, node)
      ),

      commands.registerCommand("mmxlocal.remarkCreateNote", (reply: CommentReply) => {
        BABA.sendNotification(BabaStr.BABACMD_remarkCreateNote, reply);
      }),
      commands.registerCommand("mmxlocal.remarkClose", (a) => {
        BABA.sendNotification(BabaStr.BABACMD_remarkClose, a);
      }),
      commands.registerCommand("mmxlocal.remarkReplyNote", (reply: CommentReply) => {
        BABA.sendNotification(BabaStr.BABACMD_remarkReplyNote, reply);
      }),
      commands.registerCommand("mmxlocal.remarkDeleteNoteComment", (comment: RemarkComment) => {
        BABA.sendNotification(BabaStr.BABACMD_remarkDeleteNoteComment, comment);
      }),
      commands.registerCommand("mmxlocal.remarkCancelsaveNote", (comment: RemarkComment) => {
        BABA.sendNotification(BabaStr.BABACMD_remarkCancelsaveNote, comment);
      }),
      commands.registerCommand("mmxlocal.remarkSaveNote", (comment: RemarkComment) => {
        BABA.sendNotification(BabaStr.BABACMD_remarkSaveNote, comment);
      }),
      commands.registerCommand("mmxlocal.remarkEditNote", (comment: RemarkComment) => {
        BABA.sendNotification(BabaStr.BABACMD_remarkEditNote, comment);
      }),
      commands.registerCommand("mmxlocal.startRemark", (document: TextDocument) => {
        BABA.sendNotification(BabaStr.BABACMD_startRemark, document);
      }),
      commands.registerCommand("mmxlocal.includeTemplates", (document: TextDocument) => {
        BABA.sendNotification(BabaStr.BABACMD_includeTemplates, document);
      }),
      commands.registerCommand("mmxlocal.simpleDebug", (document: TextDocument, testCase?) =>
        BABA.sendNotification(BabaStr.BABACMD_simpleDebug, { document: document, testCase: testCase })
      ),
      commands.registerCommand("mmxlocal.addDebugType", (document: TextDocument, addType) =>
        BABA.sendNotification(BabaStr.BABACMD_addDebugType, { document: document, addType: addType })
      ),
      commands.registerCommand("mmxlocal.resetDebugType", (document: TextDocument, addType) =>
        BABA.sendNotification(BabaStr.BABACMD_resetDebugType, { document: document, addType: addType })
      )
    );

    await BABA.sendNotificationAsync(BabaStr.InitWorkspaceFolder, context);
    await BABA.sendNotificationAsync(BabaStr.InitFile, context);
    await BABA.sendNotificationAsync(BabaStr.InitEnv, context);
    await BABA.sendNotificationAsync(BabaStr.InitLoginStatus);
    await BABA.sendNotificationAsync(BabaStr.StartReadData);
    bricksReviewTreeProvider.refresh();
  } catch (error) {
    BABA.getProxy(BabaStr.LogOutputProxy).get_log().appendLine(error.toString());
    ShowMessage("Extension initialization failed. Please open output channel for details.", OutPutType.error);
  } finally {
    lcpr_timer_sec = setInterval(() => {
      new Promise(async (resolve, _) => {
        await BABA.sendNotificationAsync(BabaStr.every_second);
        resolve(1);
      });
    }, 1000);
    lcpr_timer_min = setInterval(() => {
      new Promise(async (resolve, _) => {
        await BABA.sendNotificationAsync(BabaStr.every_minute);
        resolve(1);
      });
    }, 60000);
  }
}

export function deactivate(): void {
  // Do nothing.
  if (lcpr_timer_sec != undefined) {
    clearInterval(lcpr_timer_sec);
    lcpr_timer_sec = undefined;
  }
  if (lcpr_timer_min != undefined) {
    clearInterval(lcpr_timer_min);
    lcpr_timer_min = undefined;
  }
}
