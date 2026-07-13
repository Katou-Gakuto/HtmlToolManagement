/**
 * =====================================================================
 * 空間演出・プレイヤー (Unit B: World Explorer Unit)
 * * 目的:
 * ゲームの2Dマップ空間、プレイヤーの移動、当たり判定、
 * およびリズムやコンボといったゲームプレイの「演出（楽しさ）」を管理します。
 * * 特徴:
 * - 仮想ファイルシステム(Unit A)のデータそのものは持たず、IDと「座標(x, y)」のみを持ちます。
 * - UI(Unit C)は持たず、スコアやコンボが変化したら「数字が変わったよ」とイベントでUIに伝えます。
 * - 実際の描画処理（CanvasAPI等）は、この座標データをもとに別関数（またはHTML側）で行う想定です。
 * =====================================================================
 */

const WorldExplorer = {
    // プレイヤーの空間情報
    player: {
        x: 0,
        y: 0,
        speed: 5,
        isDashing: false,
        interactingTargetId: null // 現在重なっている（選択できる）ファイルのID
    },

    // マップ上のオブジェクト（ファイルやフォルダ）の座標リスト
    // { 'file-001': { x: 100, y: 200, type: 'FILE' }, ... }
    mapObjects: {},

    // 演出・ゲーム性のステータス
    gameStatus: {
        score: 0,
        combo: 0,
        focus: 0,     // 集中力ゲージ (0〜100)
        isFlow: false // ゾーン（Flow）状態か
    },

    // リズム判定用（BPM = 1分間の拍数）
    rhythmInfo: {
        bpm: 120,
        lastActionTime: 0
    },

    /**
     * 【初期化】
     */
    init: function() {
        // [受信] Unit Aから「初期のファイル構成が準備できたよ」と言われた時、マップに配置する
        EventBus.on('VFS_UPDATED', (payload) => this.buildMap(payload));

        // [受信] HTMLのキーボード入力等から「プレイヤーを動かして」と言われた時
        EventBus.on('USER_INPUT_MOVE', (payload) => this.movePlayer(payload));

        // [受信] HTMLのキー入力等から「今重なっているファイルに対してアクションしたい」と言われた時
        EventBus.on('USER_INPUT_ACTION', (payload) => this.attemptAction(payload));

        // [受信] Unit A(ActionManager)から「アクションが正式に予定に入ったよ（成功）」と言われた時
        EventBus.on('ACTION_QUEUED', (payload) => this.onActionSuccess(payload));

        // [受信] Unit A(ActionManager)から「アクションを取り消したよ」と言われた時
        EventBus.on('ACTION_UNDONE', (payload) => this.onActionUndone(payload));
    },

    /**
     * 【処理1: マップの自動構築】
     * 本来はVFS_UPDATEDにファイル一覧が乗ってくる想定、または
     * VirtualFileSystemに一覧をリクエストして座標をランダム等で決定します。
     * ここではモックとして配置します。
     */
    buildMap: function(payload) {
        // 仮の配置ロジック：何もない空間にオブジェクトの座標を設定する
        this.mapObjects = {};
        
        // ※実際には payload 内の情報をもとに配置します
        // 例: this.mapObjects['file-001'] = { x: Math.random() * 500, y: Math.random() * 500, type: 'FILE' };

        console.log("[Unit B] マップのオブジェクト座標を再構築しました");
    },

    /**
     * 【処理2: プレイヤーの移動と当たり判定】
     * HTML側（矢印キーなど）から定期的に呼ばれます。
     * * @param {Object} payload 
     * @param {number} payload.dx - X方向の移動量 (-1, 0, 1)
     * @param {number} payload.dy - Y方向の移動量 (-1, 0, 1)
     * @param {boolean} payload.dash - ダッシュボタンを押しているか
     */
    movePlayer: function(payload) {
        // 移動速度の計算
        const currentSpeed = payload.dash ? this.player.speed * 2 : this.player.speed;

        // 座標の更新 (8方向移動)
        this.player.x += payload.dx * currentSpeed;
        this.player.y += payload.dy * currentSpeed;

        // 当たり判定 (Collision Detection) のチェック
        this._checkCollisions();

        // [送信] マップの描画を更新するための通知（HTMLのCanvas等がこれを聞いて絵を描き直す）
        EventBus.emit('WORLD_RENDER_REQUIRED', {
            player: this.player,
            mapObjects: this.mapObjects
        });
    },

    /**
     * 【処理3: アクションの試行】
     * プレイヤーが「削除」や「移動」ボタンを押した時の処理。
     * 実際にデータを変更するのではなく、Unit Aに「予定に入れて！」とお願い(emit)します。
     * * @param {Object} payload 
     * @param {string} payload.actionType - 'MOVE', 'DELETE' など
     * @param {string} payload.destinationId - MOVEの場合の移動先フォルダID等
     */
    attemptAction: function(payload) {
        if (!this.player.interactingTargetId) {
            // 何にも重なっていない場合は何もしない
            return;
        }

        const targetId = this.player.interactingTargetId;

        // [送信] Unit A (ActionManager) に対して、「この操作を予定に追加して」と依頼する
        EventBus.emit('USER_INTENT_ACTION', {
            type: payload.actionType,
            targetFileId: targetId,
            destinationId: payload.destinationId
        });
    },

    /**
     * 【処理4: アクション成功時の演出（Combo/Rhythm計算）】
     * Unit Aで無事に予定として登録されたら、ご褒美としてスコアを計算し、マップから消します。
     */
    onActionSuccess: function(payload) {
        const action = payload.action;

        // 1. マップ上からオブジェクトを隠す（または演出用に「消滅エフェクト状態」にする）
        if (this.mapObjects[action.targetFileId]) {
            this.mapObjects[action.targetFileId].isHidden = true;
            this.player.interactingTargetId = null; // ターゲットから外す
        }

        // 2. リズム・コンボの計算 (ゲーム性の核)
        const now = Date.now();
        const timeDiff = now - this.rhythmInfo.lastActionTime;
        
        // （仮）一定時間内（1.5秒以内）に連続で整理できたらコンボ継続
        if (timeDiff < 1500) {
            this.gameStatus.combo += 1;
            this.gameStatus.focus = Math.min(100, this.gameStatus.focus + 10);
        } else {
            this.gameStatus.combo = 1; // コンボ途切れる
        }

        // 集中ゲージMAXでFlow（ゾーン）状態に突入
        if (this.gameStatus.focus >= 100 && !this.gameStatus.isFlow) {
            this.gameStatus.isFlow = true;
            console.log("[Unit B] Flow(ゾーン)状態突入！演出が派手になります");
        }

        // スコア加算（コンボ数に応じて跳ね上がる）
        const rhythmBonus = this.gameStatus.isFlow ? 2 : 1;
        this.gameStatus.score += (100 * this.gameStatus.combo) * rhythmBonus;
        this.rhythmInfo.lastActionTime = now;

        // [送信] UI (Unit C) に対して、「スコアやコンボが変わったから画面の数字を更新して」と伝える
        EventBus.emit('GAME_STATUS_UPDATED', this.gameStatus);
    },

    /**
     * 【処理5: Undo（取り消し）時の演出】
     * プレイヤーが「やっぱりやめた！」とUndoしたとき、マップ上にファイルを復活させます。
     */
    onActionUndone: function(payload) {
        const action = payload.action;

        // マップ上に再表示する
        if (this.mapObjects[action.targetFileId]) {
            this.mapObjects[action.targetFileId].isHidden = false;
        }

        // ペナルティとしてコンボをリセットする
        this.gameStatus.combo = 0;
        this.gameStatus.focus = Math.max(0, this.gameStatus.focus - 20);
        this.gameStatus.isFlow = false;

        EventBus.emit('GAME_STATUS_UPDATED', this.gameStatus);
        EventBus.emit('WORLD_RENDER_REQUIRED', { player: this.player, mapObjects: this.mapObjects });
    },

    /* --- 内部用ヘルパー関数 --- */
    
    /**
     * 当たり判定の簡易ロジック
     * プレイヤー座標とマップオブジェクトの距離を測り、近ければ「選択状態」にする。
     */
    _checkCollisions: function() {
        const detectionRadius = 30; // これくらい近づいたら触れたとみなす
        let foundTarget = null;

        for (const [id, obj] of Object.entries(this.mapObjects)) {
            if (obj.isHidden) continue;

            const dx = this.player.x - obj.x;
            const dy = this.player.y - obj.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < detectionRadius) {
                foundTarget = id;
                break; // 1つ見つけたら終了（優先順位などは適宜調整）
            }
        }

        // 新しくファイルに重なった、または離れた時にイベントを発信
        if (this.player.interactingTargetId !== foundTarget) {
            this.player.interactingTargetId = foundTarget;

            // [送信] UIに対して「このファイルに重なったから詳細（ファイル名等）を表示して」と促す
            if (foundTarget) {
                EventBus.emit('REQUEST_OBJECT_INFO', { targetId: foundTarget });
            } else {
                // 何からも離れたら詳細表示を消す
                EventBus.emit('CLEAR_OBJECT_INFO', {});
            }
        }
    }
};

/**
 * =====================================================================
 * 【手動で繋ぎ合わせるための使用例 / テストコード】
 * =====================================================================
 */

/*
// 1. システム起動時に初期化
WorldExplorer.init();

// 2. HTMLのループ処理（requestAnimationFrameなど）から定期的に呼ばれる
// 右下へダッシュ移動する例
EventBus.emit('USER_INPUT_MOVE', { dx: 1, dy: 1, dash: true });

// 3. プレイヤーがスペースキー（削除）を押した時
// "USER_INPUT_ACTION" を投げると、WorldExplorerが今重なっているファイルのIDを調べて、
// Unit Aへ "USER_INTENT_ACTION" (削除依頼) を転送してくれます。
EventBus.emit('USER_INPUT_ACTION', { actionType: 'DELETE' });
*/