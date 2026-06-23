/*
 * Filename: https://github.com/ccagml/leetcode-extension/src/service/TreeDataService.ts
 * Path: https://github.com/ccagml/leetcode-extension
 * Created Date: Thursday, October 27th 2022, 7:43:29 pm
 * Author: ccagml
 *
 * Copyright (c) 2022 ccagml . All rights reserved.
 */

// import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { Category, ProblemState, SearchSetType, OutPutType, Endpoint, IQuickItemEx, BricksNormalId } from "../model/ConstDefind";
import { treeViewController } from "../controller/TreeViewController";
import { CreateTreeNodeModel, TreeNodeModel, TreeNodeType } from "../model/TreeNodeModel";
import { choiceDao } from "../dao/choiceDao";
import { tagsDao } from "../dao/tagsDao";
import { ShowMessage, promptForSignIn } from "../utils/OutputUtils";
import { BABA, BABAMediator, BABAProxy, BabaStr, BaseCC } from "../BABA";
import {
  getLeetCodeEndpoint,
  isUseEndpointTranslation,
  selectWorkspaceFolderList,
  setDefaultLanguage,
} from "../utils/ConfigUtils";
import { getNodeIdFromFile } from "../utils/SystemUtils";

export class TreeDataService implements vscode.TreeDataProvider<TreeNodeModel> {
  private context: vscode.ExtensionContext;
  private onDidChangeTreeDataEvent: vscode.EventEmitter<TreeNodeModel | undefined | null> = new vscode.EventEmitter<
    TreeNodeModel | undefined | null
  >();
  // tslint:disable-next-line:member-ordering
  public readonly onDidChangeTreeData: vscode.Event<any> = this.onDidChangeTreeDataEvent.event;

  public initialize(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  public cleanUserScore() {
    treeViewController.clearUserScore();
  }

  public fire() {
    this.onDidChangeTreeDataEvent.fire(null);
  }

  public async refresh(): Promise<void> {
    await treeViewController.refreshCache();
    await treeViewController.refreshCheck();
  }

  public async checkWorkspaceFolder() {
    await selectWorkspaceFolderList();
  }

  public getTreeItem(element: TreeNodeModel): vscode.TreeItem | Thenable<vscode.TreeItem> {
    if (element.id === BricksNormalId.NotSignIn) {
      return {
        label: element.name,
        collapsibleState: vscode.TreeItemCollapsibleState.None,
        command: {
          command: "mmxlocal.signin",
          title: "未登录",
        },
      };
    }

    const result: vscode.TreeItem | Thenable<vscode.TreeItem> = {
      label: element.isProblem
        ? (element.score > "0" ? "[score:" + element.score + "]" : "") + `ID:${element.id}.${element.name} `
        : element.name,
      tooltip: this.getSubCategoryTooltip(element),
      collapsibleState: element.isProblem
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed,
      iconPath: this.parseIconPathFromProblemState(element),
      command: element.isProblem ? element.previewCommand : undefined,
      resourceUri: element.TNMUri,
      contextValue: element.viewItem,
    };
    return result;
  }

  public getChildren(element?: TreeNodeModel | undefined): vscode.ProviderResult<TreeNodeModel[]> {
    if (!BABA.getProxy(BabaStr.StatusBarProxy).getUser()) {
      return [
        CreateTreeNodeModel(
          {
            id: BricksNormalId.NotSignIn,
            name: "未登录",
          },
          TreeNodeType.TreeNotSignIn
        ),
      ];
    }
    if (!element) {
      // Root view
      return treeViewController.getRootNodes();
    } else {
      if (element.nodeType == TreeNodeType.Tree_day) {
        return treeViewController.getDayNodes(element);
      }
      else if (element.nodeType == TreeNodeType.Tree_recentContestList) {
        return treeViewController.getRecentContestList();
      }
      else if (element.nodeType == TreeNodeType.Tree_recentContestList_contest) {
        return treeViewController.getContestQuestionNodes(element);
      }
      else if (element.nodeType == TreeNodeType.Tree_search) {
        if (element.id == SearchSetType.ScoreRange) {
          return treeViewController.getScoreRangeNodes(element.input);
        }
        else if (element.id == SearchSetType.Context) {
          return treeViewController.getContestNodes(element.input);
        }
        return [];
      }
      else if (element.nodeType == TreeNodeType.Tree_All) {
        return treeViewController.getAllNodes();
      }
      else if (element.nodeType == TreeNodeType.Tree_favorite) {
        return treeViewController.getFavoriteNodes();
      }
      else if (element.nodeType == TreeNodeType.Tree_difficulty) {
        return treeViewController.getDifficultyChild()
      }
      else if (element.nodeType == TreeNodeType.Tree_tag) {
        return treeViewController.getTagChild()
      }
      else if (element.nodeType == TreeNodeType.Tree_score) {
        return treeViewController.getScoreChild();
      }
      else if (element.nodeType == TreeNodeType.Tree_choice) {
        return treeViewController.getChoiceChild();
      }
      else if (element.nodeType == TreeNodeType.Tree_contest) {
        return treeViewController.getContestChild();
      }
      else {
        if (element.isProblem) {
          return [];
        }
        return treeViewController.getChildrenSon(element);
      }
    }
  }

  public getChoiceData() {
    return choiceDao.getChoiceData();
  }
  public getTagsData(fid: string): Array<string> {
    return tagsDao.getTagsData(fid) || ["Unknown"];
  }

  public getTagsDataEn(fid: string): Array<string> {
    return tagsDao.getTagsDataEn(fid) || ["Unknown"];
  }

  private parseIconPathFromProblemState(element: TreeNodeModel): string {
    if (!element.isProblem) {
      return "";
    }
    switch (element.state) {
      case ProblemState.AC:
        return this.context.asAbsolutePath(path.join("resources", "check.png"));
      case ProblemState.NotAC:
        return this.context.asAbsolutePath(path.join("resources", "x.png"));
      case ProblemState.Unknown:
        if (element.locked) {
          return this.context.asAbsolutePath(path.join("resources", "lock.png"));
        }
        return this.context.asAbsolutePath(path.join("resources", "blank.png"));
      default:
        return "";
    }
  }

  private getSubCategoryTooltip(element: TreeNodeModel): string {
    // return '' unless it is a sub-category node
    if (element.isProblem || element.id === "ROOT" || element.id in Category) {
      return "";
    }
    return "";
  }
  public async switchEndpoint(): Promise<void> {
    const isCnEnabled: boolean = getLeetCodeEndpoint() === Endpoint.LeetCodeCN;
    const picks: Array<IQuickItemEx<string>> = [];
    picks.push(
      {
        label: `${isCnEnabled ? "" : "$(check) "}LeetCode`,
        description: "leetcode.com",
        detail: `Enable LeetCode.com US`,
        value: Endpoint.LeetCode,
      },
      {
        label: `${isCnEnabled ? "$(check) " : ""}鍔涙墸`,
        description: "leetcode.cn",
        detail: `鍚敤涓浗鐗?LeetCode.cn`,
        value: Endpoint.LeetCodeCN,
      }
    );
    const choice: IQuickItemEx<string> | undefined = await vscode.window.showQuickPick(picks);
    if (!choice || choice.value === getLeetCodeEndpoint()) {
      return;
    }
    const leetCodeConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("leetcode-sm2-review-local");
    try {
      const endpoint: string = choice.value;
      await BABA.getProxy(BabaStr.ChildCallProxy).get_instance().switchEndpoint(endpoint);
      await leetCodeConfig.update("endpoint", endpoint, true /* UserSetting */);
      vscode.window.showInformationMessage(`Switched the endpoint to ${endpoint}`);
    } catch (error) {
      await ShowMessage("鍒囨崲绔欑偣鍑洪敊. 璇锋煡鐪嬫帶鍒跺彴淇℃伅~", OutPutType.error);
    }

    try {
      await vscode.commands.executeCommand("mmxlocal.signout");
      await BABA.getProxy(BabaStr.ChildCallProxy).get_instance().deleteCache();
      await promptForSignIn();
    } catch (error) {
      await ShowMessage("鐧诲綍澶辫触. 璇锋煡鐪嬫帶鍒跺彴淇℃伅~", OutPutType.error);
    }
  }
  public async previewProblem(input: TreeNodeModel | vscode.Uri, isSideMode: boolean = false): Promise<void> {
    let node: TreeNodeModel;
    if (input instanceof vscode.Uri) {
      const activeFilePath: string = input.fsPath;
      const id: string = await getNodeIdFromFile(activeFilePath);
      if (!id) {
        ShowMessage(`Failed to resolve the problem id from file: ${activeFilePath}.`, OutPutType.error);
        return;
      }
      const cachedNode: TreeNodeModel | undefined = BABA.getProxy(BabaStr.QuestionDataProxy).getNodeById(id);
      if (!cachedNode) {
        ShowMessage(`Failed to resolve the problem with id: ${id}.`, OutPutType.error);
        return;
      }
      node = cachedNode;
      // Move the preview page aside if it's triggered from Code Lens
      isSideMode = true;
    } else {
      node = input;
    }
    const needTranslation: boolean = isUseEndpointTranslation();
    const descString: string = await BABA.getProxy(BabaStr.ChildCallProxy)
      .get_instance()
      .getDescription(node.qid, needTranslation);

    let successResult;
    try {
      successResult = JSON.parse(descString);
    } catch (e) {
      successResult = {};
    }
    if (successResult.code == 100) {
      BABA.sendNotification(BabaStr.Preview_show, {
        descString: JSON.stringify(successResult.msg),
        node: node,
        isSideMode: isSideMode,
      });
    } else {
      await ShowMessage(`${descString} 璇锋煡鐪嬫帶鍒跺彴淇℃伅~`, OutPutType.error);
    }
  }

  public async signIn(): Promise<void> {
    const picks: Array<IQuickItemEx<string>> = [];
    let qpOpiton: vscode.QuickPickOptions = {
      title: "姝ｅ湪鐧诲綍leetcode.com",
      matchOnDescription: false,
      matchOnDetail: false,
      placeHolder: "璇烽€夋嫨鐧诲綍鏂瑰紡 姝ｅ湪鐧诲綍leetcode.com",
    };
    if (getLeetCodeEndpoint() == Endpoint.LeetCodeCN) {
      picks.push({
        label: "LeetCode Account",
        detail: "鍙兘鐧诲綍leetcode.cn",
        value: "LeetCode",
      },
        {
          label: "LeetCode Cookie",
          detail: "Use LeetCode cookie copied from browser to login",
          value: "Cookie",
        });
      qpOpiton.title = "姝ｅ湪鐧诲綍涓枃鐗坙eetcode.cn";
      qpOpiton.placeHolder = "璇烽€夋嫨鐧诲綍鏂瑰紡 姝ｅ湪鐧诲綍涓枃鐗坙eetcode.cn";
    }

    if (getLeetCodeEndpoint() == Endpoint.LeetCode) {
      picks.push({
        label: "LeetCode chrome copy curl(bash) ",
        detail: "Use Chrome copied GraphQL curl request to sign in",
        value: "curltype",
      })
    }
    picks.push(
      {
        label: "Third-Party: GitHub",
        detail: "Use GitHub account to login",
        value: "GitHub",
      },
      {
        label: "Third-Party: LinkedIn",
        detail: "Use LinkedIn account to login",
        value: "LinkedIn",
      },
    );
    const choice: IQuickItemEx<string> | undefined = await vscode.window.showQuickPick(picks, qpOpiton);
    if (!choice) {
      return;
    }
    let loginMethod = choice.value;

    const isByCookie: boolean = loginMethod === "Cookie";
    const inMessage: string = isByCookie ? " 閫氳繃cookie鐧诲綍" : "鐧诲綍";
    try {
      const userName: string | undefined = await BABA.getProxy(BabaStr.ChildCallProxy)
        .get_instance()
        .trySignIn(loginMethod);
      if (userName) {
        BABA.sendNotification(BabaStr.USER_LOGIN_SUC, { userName: userName });
        vscode.window.showInformationMessage(`${inMessage} 鎴愬姛`);
      }
    } catch (error) {
      ShowMessage(`${inMessage}澶辫触. 璇风湅鐪嬫帶鍒跺彴杈撳嚭淇℃伅`, OutPutType.error);
    }
  }

  // 鐧诲嚭
  /**
   * It signs out the user
   */
  public async signOut(): Promise<void> {
    try {
      await BABA.getProxy(BabaStr.ChildCallProxy).get_instance().signOut();
      vscode.window.showInformationMessage("鎴愬姛鐧诲嚭");

      BABA.sendNotification(BabaStr.USER_LOGIN_OUT, {});
    } catch (error) {
      // ShowMessage(`Failed to signOut. Please open the output channel for details`, OutPutType.error);
    }
  }

  // 鍒犻櫎鎵€鏈夌紦瀛?
  /**
   * It signs out, removes old cache, switches to the default endpoint, and refreshes the tree data
   */
  public async deleteAllCache(): Promise<void> {
    await this.signOut();
    await BABA.getProxy(BabaStr.ChildCallProxy).get_instance().removeOldCache();
    await BABA.getProxy(BabaStr.ChildCallProxy).get_instance().switchEndpoint(getLeetCodeEndpoint());
    BABA.sendNotification(BabaStr.BABACMD_refresh);
    BABA.sendNotification(BabaStr.BricksData_refresh);
  }
}

export const treeDataService: TreeDataService = new TreeDataService();

export class TreeDataProxy extends BABAProxy {
  static NAME = BabaStr.TreeDataProxy;
  constructor() {
    super(TreeDataProxy.NAME);
  }

  public getTagsDataEn(fid: string): Array<string> {
    return treeDataService.getTagsDataEn(fid) || ["Unknown"];
  }
  public getChoiceData() {
    return treeDataService.getChoiceData();
  }

  public getTagsData(fid: string): Array<string> {
    return treeDataService.getTagsData(fid);
  }
}

export class TreeDataMediator extends BABAMediator {
  static NAME = BabaStr.TreeDataMediator;
  constructor() {
    super(TreeDataMediator.NAME);
  }

  listNotificationInterests(): string[] {
    return [
      BabaStr.VSCODE_DISPOST,
      BabaStr.BABACMD_refresh,
      BabaStr.InitFile,
      BabaStr.TreeData_cleanUserScore,
      BabaStr.TreeData_switchEndpoint,
      BabaStr.BABACMD_previewProblem,
      BabaStr.BABACMD_showProblem,
      BabaStr.BABACMD_pickOne,
      BabaStr.BABACMD_searchScoreRange,
      BabaStr.BABACMD_searchProblem,
      BabaStr.BABACMD_getHelp,
      BabaStr.BABACMD_testSolution,
      BabaStr.BABACMD_reTestSolution,
      BabaStr.BABACMD_testCaseDef,
      BabaStr.BABACMD_tesCaseArea,
      BabaStr.BABACMD_submitSolution,
      BabaStr.BABACMD_setDefaultLanguage,
      BabaStr.BABACMD_addFavorite,
      BabaStr.BABACMD_removeFavorite,
      BabaStr.BABACMD_problems_sort,
      BabaStr.TreeData_rebuildTreeData,
      BabaStr.QuestionData_ReBuildQuestionDataFinish,
      BabaStr.TreeData_searchTodayFinish,
      BabaStr.TreeData_searchUserContestFinish,
      BabaStr.TreeData_searchScoreRangeFinish,
      BabaStr.TreeData_searchContest,
      BabaStr.ConfigChange_hideScore,
      BabaStr.ConfigChange_SortStrategy,
      BabaStr.TreeData_favoriteChange,
      BabaStr.USER_statusChanged,
      BabaStr.statusBar_update_statusFinish,
      BabaStr.StartReadData,
      BabaStr.BABACMD_Login,
      BabaStr.BABACMD_LoginOut,
      BabaStr.BABACMD_deleteAllCache,
      BabaStr.QuestionData_submitNewAccept,
      BabaStr.InitWorkspaceFolder,
    ];
  }
  async handleNotification(_notification: BaseCC.BaseCC.INotification) {
    let body = _notification.getBody();
    switch (_notification.getName()) {
      case BabaStr.VSCODE_DISPOST:
        treeViewController.dispose();
        break;
      case BabaStr.StartReadData:
        break;
      case BabaStr.InitWorkspaceFolder:
        await treeDataService.checkWorkspaceFolder();
        break;
      case BabaStr.BABACMD_refresh:
      case BabaStr.ConfigChange_hideScore:
      case BabaStr.QuestionData_submitNewAccept:
        await treeDataService.refresh();
        break;
      case BabaStr.InitFile:
        treeDataService.initialize(body);
        break;
      case BabaStr.TreeData_cleanUserScore:
        treeDataService.cleanUserScore();
        break;

      case BabaStr.TreeData_switchEndpoint:
        treeDataService.switchEndpoint();
        break;
      case BabaStr.BABACMD_previewProblem:
        treeDataService.previewProblem(body.input, body.isSideMode);
        break;
      case BabaStr.BABACMD_showProblem:
        treeViewController.showProblem(body);
        break;
      case BabaStr.BABACMD_pickOne:
        treeViewController.pickOne();
        break;
      case BabaStr.BABACMD_searchScoreRange:
        treeViewController.searchScoreRange();
        break;
      case BabaStr.BABACMD_searchProblem:
        treeViewController.searchProblem();
        break;
      case BabaStr.BABACMD_getHelp:
        treeViewController.getHelp(body);
        break;
      case BabaStr.BABACMD_testSolution:
        treeViewController.testSolution(body.uri);
        break;
      case BabaStr.BABACMD_reTestSolution:
        treeViewController.reTestSolution(body.uri);
        break;
      case BabaStr.BABACMD_testCaseDef:
        treeViewController.testCaseDef(body.uri, body.allCase);
        break;
      case BabaStr.BABACMD_tesCaseArea:
        treeViewController.tesCaseArea(body.uri, body.testCase);
        break;
      case BabaStr.BABACMD_submitSolution:
        treeViewController.submitSolution(body.uri);
        break;
      case BabaStr.BABACMD_setDefaultLanguage:
        setDefaultLanguage();
        break;
      case BabaStr.BABACMD_addFavorite:
        treeViewController.addFavorite(body.node);
        break;
      case BabaStr.BABACMD_removeFavorite:
        treeViewController.removeFavorite(body.node);
        break;
      case BabaStr.BABACMD_problems_sort:
        treeViewController.switchSortingStrategy();
        break;
      case BabaStr.USER_statusChanged:
      case BabaStr.statusBar_update_statusFinish:
        treeDataService.cleanUserScore();
        treeDataService.fire();
        treeDataService.refresh();
        break;
      case BabaStr.TreeData_searchUserContestFinish:
      case BabaStr.TreeData_favoriteChange:
        treeDataService.refresh();
        break;
      case BabaStr.QuestionData_ReBuildQuestionDataFinish:
      case BabaStr.TreeData_searchTodayFinish:
      case BabaStr.TreeData_rebuildTreeData:
      case BabaStr.TreeData_searchScoreRangeFinish:
      case BabaStr.TreeData_searchContest:
      case BabaStr.ConfigChange_SortStrategy:
        treeDataService.fire();
        break;
      case BabaStr.BABACMD_Login:
        treeDataService.signIn();
        break;
      case BabaStr.BABACMD_LoginOut:
        treeDataService.signOut();
        break;
      case BabaStr.BABACMD_deleteAllCache:
        treeDataService.deleteAllCache();
        break;

      default:
        break;
    }
  }
}
