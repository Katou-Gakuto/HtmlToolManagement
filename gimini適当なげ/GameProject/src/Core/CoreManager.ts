/**
 * ゲーム全体の初期化、更新、終了処理を統括管理する司令塔。
 * 各マネージャーのライフサイクルを管理します。
 */
export class CoreManager {
  constructor() {
    console.log("CoreManager: Initialized");
  }

  public initialize(): void {
    // TODO: 各マネージャーの初期化処理
    console.log("CoreManager: Initialize");
  }

  public update(deltaTime: number): void {
    // TODO: 各マネージャーの更新処理
  }

  public terminate(): void {
    // TODO: 終了処理、セーブ実行など
    console.log("CoreManager: Terminate");
  }
}