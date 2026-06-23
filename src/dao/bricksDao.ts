/*
 * https://github.com/ccagml/leetcode-extension/src/dao/bricksDao.ts
 * Path: https://github.com/ccagml/leetcode-extension
 * Created Date: Wednesday, November 23rd 2022, 4:36:38 pm
 * Author: ccagml
 *
 * Copyright (c) 2022  ccagml . All rights reserved.
 */

import { getbricksReviewDay, prepareExtensionDataDir, selectWorkspaceFolder } from "../utils/ConfigUtils";
import { useWsl, toWinPath, getDayStart, getDayNow, getDayEnd } from "../utils/SystemUtils";
import * as path from "path";
import * as fse from "fs-extra";
import { BricksType } from "../model/ConstDefind";

// let bricks_json = {
//   version: 1,
//   all_bricks: {
//     [qid]: {
//       fid: "xxx", // 页面显示的编号可能有空格之类的
//       submit_time: [], // 上次提交的时间
//       type: 1, // 类型
//     },
//   },
// };

class BricksDao {
  version = 1;
  public async bricks_data_path(useLegacyDir: boolean = false) {
    // const language: string | undefined = await fetchProblemLanguage();
    // if (!language) {
    //   return;
    // }
    const workspaceFolder: string = await selectWorkspaceFolder(false);
    if (!workspaceFolder) {
      return;
    }
    let lcpr_data_path: string = await prepareExtensionDataDir(workspaceFolder, useLegacyDir);
    await fse.ensureDir(lcpr_data_path);

    let finalPath = path.join(lcpr_data_path, "study-progress.json");
    finalPath = useWsl() ? await toWinPath(finalPath) : finalPath;

    if (!(await fse.pathExists(finalPath))) {
      await fse.createFile(finalPath);
      await fse.writeFile(finalPath, JSON.stringify({ version: this.version }));
    }

    return finalPath;
  }
  public async init() {
    let lcpr_data_path = await this.bricks_data_path();
    if (!lcpr_data_path) {
      return;
    }
  }

  private async _write_data(data: object) {
    let lcpr_data_path = await this.bricks_data_path();
    if (!lcpr_data_path) {
      return;
    }
    return await fse.writeFile(lcpr_data_path, JSON.stringify(data, null, 4));
  }

  private async _read_data(useLegacyDir: boolean = false) {
    let lcpr_data_path = await this.bricks_data_path(useLegacyDir);
    if (!lcpr_data_path) {
      return {};
    }
    let temp_data = await fse.readFile(lcpr_data_path, "utf8");
    return JSON.parse(temp_data) || {};
  }

  public async getAllBricks(useLegacyDir: boolean = false) {
    let allData = await this._read_data(useLegacyDir);
    return allData.all_bricks || {};
  }

  private getTimeByType(type: number, today_time: number, add_flag?: boolean) {
    let need_day_ago = 7;
    switch (type) {
      case BricksType.TYPE_0:
        return today_time - today_time;
        break;
      case BricksType.TYPE_1:
        // 1:(14天搬砖simple)
        need_day_ago = 14;
        break;
      case BricksType.TYPE_2:
        //  2:(7天后搬砖simple_error)
        need_day_ago = 7;
        break;
      case BricksType.TYPE_3:
        // 3:(5天后搬砖simple_time)
        need_day_ago = 5;
        break;
      case BricksType.TYPE_4:
        // 4:(3天后搬砖(time_limit))
        need_day_ago = 3;
        break;
      case BricksType.TYPE_5:
        //  5:(2天后搬砖(medium))
        need_day_ago = 2;
        break;
      case BricksType.TYPE_6:
        // 6: (1天后搬砖(hard))
        need_day_ago = 1;
        break;
      default:
        break;
    }

    return add_flag ? today_time + need_day_ago * 86400 : today_time - need_day_ago * 86400;
  }


  public async getTodayBricks(): Promise<string[]> {
    let today_time = getDayStart();
    let all_bricks = await this.getAllBricks();
    let all_qid: Array<string> = [];
    for (const qid in all_bricks) {
      const value = all_bricks[qid];
      const submit_time = value.submit_time || [];
      const submit_size = submit_time.length;
      if (value.type > BricksType.TYPE_0) {
        if (submit_size < 1 || submit_time[submit_size - 1] < this.getTimeByType(value.type, today_time)) {
          all_qid.push(qid);
        }
      }
    }
    return all_qid;
  }

  public async getNeedReviewQidByReviewTime(review_time: number): Promise<string[]> {
    let all_bricks = await this.getAllBricks();
    let all_qid: Array<string> = [];
    for (const qid in all_bricks) {
      const value = all_bricks[qid];
      const review_day = value.review_day || [];
      if (review_day.includes(review_time)) {
        all_qid.push(qid)
      }
    }
    return all_qid;
  }

  // 获取需要复习的日期,时间戳
  public async getNeedReviewDay(): Promise<number[]> {
    let all_bricks = await this.getAllBricks();
    let day_map: Map<number, number> = new Map<number, number>();
    for (const qid in all_bricks) {
      const value = all_bricks[qid];
      const review_day: Array<number> = value.review_day || [];
      if (review_day.length > 0) {
        review_day.forEach(re_time => {
          day_map.set(re_time, 1)
        });
      }
    }
    let result: number[] = [];
    day_map.forEach((_, key) => {
      result.push(key);
    });

    result.sort((a, b) => a - b);
    return result;
  }

  // 设置下次出现的日期
  public async setReviewDayByQidAndType(qid: string, type: BricksType) {
    let today_time = getDayStart(); //获取当天零点的时间
    let next_review_time = today_time + type * 86400

    let temp_data = await this.getInfoByQid(qid);

    let review_day = temp_data.review_day || []
    if (!review_day.includes(next_review_time)) {
      review_day.push(next_review_time)
      review_day.sort((a, b) => a - b);
    }
    temp_data.review_day = review_day;
    await this.setInfoByQid(qid, temp_data);
  }


  // public async getLastSubmitTimeToolTip(qid_list: Array<string>) {
  //   let all_bricks = await this.getAllBricks();
  //   let result: Map<string, string> = new Map<string, string>();
  //   qid_list.forEach((qid) => {
  //     const value = all_bricks[qid];
  //     const submit_time = value.submit_time || [];
  //     const submit_size = submit_time.length;
  //     if (submit_size >= 1) {
  //       result.set(qid, `${getYMD(submit_time[submit_size - 1])}日提交`);
  //     }
  //   });
  //   return result;
  // }

  public async getTodayBricksSubmit(): Promise<string[]> {
    let today_time = getDayStart();
    let today_time_end = getDayEnd();
    let all_bricks = await this.getAllBricks();
    let all_qid: Array<string> = [];
    for (const qid in all_bricks) {
      const value = all_bricks[qid];
      const submit_time = value.submit_time || [];
      let submit_size = submit_time.length;
      if (
        submit_size > 0 &&
        submit_time[submit_size - 1] >= today_time &&
        submit_time[submit_size - 1] <= today_time_end
      ) {
        all_qid.push(qid);
      }
    }
    return all_qid;
  }

  // public async getTodayBricksSubmitToolTip(qid_list: Array<string>) {
  //   let today_time = getDayStart();
  //   let all_bricks = await this.getAllBricks();
  //   let result: Map<string, string> = new Map<string, string>();
  //   qid_list.forEach((qid) => {
  //     const value = all_bricks[qid];
  //     if (value == undefined) {
  //       result.set(qid, this.TypetimeToMan(BricksType.TYPE_2, this.getTimeByType(BricksType.TYPE_2, today_time, true)));
  //     } else {
  //       result.set(
  //         qid,
  //         this.TypetimeToMan(
  //           value.type != undefined ? value.type : BricksType.TYPE_2,
  //           this.getTimeByType(value.type != undefined ? value.type : BricksType.TYPE_2, today_time, true)
  //         )
  //       );
  //     }
  //   });
  //   return result;
  // }
  // public TypetimeToMan(type, time: number) {
  //   if (time < 10) {
  //     return BricksTypeName.TYPE_0;
  //   }
  //   return `${this.getTypeName(type)}后${getYMD(time)}出现`; //this.getTypeName(type) + getYMD(time) + "出现";
  // }

  public async getInfoByQid(qid: string) {
    let all_bricks = await this.getAllBricks();
    return all_bricks[qid] || {};
  }
  public async setInfoByQid(qid: string, info) {
    let all_data = await this._read_data();
    let temp = all_data.all_bricks || {};
    temp[qid] = info;
    all_data.all_bricks = temp;
    await this._write_data(all_data);
  }
  // 清空
  public async removeReviewDay() {
    let all_data = await this._read_data();
    let temp = all_data.all_bricks || {};

    for (const qid in temp) {
      delete temp[qid].review_day
    }

    all_data.all_bricks = temp;
    await this._write_data(all_data);
  }

  // 清空日期
  public async removeBricksNeedReviewDay(review_time: number) {
    let all_data = await this._read_data();
    let temp = all_data.all_bricks || {};

    for (const qid in temp) {
      if (temp[qid].review_day != undefined && temp[qid].review_day.includes(review_time)) {
        let new_review_day = temp[qid].review_day.filter((p) => { p != review_time })
        temp[qid].review_day = new_review_day
      }
    }

    all_data.all_bricks = temp;
    await this._write_data(all_data);
  }

  // 清空日期下的点
  public async removeBricksNeedReviewDayNode(review_time: number, qid) {
    let all_data = await this._read_data();
    let temp = all_data.all_bricks || {};

    if (temp[qid] != undefined) {
      if (temp[qid].review_day != undefined && temp[qid].review_day.includes(review_time)) {
        let new_review_day = temp[qid].review_day.filter((p) => { p != review_time })
        temp[qid].review_day = new_review_day
      }
    }

    all_data.all_bricks = temp;
    await this._write_data(all_data);
  }

  // 设置其提交时间 和 复习时间
  public async addSubmitTimeByQid(qid: string) {
    let temp_data = await this.getInfoByQid(qid);
    let submit_time = temp_data.submit_time || [];
    let submit_now = getDayNow();
    submit_time.push(submit_now);
    temp_data.submit_time = submit_time;
    if (!temp_data.type) {
      temp_data.type = BricksType.TYPE_2;
    }

    let cur_start_time = getDayStart()
    let review_day: Array<number> = temp_data.review_day || [];
    // 移除需要复习的
    if (review_day.length > 0) {
      let new_review_day: Array<number> = []
      review_day.forEach(re_time => {
        if (re_time > submit_now) {
          new_review_day.push(re_time)
        }
      });
      review_day = new_review_day
    } else {
      let review_day_cfg = getbricksReviewDay()
      review_day_cfg.forEach(r_day => {
        review_day.push(cur_start_time + r_day * 86400)
      })
    }
    temp_data.review_day = review_day
    await this.setInfoByQid(qid, temp_data);
    return submit_now;
  }
  // public async setTypeByQid(qid: string, type) {
  //   let temp_data = await this.getInfoByQid(qid);
  //   temp_data.type = type;
  //   await this.setInfoByQid(qid, temp_data);
  // }
}

export const bricksDao: BricksDao = new BricksDao();
