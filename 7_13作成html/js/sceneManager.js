/**
 * =====================================================================
 * シーン管理システム (Scene Manager)
 * 
 * 目的:
 * ゲーム内の「シーン」（タイトル、プレイ、リザルト等）の切り替えを一元管理します。
 * 各画面固有のロジックやリソース読み込み、表示状態を制御します。
 * 
 * 特徴:
 * - EventBusを介したシーン変更リクエストで動作。
 * - シーン遷移時の「前後処理（フェードアウト/イン）」のフックを提供。
 * - 現在のシーン状態を保持し、システム全体に通知。
 * =====================================================================
 */

const SceneManager = {
    // 現在のシーンID
    currentScene: 'none',

    // 定義されているシーン一覧
    scenes: ['TITLE', 'LOADING', 'GAME', 'RESULT'],

    /**
     * 【初期化】
     * 遷移リクエストを待ち受けます。
     */
    init: function() {
        // [受信] シーン変更リクエスト
        EventBus.on('REQUEST_SCENE_CHANGE', (payload) => this.changeScene(payload.sceneId));
        
        console.log("[SceneManager] 初期化完了。");
    },

    /**
     * 【処理: シーンの切り替え】
     * @param {string} sceneId - 移動先のシーンID
     */
    changeScene: function(sceneId) {
        if (!this.scenes.includes(sceneId)) {
            console.warn(`[SceneManager] 未定義のシーンです: ${sceneId}`);
            return;
        }

        if (this.currentScene === sceneId) {
            console.log(`[SceneManager] すでに ${sceneId} にいます。`);
            return;
        }

        console.log(`[SceneManager] 遷移開始: ${this.currentScene} -> ${sceneId}`);

        // 1. [通知] 遷移開始（UIのフェードアニメーション等に利用）
        EventBus.emit('SCENE_CHANGING', { from: this.currentScene, to: sceneId });

        // 2. 状態の更新
        this.currentScene = sceneId;

        // 3. 各ユニットへの指示出し
        // シーンごとのBGM変更
        const bgmMap = {
            'TITLE': 'bgm_title',
            'GAME': 'bgm_battle',
            'RESULT': 'bgm_result'
        };
        if (bgmMap[sceneId]) {
            EventBus.emit('PLAY_BGM', { id: bgmMap[sceneId] });
        }

        // 4. [通知] 遷移完了
        EventBus.emit('SCENE_CHANGED', { currentScene: this.currentScene });
        console.log(`[SceneManager] 遷移完了: ${this.currentScene}`);
    }
};

/**
 * =====================================================================
 * 【使用イメージ】
 * =====================================================================
 */

/*
// 1. 起動時
SceneManager.init();

// 2. 画面遷移（ボタン押下時など）
// EventBus.emit('REQUEST_SCENE_CHANGE', { sceneId: 'GAME' });

// 3. シーンが変わった後の処理（各ユニットがこれを聞いて自身の表示/非表示を切り替える）
EventBus.on('SCENE_CHANGED', (payload) => {
    if (payload.currentScene === 'GAME') {
        // ゲーム画面用の初期化処理
        GameLifecycleManager.start();
    }
});
*/