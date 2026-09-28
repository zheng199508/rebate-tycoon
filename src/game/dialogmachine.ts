/** 宝可梦式对话框分页机（纯逻辑，可在 Node 测试）：
 * 点击规则——文字没显示完第一次点击先补全；再点击翻页；最后一页点击才关闭。
 * 多句话必须分页，禁止一整段一框倒完。
 */

export interface DialogPage {
  /** 说话人名牌（旁白/物件可空，不显示名牌） */
  name?: string;
  /** 头像 key（注册表绑定；旁白/物件可空，不显示头像） */
  avatar?: string;
  text: string;
}

export type DialogClickResult = 'complete' | 'next' | 'close';

export class DialogMachine {
  pageIndex = 0;
  shown = 0;
  pageDone = false;

  constructor(readonly pages: DialogPage[]) {
    if (pages.length === 0) throw new Error('对话框至少要有一页');
  }

  get current(): DialogPage {
    return this.pages[this.pageIndex];
  }

  /** 打字机逐字调用：返回本页应显示的字数 */
  setShown(n: number): void {
    this.shown = Math.min(n, this.current.text.length);
    this.pageDone = this.shown >= this.current.text.length;
  }

  /** 玩家点击对话框 */
  click(): DialogClickResult {
    if (!this.pageDone) {
      this.setShown(this.current.text.length);
      return 'complete';
    }
    if (this.pageIndex < this.pages.length - 1) {
      this.pageIndex += 1;
      this.shown = 0;
      this.pageDone = false;
      return 'next';
    }
    return 'close';
  }
}
