import * as fse from "fs-extra";
import * as path from "path";
import { Event, EventEmitter, TreeDataProvider, TreeItem } from "vscode";

import {
  createNewMMXCard,
  estimateInitialDifficulty,
  isLegacySM2Card,
  isReviewCard,
  LegacySM2Card,
  mmxReview,
  migrateLegacySM2Card,
  ReviewCard,
  ReviewRating,
} from "../algo/mmx";
import { BABA, BABAMediator, BABAProxy, BabaStr, BaseCC } from "../BABA";
import { bricksViewController } from "../controller/BricksViewController";
import { bricksDao } from "../dao/bricksDao";
import { groupDao } from "../dao/groupDao";
import { BricksType, ISubmitEvent } from "../model/ConstDefind";
import { TreeNodeModel } from "../model/TreeNodeModel";
import { prepareExtensionDataDir, selectWorkspaceFolder } from "../utils/ConfigUtils";

interface IDailyReviewPlan {
  date: string;
  qids: string[];
}

interface IReviewStore {
  version: 3;
  cards: Record<string, ReviewCard>;
  migratedFromLegacy: boolean;
  dailyPlan?: IDailyReviewPlan;
}

const REVIEW_STORE_VERSION = 3;
const REVIEW_STORE_FILE = "mmx-review.json";
const REVIEW_STORE_BACKUP_SUFFIX = ".bak";
const MAX_DAILY_REVIEW = 10;

export class BricksDataService implements TreeDataProvider<TreeNodeModel> {
  private onDidChangeTreeDataEvent: EventEmitter<TreeNodeModel | undefined | null> = new EventEmitter<
    TreeNodeModel | undefined | null
  >();
  private reviewCards: Map<string, ReviewCard> = new Map<string, ReviewCard>();
  private reviewDataPath: string = "";
  private dailyPlan: IDailyReviewPlan | undefined;
  private migratedFromLegacy: boolean = false;

  public readonly onDidChangeTreeData: Event<any> = this.onDidChangeTreeDataEvent.event;

  public fire(): void {
    this.onDidChangeTreeDataEvent.fire(null);
  }

  public async initialize(): Promise<void> {
    await bricksDao.init();
    await groupDao.init();
    await this.initializeReviewStore();
  }

  public getTreeItem(_element: TreeNodeModel): TreeItem | Thenable<TreeItem> {
    return {
      label: "",
    };
  }

  public async getChildren(_element?: TreeNodeModel | undefined): Promise<TreeNodeModel[] | null | undefined> {
    return [];
  }

  public async checkSubmit(event: ISubmitEvent): Promise<void> {
    if (event.sub_type === "submit" && event.accepted) {
      await bricksDao.addSubmitTimeByQid(event.qid.toString());
      BABA.sendNotification(BabaStr.BricksData_submitAndAccepted);
    }
  }

  public async setBricksType(node: TreeNodeModel, type: BricksType): Promise<void> {
    await bricksDao.setReviewDayByQidAndType(node.qid.toString(), type);
    BABA.sendNotification(BabaStr.BricksData_setBricksTypeFinish);
  }

  public async newBrickGroup(name: string): Promise<void> {
    await groupDao.newBrickGroup(name);
  }

  public async removeBrickGroup(time: number): Promise<void> {
    await groupDao.removeBrickGroupByTime(time);
  }

  public async getAllGroup() {
    return await groupDao.getAllGroup();
  }

  public getCard(qid: string): ReviewCard | undefined {
    return this.reviewCards.get(qid);
  }

  public async submitReview(qid: string, rating: ReviewRating): Promise<ReviewCard> {
    const current = this.reviewCards.get(qid) || createNewMMXCard(Date.now(), this.getInitialDifficulty(qid));
    const updated = mmxReview(current, rating);
    this.reviewCards.set(qid, updated);
    await this.persistReviewStore();
    this.fire();
    return updated;
  }

  public getDueQueue(): Array<{ qid: string; card: ReviewCard }> {
    if (this.ensureDailyPlan()) {
      void this.persistReviewStore();
    }
    const todayPlan = this.dailyPlan?.qids || [];
    const dueMap = new Map<string, ReviewCard>(this.getAllDueCards().map((item) => [item.qid, item.card]));

    return todayPlan
      .map((qid) => ({ qid, card: dueMap.get(qid) }))
      .filter((item): item is { qid: string; card: ReviewCard } => item.card !== undefined);
  }

  public getTodayLearnedQueue(): Array<{ qid: string; card: ReviewCard }> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const endMs = startMs + 24 * 60 * 60 * 1000;

    return Array.from(this.reviewCards.entries())
      .filter(([, card]) => card.createdAt >= startMs && card.createdAt < endMs)
      .map(([qid, card]) => ({ qid, card }))
      .sort((a, b) => b.card.createdAt - a.card.createdAt);
  }

  public getStats(): { total: number; dueToday: number; learning: number; review: number } {
    const dueToday = this.getDueQueue().length;
    let learning = 0;
    let review = 0;

    for (const card of this.reviewCards.values()) {
      if (card.state === "learning" || card.state === "relearning" || card.state === "new") {
        learning++;
      } else if (card.state === "review") {
        review++;
      }
    }

    return {
      total: this.reviewCards.size,
      dueToday,
      learning,
      review,
    };
  }

  public async syncAcceptedProblemsFromQuestionData(): Promise<number> {
    return 0;
  }

  private async initializeReviewStore(): Promise<void> {
    const workspaceFolder = await selectWorkspaceFolder(false);
    if (!workspaceFolder) {
      this.reviewDataPath = "";
      this.reviewCards.clear();
      this.dailyPlan = undefined;
      return;
    }

    const dataDir = await prepareExtensionDataDir(workspaceFolder);
    await fse.ensureDir(dataDir);
    this.reviewDataPath = path.join(dataDir, REVIEW_STORE_FILE);

    if (!(await fse.pathExists(this.reviewDataPath))) {
      await this.writeStore({
        version: REVIEW_STORE_VERSION,
        cards: {},
        migratedFromLegacy: false,
      });
    }

    const needsPersist = await this.loadReviewStore();
    const dailyPlanChanged = this.ensureDailyPlan();
    if (needsPersist || dailyPlanChanged) {
      await this.persistReviewStore();
    }
  }

  private async loadReviewStore(): Promise<boolean> {
    if (!this.reviewDataPath) {
      this.reviewCards.clear();
      this.dailyPlan = undefined;
      this.migratedFromLegacy = false;
      return false;
    }

    try {
      const raw = (await fse.readJson(this.reviewDataPath)) as Partial<IReviewStore>;
      if (this.isEmptyReviewStore(raw)) {
        const restoredNeedsPersist = await this.restoreReviewStoreFromBackup();
        if (restoredNeedsPersist !== undefined && this.reviewCards.size > 0) {
          return restoredNeedsPersist;
        }
      }
      return this.applyLoadedStore(raw);
    } catch {
      const restoredNeedsPersist = await this.restoreReviewStoreFromBackup();
      if (restoredNeedsPersist !== undefined) {
        return restoredNeedsPersist;
      }

      await this.archiveUnreadableReviewStore();
      this.reviewCards.clear();
      this.dailyPlan = undefined;
      this.migratedFromLegacy = false;
      await this.writeStore({
        version: REVIEW_STORE_VERSION,
        cards: {},
        migratedFromLegacy: false,
      });
      return false;
    }
  }

  private getAllDueCards(): Array<{ qid: string; card: ReviewCard }> {
    const dayEnd = this.getDayEndTimestamp();
    return Array.from(this.reviewCards.entries())
      .filter(([, card]) => card.due <= dayEnd)
      .map(([qid, card]) => ({ qid, card }))
      .sort((a, b) => a.card.due - b.card.due);
  }

  private ensureDailyPlan(): boolean {
    const today = this.getTodayKey();
    if (this.dailyPlan?.date === today && this.isDailyPlanValid(this.dailyPlan.qids)) {
      return false;
    }

    const qids = this.getAllDueCards()
      .slice(0, MAX_DAILY_REVIEW)
      .map((item) => item.qid);

    this.dailyPlan = {
      date: today,
      qids,
    };

    return true;
  }

  private getTodayKey(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private getDayEndTimestamp(date: Date = new Date()): number {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end.getTime();
  }

  private async persistReviewStore(): Promise<void> {
    if (!this.reviewDataPath) {
      return;
    }

    const cards = Array.from(this.reviewCards.entries()).reduce((result: Record<string, ReviewCard>, [qid, card]) => {
      result[qid] = card;
      return result;
    }, {});

    await this.writeStore({
      version: REVIEW_STORE_VERSION,
      cards,
      migratedFromLegacy: this.migratedFromLegacy,
      dailyPlan: this.dailyPlan,
    });
  }

  private async writeStore(store: IReviewStore): Promise<void> {
    await this.backupCurrentReviewStore(store);
    await fse.writeJson(this.reviewDataPath, store, { spaces: 2 });
  }

  private applyLoadedStore(raw: Partial<IReviewStore>): boolean {
    const normalized = this.normalizeReviewCards(raw.cards || {});
    this.reviewCards = new Map<string, ReviewCard>(Object.entries(normalized.cards));
    this.dailyPlan = this.normalizeDailyPlan(raw.dailyPlan, normalized.cards);
    const versionMismatch = raw.version !== REVIEW_STORE_VERSION;
    this.migratedFromLegacy = Boolean(raw.migratedFromLegacy) || normalized.migratedFromLegacy;
    return versionMismatch || normalized.migratedFromLegacy;
  }

  private getReviewStoreBackupPath(): string {
    return `${this.reviewDataPath}${REVIEW_STORE_BACKUP_SUFFIX}`;
  }

  private async backupCurrentReviewStore(nextStore?: IReviewStore): Promise<void> {
    if (!this.reviewDataPath) {
      return;
    }

    if (!(await fse.pathExists(this.reviewDataPath))) {
      return;
    }

    const stats = await fse.stat(this.reviewDataPath);
    if (stats.size <= 0) {
      return;
    }

    if (this.isEmptyReviewStore(nextStore) && (await this.hasUsableReviewStoreBackup())) {
      return;
    }

    await fse.copy(this.reviewDataPath, this.getReviewStoreBackupPath(), { overwrite: true });
  }

  private async hasUsableReviewStoreBackup(): Promise<boolean> {
    const backupPath = this.getReviewStoreBackupPath();
    if (!(await fse.pathExists(backupPath))) {
      return false;
    }

    try {
      const raw = (await fse.readJson(backupPath)) as Partial<IReviewStore>;
      return Object.keys(this.normalizeReviewCards(raw.cards || {}).cards).length > 0;
    } catch {
      return false;
    }
  }

  private async restoreReviewStoreFromBackup(): Promise<boolean | undefined> {
    const backupPath = this.getReviewStoreBackupPath();
    if (!(await fse.pathExists(backupPath))) {
      return undefined;
    }

    try {
      const raw = (await fse.readJson(backupPath)) as Partial<IReviewStore>;
      const needsPersist = this.applyLoadedStore(raw);
      if (needsPersist) {
        await this.persistReviewStore();
      } else {
        await fse.copy(backupPath, this.reviewDataPath, { overwrite: true });
      }
      return false;
    } catch {
      return undefined;
    }
  }

  private async archiveUnreadableReviewStore(): Promise<void> {
    if (!this.reviewDataPath) {
      return;
    }

    if (!(await fse.pathExists(this.reviewDataPath))) {
      return;
    }

    const archivedPath = `${this.reviewDataPath}.corrupt-${Date.now()}`;
    await fse.copy(this.reviewDataPath, archivedPath, { overwrite: true });
  }

  private isEmptyReviewStore(store: Partial<IReviewStore> | undefined): boolean {
    return !store?.cards || Object.keys(store.cards).length === 0;
  }

  private normalizeReviewCards(cards: Record<string, ReviewCard | LegacySM2Card>): {
    cards: Record<string, ReviewCard>;
    migratedFromLegacy: boolean;
  } {
    let migratedFromLegacy = false;
    const normalized = Object.entries(cards).reduce((result: Record<string, ReviewCard>, [qid, card]) => {
      if (isReviewCard(card) && this.isPersistedReviewCard(card)) {
        result[qid] = card;
        return result;
      }

      if (isLegacySM2Card(card)) {
        result[qid] = migrateLegacySM2Card(card);
        migratedFromLegacy = true;
      }

      return result;
    }, {});

    return {
      cards: normalized,
      migratedFromLegacy,
    };
  }

  private normalizeDailyPlan(
    dailyPlan: IDailyReviewPlan | undefined,
    cards: Record<string, ReviewCard>
  ): IDailyReviewPlan | undefined {
    if (!dailyPlan) {
      return undefined;
    }

    const qids = dailyPlan.qids.filter((qid) => cards[qid] !== undefined);
    return {
      date: dailyPlan.date,
      qids,
    };
  }

  private isPersistedReviewCard(card: ReviewCard | undefined): card is ReviewCard {
    if (!card) {
      return false;
    }

    return (
      Number.isFinite(card.due) &&
      Number.isFinite(card.createdAt) &&
      Number.isFinite(card.interval) &&
      Number.isFinite(card.repetition) &&
      Number.isFinite(card.lastReview) &&
      Number.isFinite(card.difficulty) &&
      Number.isFinite(card.halflife) &&
      Number.isFinite(card.lapses) &&
      Number.isFinite(card.lastRecall) &&
      (card.createdAt > 0 || card.lastReview > 0)
    );
  }

  private isDailyPlanValid(qids: string[]): boolean {
    return qids.every((qid) => this.reviewCards.has(qid));
  }

  private getInitialDifficulty(qid: string): number {
    const questionProxy = BABA.getProxy(BabaStr.QuestionDataProxy);
    const node = questionProxy.getNodeByQid(qid) || questionProxy.getNodeById(qid);
    return estimateInitialDifficulty(node?.difficulty);
  }
}

export const bricksDataService: BricksDataService = new BricksDataService();

export class BricksDataProxy extends BABAProxy {
  static NAME = BabaStr.BricksDataProxy;

  constructor() {
    super(BricksDataProxy.NAME);
  }

  public async setBricksType(node: TreeNodeModel, type: BricksType): Promise<void> {
    await bricksDataService.setBricksType(node, type);
  }

  public async newBrickGroup(name: string): Promise<void> {
    await bricksDataService.newBrickGroup(name);
  }

  public async removeBrickGroup(time: number): Promise<void> {
    await bricksDataService.removeBrickGroup(time);
  }

  public async getAllGroup() {
    return await bricksDataService.getAllGroup();
  }
}

export class BricksDataMediator extends BABAMediator {
  static NAME = BabaStr.BricksDataMediator;

  constructor() {
    super(BricksDataMediator.NAME);
  }

  listNotificationInterests(): string[] {
    return [
      BabaStr.VSCODE_DISPOST,
      BabaStr.BricksData_refresh,
      BabaStr.InitFile,
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
      BabaStr.BABACMD_setBricksType,
      BabaStr.BABACMD_newBrickGroup,
      BabaStr.BABACMD_addQidToGroup,
      BabaStr.BABACMD_removeBrickGroup,
      BabaStr.BABACMD_removeQidFromGroup,
      BabaStr.BricksData_submitAndAccepted,
      BabaStr.BricksData_setBricksTypeFinish,
      BabaStr.BricksData_newBrickGroupFinish,
      BabaStr.BricksData_removeBrickGroupFinish,
      BabaStr.BricksData_addQidToGroupFinish,
      BabaStr.BricksData_removeQidFromGroupFinish,
      BabaStr.CommitResult_showFinish,
      BabaStr.BricksData_removeBricksHaveFinish,
      BabaStr.BABACMD_removeBricksHave,
      BabaStr.BABACMD_removeBricksNeedReviewDay,
      BabaStr.BABACMD_removeBricksNeedReviewDayNode,
    ];
  }

  async handleNotification(notification: BaseCC.BaseCC.INotification): Promise<void> {
    const body = notification.getBody();
    switch (notification.getName()) {
      case BabaStr.VSCODE_DISPOST:
        break;
      case BabaStr.InitFile:
        await bricksDataService.initialize();
        break;
      case BabaStr.BricksData_newBrickGroupFinish:
      case BabaStr.BricksData_removeBrickGroupFinish:
      case BabaStr.BricksData_addQidToGroupFinish:
      case BabaStr.BricksData_removeQidFromGroupFinish:
      case BabaStr.BricksData_setBricksTypeFinish:
      case BabaStr.BricksData_refresh:
      case BabaStr.BricksData_submitAndAccepted:
      case BabaStr.USER_statusChanged:
      case BabaStr.statusBar_update_statusFinish:
      case BabaStr.TreeData_searchTodayFinish:
      case BabaStr.TreeData_searchUserContestFinish:
      case BabaStr.TreeData_searchScoreRangeFinish:
      case BabaStr.TreeData_searchContest:
      case BabaStr.ConfigChange_hideScore:
      case BabaStr.ConfigChange_SortStrategy:
      case BabaStr.TreeData_favoriteChange:
      case BabaStr.BricksData_removeBricksHaveFinish:
        bricksDataService.fire();
        break;
      case BabaStr.QuestionData_ReBuildQuestionDataFinish:
        await bricksDataService.syncAcceptedProblemsFromQuestionData();
        bricksDataService.fire();
        break;
      case BabaStr.CommitResult_showFinish:
        await bricksDataService.checkSubmit(body);
        break;
      case BabaStr.BABACMD_setBricksType:
        await bricksViewController.setBricksType(body.node, body.type);
        break;
      case BabaStr.BABACMD_newBrickGroup:
        await bricksViewController.newBrickGroup();
        break;
      case BabaStr.BABACMD_addQidToGroup:
        await bricksViewController.addQidToGroup(body);
        break;
      case BabaStr.BABACMD_removeBrickGroup:
        await bricksViewController.removeBrickGroup(body);
        break;
      case BabaStr.BABACMD_removeQidFromGroup:
        await bricksViewController.removeQidFromGroup(body);
        break;
      case BabaStr.BABACMD_removeBricksHave:
        await bricksViewController.removeBricksHave();
        break;
      case BabaStr.BABACMD_removeBricksNeedReviewDay:
        await bricksViewController.removeBricksNeedReviewDay(body);
        break;
      case BabaStr.BABACMD_removeBricksNeedReviewDayNode:
        await bricksViewController.removeBricksNeedReviewDayNode(body);
        break;
      default:
        break;
    }
  }
}
