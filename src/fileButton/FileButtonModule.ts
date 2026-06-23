/*
 * Filename: https://github.com/ccagml/leetcode-extension/src/fileButton/FileButtonModule.ts
 * Path: https://github.com/ccagml/leetcode-extension
 * Created Date: Friday, October 13th 2023, 10:35:28 am
 * Author: ccagml
 *
 * Copyright (c) 2023 ccagml . All rights reserved
 */

import * as vscode from "vscode";
import { BABA, BABAMediator, BABAProxy, BabaStr, BaseCC } from "../BABA";
import { TreeNodeModel } from "../model/TreeNodeModel";
import { getEditorShortcuts, isStarShortcut } from "../utils/ConfigUtils";
import { supportDebugLanguages } from "../utils/problemUtils";
import { isWindows } from "../utils/SystemUtils";

export class FileButtonService implements vscode.CodeLensProvider {
  private onDidChangeCodeLensesEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();

  get onDidChangeCodeLenses(): vscode.Event<void> {
    return this.onDidChangeCodeLensesEmitter.event;
  }

  public fire(): void {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  // 处理代码的按�?
  private processCodeButton(codeLensLine, document, node, nodeLang): vscode.CodeLens[] {
    const temp_result: vscode.CodeLens[] = [];
    const shortcuts: string[] = getEditorShortcuts();
    if (!shortcuts) {
      return temp_result;
    }

    const range: vscode.Range = new vscode.Range(codeLensLine, 0, codeLensLine, 0);

    if (shortcuts.indexOf("submit") >= 0) {
      temp_result.push(
        new vscode.CodeLens(range, {
          title: "Submit",
          command: "mmxlocal.submitSolution",
          arguments: [document.uri],
        })
      );
    }

    if (shortcuts.indexOf("case") >= 0) {
      temp_result.push(
        new vscode.CodeLens(range, {
          title: "case",
          command: "mmxlocal.testCaseDef",
          arguments: [document.uri, false],
        })
      );
    }
    if (shortcuts.indexOf("allcase") >= 0) {
      temp_result.push(
        new vscode.CodeLens(range, {
          title: "allcase",
          command: "mmxlocal.testCaseDef",
          arguments: [document.uri, true],
        })
      );
    }

    if (shortcuts.indexOf("test") >= 0) {
      temp_result.push(
        new vscode.CodeLens(range, {
          title: "Test",
          command: "mmxlocal.testSolution",
          arguments: [document.uri],
        })
      );
    }

    if (shortcuts.indexOf("retest") >= 0) {
      temp_result.push(
        new vscode.CodeLens(range, {
          title: "ReTest",
          command: "mmxlocal.reTestSolution",
          arguments: [document.uri],
        })
      );
    }

    if (shortcuts.indexOf("star") >= 0 && node) {
      temp_result.push(
        new vscode.CodeLens(range, {
          title: node.isFavorite ? "Unstar" : "Star",
          command: node.isFavorite ? "mmxlocal.removeFavorite" : "mmxlocal.addFavorite",
          arguments: [node],
        })
      );
    }

    if (shortcuts.indexOf("solution") >= 0) {
      temp_result.push(
        new vscode.CodeLens(range, {
          title: "Solution",
          command: "mmxlocal.getHelp",
          arguments: [document.uri],
        })
      );
    }

    if (shortcuts.indexOf("description") >= 0) {
      temp_result.push(
        new vscode.CodeLens(range, {
          title: "Description",
          command: "mmxlocal.previewProblem",
          arguments: [document.uri],
        })
      );
    }

    if (supportDebugLanguages.indexOf(nodeLang) != -1) {
      if (shortcuts.indexOf("debug") >= 0) {
        temp_result.push(
          new vscode.CodeLens(range, {
            title: "debug",
            command: "mmxlocal.simpleDebug",
            arguments: [document],
          })
        );
      }
    }

    return temp_result;
  }

  /**
   * createCase
   */
  public createCase(codeLensLine, document, testCase, nodeLang): vscode.CodeLens[] {
    const range: vscode.Range = new vscode.Range(codeLensLine, 0, codeLensLine, 0);

    const temp_result: vscode.CodeLens[] = [];

    const shortcuts: string[] = getEditorShortcuts();
    if (!shortcuts) {
      return temp_result;
    }

    if (shortcuts.indexOf("case") >= 0) {
      temp_result.push(
        new vscode.CodeLens(range, {
          title: "case",
          command: "mmxlocal.tesCaseArea",
          arguments: [document.uri, testCase],
        })
      );
    }

    if (supportDebugLanguages.indexOf(nodeLang) != -1) {
      // 如果获取的是windows系统,python3 调试的按理是字符�?",需要多一个空�?不然在debug的时候命令行参数会解析错�?
      if (isWindows() && "python3" == nodeLang) {
        testCase = testCase.replace(/^"/, ' "');
      }

      if (shortcuts.indexOf("debug") >= 0) {
        temp_result.push(
          new vscode.CodeLens(range, {
            title: "debug",
            command: "mmxlocal.simpleDebug",
            arguments: [document, testCase],
          })
        );
      }
    }

    return temp_result;
  }

  public processRemarkButton(codeLensLine, document): vscode.CodeLens[] {
    const temp_result: vscode.CodeLens[] = [];

    const range: vscode.Range = new vscode.Range(codeLensLine, 0, codeLensLine, 0);

    temp_result.push(
      new vscode.CodeLens(range, {
        title: "remark",
        command: "mmxlocal.startRemark",
        arguments: [document],
      }),
      new vscode.CodeLens(range, {
        title: "includeTemplates",
        command: "mmxlocal.includeTemplates",
        arguments: [document],
      })
    );
    return temp_result;
  }

  // 去除测试用例前的注释符号, 测试用例 可能有某些语言的注释符�? 例如 844题的#
  // 有些题目的用例是空格�?25�?
  public fix_lineContent(lineContent) {
    let cut_pos = 0;
    for (let left = 0; left < lineContent.length; left++) {
      if (lineContent[left] == "#") {
        continue;
      }
      if (lineContent[left] == "/" && lineContent[left + 1] == "/") {
        left++;
        continue;
      }
      if (lineContent[left] == "-" && lineContent[left + 1] == "-") {
        left++;
        continue;
      }
      if (lineContent[left] == " ") {
        continue;
      }
      cut_pos = left;
      break;
    }
    return lineContent.substring(cut_pos).replace(/\s+$/g, "");
  }

  public createDebugButton(codeLensLine, document, lineContent): vscode.CodeLens[] {
    // const last_index = document.lineAt(codeLensLine).range.end.character;

    const range: vscode.Range = new vscode.Range(codeLensLine + 1, 0, codeLensLine + 1, 0);
    const temp_result: vscode.CodeLens[] = [];

    // paramTypes= []

    if (lineContent.indexOf("paramTypes=") >= 0) {
      const shortcuts: string[] = getEditorShortcuts();
      if (!shortcuts) {
        return temp_result;
      }
      if (shortcuts.indexOf("debug") >= 0) {
        temp_result.push(
          new vscode.CodeLens(range, {
            title: "addParam",
            command: "mmxlocal.addDebugType",
            arguments: [document, "paramTypes"],
          })
        );
        temp_result.push(
          new vscode.CodeLens(range, {
            title: "resetParam",
            command: "mmxlocal.resetDebugType",
            arguments: [document, "paramTypes"],
          })
        );
      }
    }

    // if (lineContent.indexOf("returnType=") >= 0) {
    //   temp_result.push(
    //     new vscode.CodeLens(range, {
    //       title: "addReturn",
    //       command: "mmxlocal.addDebugType",
    //       arguments: [document, "returnType"],
    //     })
    //   );
    //   temp_result.push(
    //     new vscode.CodeLens(range, {
    //       title: "resetReturn",
    //       command: "mmxlocal.resetDebugType",
    //       arguments: [document, "returnType"],
    //     })
    //   );
    // }
    return temp_result;
  }

  public provideCodeLenses(document: vscode.TextDocument): vscode.ProviderResult<vscode.CodeLens[]> {
    const content: string = document.getText();
    const matchResult: RegExpMatchArray | null = content.match(
      /@lc app=(.*) id=(.*|\w*|\W*|[\\u4e00-\\u9fa5]*) lang=(.*)/
    );
    if (!matchResult) {
      return undefined;
    }
    const nodeId: string | undefined = matchResult[2];
    let node: TreeNodeModel | undefined;
    if (nodeId) {
      node = BABA.getProxy(BabaStr.QuestionDataProxy).getNodeById(nodeId);
    }
    let nodeLang: string | undefined = matchResult[3];

    const codeLens: vscode.CodeLens[] = [];
    let caseFlag: boolean = false;
    let curCase = "";
    // 搜集所有debug
    let debugFlag: boolean = false;
    for (let i: number = 0; i < document.lineCount; i++) {
      const lineContent: string = document.lineAt(i).text;
      if (lineContent.indexOf("@lc code=end") >= 0) {
        this.processCodeButton(i, document, node, nodeLang).forEach((x) => codeLens.push(x));
      }

      if (lineContent.indexOf("@lc code=start") >= 0) {
        this.processRemarkButton(i, document).forEach((x) => codeLens.push(x));
      }

      if (caseFlag && lineContent.indexOf("@lcpr case=end") < 0) {
        curCase += this.fix_lineContent(lineContent);
      }
      // 收集所有用�?
      if (lineContent.indexOf("@lcpr case=start") >= 0) {
        caseFlag = true;
      }

      if (caseFlag && lineContent.indexOf("@lcpr case=end") >= 0) {
        this.createCase(i, document, curCase, nodeLang).forEach((x) => codeLens.push(x));
        curCase = "";
        caseFlag = false;
      }

      // 收集所有用�?
      if (lineContent.indexOf("@lcpr-div-debug-arg-end") >= 0) {
        debugFlag = false;
      }

      if (debugFlag) {
        this.createDebugButton(i, document, lineContent).forEach((x) => codeLens.push(x));
      }

      // 收集所有用�?
      if (lineContent.indexOf("@lcpr-div-debug-arg-start") >= 0) {
        debugFlag = true;
      }
    }

    return codeLens;
  }
}

export const fileButtonService: FileButtonService = new FileButtonService();

class FileButtonConfigChange implements vscode.Disposable {
  private registeredProvider: vscode.Disposable | undefined;
  private configurationChangeListener: vscode.Disposable;

  constructor() {
    this.configurationChangeListener = vscode.workspace.onDidChangeConfiguration(
      (event: vscode.ConfigurationChangeEvent) => {
        if (event.affectsConfiguration("leetcode-sm2-review-local.editor.shortcuts")) {
          BABA.sendNotification(BabaStr.FileButton_ConfigChange);
        }
      },
      this
    );

    this.registeredProvider = vscode.languages.registerCodeLensProvider({ scheme: "file" }, fileButtonService);
  }

  public dispose(): void {
    if (this.registeredProvider) {
      this.registeredProvider.dispose();
    }
    this.configurationChangeListener.dispose();
  }
}

export const fileButtonConfigChange: FileButtonConfigChange = new FileButtonConfigChange();

export class FileButtonProxy extends BABAProxy {
  static NAME = BabaStr.FileButtonProxy;
  constructor() {
    super(FileButtonProxy.NAME);
  }
}

export class FileButtonMediator extends BABAMediator {
  static NAME = BabaStr.FileButtonMediator;
  constructor() {
    super(FileButtonMediator.NAME);
  }

  listNotificationInterests(): string[] {
    return [BabaStr.VSCODE_DISPOST, BabaStr.FileButton_ConfigChange, BabaStr.TreeData_favoriteChange];
  }
  async handleNotification(_notification: BaseCC.BaseCC.INotification) {
    switch (_notification.getName()) {
      case BabaStr.VSCODE_DISPOST:
        fileButtonConfigChange.dispose();
        break;

      case BabaStr.TreeData_favoriteChange:
        if (isStarShortcut()) {
          fileButtonService.fire();
        }
        break;
      case BabaStr.FileButton_ConfigChange:
        fileButtonService.fire();
        break;
      default:
        break;
    }
  }
}
