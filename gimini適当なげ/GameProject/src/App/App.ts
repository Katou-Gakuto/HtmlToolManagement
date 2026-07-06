import { CoreManager } from "../Core/CoreManager";

/**
 * アプリケーションのエントリポイント。
 */
class App {
  private coreManager: CoreManager;

  constructor() {
    this.coreManager = new CoreManager();
  }

  public run(): void {
    this.coreManager.initialize();
    // ゲームループ開始などの処理
  }
}

const app = new App();
app.run();