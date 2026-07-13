/**
 * =====================================================================
 * イベント駆動型2D描画・更新エンジン (Spatial Engine Core)
 * 目的:
 * - 2Dゲームループの管理、物理更新、衝突判定、およびRendererManagerと協調した
 * Canvasへの描画処理を司ります。
 * 特徴:
 * - EventBus経由でInputManagerから流れる抽象コマンド（MOVE_UP等）を受け取り、
 * WorldExplorer内のプレイヤー座標を滑らかに更新します。
 * - VirtualFileSystem内のファイルオブジェクトに2D空間の物理座標をマッピングし、
 * プレイヤーとの接近判定（衝突・インタラクト可能距離）をリアルタイムに計算します。
 * - 描画は、RendererManagerに統合されたコンテキストを用いて、背景、グリッド、
 * オブジェクト、プレイヤー、HUD（接近中のファイル名表示など）をレイレイヤードにレンダリングします。
 * =====================================================================
 */

const SpatialEngineCore = {
    animationFrameId: null,
    lastTime: 0,
    
    // 入力の現在状態（滑らかな移動を実現するためにキープレス状態を記憶）
    inputState: {
        up: false,
        down: false,
        left: false,
        right: false,
        dash: false
    },

    // 2D空間内のエンティティ（ファイル/フォルダ）の座標情報キャッシュ
    spatialEntities: {}, // { fileId: { id, x, y, width, height, type, name } }
    
    // 空間定数
    GRID_SIZE: 50,
    INTERACT_RANGE: 45, // インタラクト（接近）と判定するピクセル距離
    WORLD_WIDTH: 1600,  // 仮想ワールドの幅
    WORLD_HEIGHT: 1200, // 仮想ワールドの高さ

    /**
     * エンジンの初期化
     */
    init: function() {
        this.registerEventListeners();
        addLocalLog("Spatial Engine Core initialized.");
    },

    /**
     * EventBusイベントの登録
     */
    registerEventListeners: function() {
        // ゲームが開始されたらループを起動
        EventBus.on('GAME_STARTED', () => {
            this.start();
        });

        // シーンがGAMEに切り替わった場合も連動
        EventBus.on('SCENE_CHANGED', (payload) => {
            if (payload.currentScene === 'GAME') {
                this.start();
            } else {
                this.stop();
            }
        });

        // ライフサイクルからの停止要求
        EventBus.on('GAME_REQUEST_SHUTDOWN', () => {
            this.stop();
        });

        // InputManagerからの抽象入力コマンドを受け取る
        EventBus.on('INPUT_COMMAND', (payload) => {
            this.handleInput(payload.command, payload.state);
        });

        // VirtualFileSystemのデータ更新を検知して空間配置を更新
        EventBus.on('VFS_UPDATED', (files) => {
            this.syncVFSToSpatialEntities(files);
        });

        // ファイルシステムに検索や特定のアクションが起きた際の描画フィードバック用
        EventBus.on('UI_SELECTION_UPDATED', (payload) => {
            // 選択状態のエンティティを描画時に強調するための更新
            this.selectedFileIds = payload.selectedFileIds || [];
        });
    },

    /**
     * 入力コマンドの解釈
     * @param {string} command - MOVE_UP, ACTION_DASH などのコマンド名
     * @param {string} state - PRESSED または RELEASED
     */
    handleInput: function(command, state) {
        const isPressed = (state === 'PRESSED');

        switch (command) {
            case 'MOVE_UP':
                this.inputState.up = isPressed;
                break;
            case 'MOVE_DOWN':
                this.inputState.down = isPressed;
                break;
            case 'MOVE_LEFT':
                this.inputState.left = isPressed;
                break;
            case 'MOVE_RIGHT':
                this.inputState.right = isPressed;
                break;
            case 'ACTION_DASH':
                this.inputState.dash = isPressed;
                if (isPressed && WorldExplorer.player) {
                    WorldExplorer.player.isDashing = true;
                    // ダッシュ効果音要請など
                    EventBus.emit('PLAY_SE', { id: 'se_dash' });
                    // 一定時間後にダッシュ状態解除
                    setTimeout(() => {
                        if (WorldExplorer.player) WorldExplorer.player.isDashing = false;
                    }, 200);
                }
                break;
            case 'ACTION_TRIGGER':
                if (isPressed) {
                    this.triggerInteraction();
                }
                break;
        }
    },

    /**
     * 仮想ファイルシステムと空間データの動的同期
     * ※ファイルシステムが更新された際、まだ座標のない新規ファイルに初期座標を割り振ります。
     */
    syncVFSToSpatialEntities: function(files) {
        const updatedEntities = {};
        
        // files はオブジェクト辞書想定
        Object.keys(files).forEach((id) => {
            const file = files[id];
            
            // 既存の座標を引き継ぐか、無ければランダム（またはグリッド状）に自動分散配置
            if (this.spatialEntities[id]) {
                updatedEntities[id] = {
                    ...this.spatialEntities[id],
                    name: file.name,
                    parentFolderId: file.parentFolderId
                };
            } else {
                // 新規オブジェクトの座標決定
                const isFolder = file.type === 'folder' || file.id.includes('folder');
                updatedEntities[id] = {
                    id: file.id,
                    name: file.name,
                    type: isFolder ? 'folder' : 'file',
                    parentFolderId: file.parentFolderId,
                    // ワールド中央付近にグリッド状・らせん状に配置
                    x: 100 + Math.random() * (this.WORLD_WIDTH - 200),
                    y: 100 + Math.random() * (this.WORLD_HEIGHT - 200),
                    width: isFolder ? 50 : 35,
                    height: isFolder ? 50 : 35
                };
            }
        });

        this.spatialEntities = updatedEntities;
        addLocalLog(`Spatial map synchronized: ${Object.keys(this.spatialEntities).length} items positioned.`);
    },

    /**
     * エンジンのゲームループ開始
     */
    start: function() {
        if (!this.animationFrameId) {
            this.lastTime = performance.now();
            
            // プレイヤー座標が初期状態（0, 0）ならキャンバス中央に補正
            if (WorldExplorer.player && WorldExplorer.player.x === 0 && WorldExplorer.player.y === 0) {
                const canvas = document.getElementById('game-canvas');
                if (canvas) {
                    WorldExplorer.player.x = canvas.width / 2;
                    WorldExplorer.player.y = canvas.height / 2;
                }
            }

            this.gameLoop();
            addLocalLog("Spatial engine core loop started.");
        }
    },

    /**
     * エンジンのゲームループ停止
     */
    stop: function() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
            addLocalLog("Spatial engine core loop stopped.");
        }
    },

    /**
     * requestAnimationFrame用のループメソッド
     */
    gameLoop: function() {
        const now = performance.now();
        const deltaTime = (now - this.lastTime) / 1000; // 秒単位の差分
        this.lastTime = now;

        // 状態更新と衝突判定
        this.update(deltaTime);

        // レンダリング処理
        this.render();

        this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
    },

    /**
     * 物理座標、ダッシュ、境界制限、および接近判定の更新
     */
    update: function(dt) {
        if (!WorldExplorer.player) return;

        // 1. 移動ベクトルの算出
        let dx = 0;
        let dy = 0;
        if (this.inputState.up) dy -= 1;
        if (this.inputState.down) dy += 1;
        if (this.inputState.left) dx -= 1;
        if (this.inputState.right) dx += 1;

        // 斜め移動の速度正規化
        if (dx !== 0 && dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx /= length;
            dy /= length;
        }

        // ダッシュ中および通常時の実移動速度の決定
        const currentSpeed = WorldExplorer.player.isDashing 
            ? WorldExplorer.player.speed * 2.5 
            : WorldExplorer.player.speed;

        // 座標更新
        WorldExplorer.player.x += dx * currentSpeed;
        WorldExplorer.player.y += dy * currentSpeed;

        // 2. 移動範囲のワールド境界制限
        const canvas = RendererManager.canvas || document.getElementById('game-canvas');
        const viewWidth = canvas ? canvas.width : 800;
        const viewHeight = canvas ? canvas.height : 600;

        // カメラ（追従）の実装を考慮。今回は簡易境界
        if (WorldExplorer.player.x < 15) WorldExplorer.player.x = 15;
        if (WorldExplorer.player.y < 15) WorldExplorer.player.y = 15;
        if (WorldExplorer.player.x > viewWidth - 15) WorldExplorer.player.x = viewWidth - 15;
        if (WorldExplorer.player.y > viewHeight - 15) WorldExplorer.player.y = viewHeight - 15;

        // 3. エンティティ（ファイル）との接近・衝突判定
        let closestEntityId = null;
        let minDistance = this.INTERACT_RANGE;

        Object.keys(this.spatialEntities).forEach((id) => {
            const entity = this.spatialEntities[id];
            // エンティティの中心座標
            const entityCenterX = entity.x + entity.width / 2;
            const entityCenterY = entity.y + entity.height / 2;

            // プレイヤーとの距離計算
            const dist = Math.hypot(WorldExplorer.player.x - entityCenterX, WorldExplorer.player.y - entityCenterY);
            
            if (dist < minDistance) {
                minDistance = dist;
                closestEntityId = id;
            }
        });

        // 接近しているファイル情報に変化があった場合
        if (WorldExplorer.player.interactingTargetId !== closestEntityId) {
            WorldExplorer.player.interactingTargetId = closestEntityId;
            
            if (closestEntityId) {
                const targetName = this.spatialEntities[closestEntityId].name;
                addLocalLog(`Approached object: ${targetName}`, 'info');
                // UI層等へ接近を通知
                EventBus.emit('PLAYER_NEAR_FILE', { id: closestEntityId, name: targetName });
            } else {
                EventBus.emit('PLAYER_NEAR_FILE', { id: null, name: null });
            }
        }
    },

    /**
     * スペースキーやインタラクトキーが押された際のアクションの実行
     */
    triggerInteraction: function() {
        if (WorldExplorer.player && WorldExplorer.player.interactingTargetId) {
            const targetId = WorldExplorer.player.interactingTargetId;
            const entity = this.spatialEntities[targetId];
            
            if (entity) {
                addLocalLog(`Interacted with: ${entity.name}`, 'success');
                
                // コア管理ロジック(Unit A)に対し、スペース押下によるアクション意図を送信
                EventBus.emit('USER_INTENT_ACTION', {
                    type: 'MOVE', // デフォルトは移動/仕分け
                    targetFileId: targetId
                });

                // インタラクト時の効果音トリガー
                EventBus.emit('PLAY_SE', { id: 'se_interact' });
            }
        }
    },

    /**
     * Canvas要素への毎フレームレンダリング
     */
    render: function() {
        // RendererManagerが有効かつコンテキストが準備できているか確認
        const ctx = RendererManager.ctx || (RendererManager.canvas && RendererManager.canvas.getContext('2d'));
        const canvas = RendererManager.canvas || document.getElementById('game-canvas');
        if (!ctx || !canvas) return;

        // 1. 背景とSF風グリッドの描画
        ctx.fillStyle = "#1e293b"; // 深いネイビー
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = "rgba(74, 85, 104, 0.25)";
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += this.GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += this.GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // 2. 空間エンティティ (ファイル、フォルダ) の描画
        Object.keys(this.spatialEntities).forEach((id) => {
            const entity = this.spatialEntities[id];
            const isSelected = (this.selectedFileIds && this.selectedFileIds.includes(id));
            const isTarget = (WorldExplorer.player && WorldExplorer.player.interactingTargetId === id);

            ctx.save();

            // 接近中・選択中のハイライト効果
            if (isTarget) {
                ctx.shadowBlur = 15;
                ctx.shadowColor = "#63b3ed";
                ctx.strokeStyle = "#63b3ed";
                ctx.lineWidth = 2;
                ctx.strokeRect(entity.x - 4, entity.y - 4, entity.width + 8, entity.height + 8);
            } else if (isSelected) {
                ctx.strokeStyle = "#ecc94b";
                ctx.lineWidth = 1.5;
                ctx.strokeRect(entity.x - 2, entity.y - 2, entity.width + 4, entity.height + 4);
            }

            // タイプによる色分け
            if (entity.type === 'folder') {
                // フォルダの描画 (マニラブルー/SFブルー)
                ctx.fillStyle = "#3182ce";
                ctx.beginPath();
                ctx.roundRect(entity.x, entity.y, entity.width, entity.height, 4);
                ctx.fill();
                
                // フォルダのタブ部分
                ctx.fillStyle = "#2b6cb0";
                ctx.fillRect(entity.x + 4, entity.y - 6, entity.width / 2, 6);
            } else {
                // ファイルの描画 (グレー/ホワイト)
                ctx.fillStyle = "#718096";
                ctx.beginPath();
                ctx.roundRect(entity.x, entity.y, entity.width, entity.height, 2);
                ctx.fill();

                // 書類のようなインナーライン
                ctx.strokeStyle = "#a0aec0";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(entity.x + 6, entity.y + 10);
                ctx.lineTo(entity.x + entity.width - 6, entity.y + 10);
                ctx.moveTo(entity.x + 6, entity.y + 18);
                ctx.lineTo(entity.x + entity.width - 6, entity.y + 18);
                ctx.stroke();
            }

            // オブジェクト名の描画
            ctx.fillStyle = "#e2e8f0";
            ctx.font = "10px monospace";
            ctx.textAlign = "center";
            ctx.fillText(entity.name, entity.x + entity.width / 2, entity.y + entity.height + 15);

            ctx.restore();
        });

        // 3. プレイヤーキャラクタの描画
        if (WorldExplorer.player) {
            const p = WorldExplorer.player;

            ctx.save();
            
            // ダッシュ時の残像風発光
            if (p.isDashing) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = "#f6e05e";
            }

            // プレイヤーの本体 (SFの黄色のコア)
            ctx.fillStyle = "#f6e05e";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
            ctx.fill();

            // 外枠リング
            ctx.strokeStyle = "#1a202c";
            ctx.lineWidth = 2;
            ctx.stroke();

            // コアの輝き
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(p.x - 4, p.y - 4, 3, 0, Math.PI * 2);
            ctx.fill();

            // 接近対象がある場合のコネクションビーム
            if (p.interactingTargetId && this.spatialEntities[p.interactingTargetId]) {
                const target = this.spatialEntities[p.interactingTargetId];
                ctx.strokeStyle = "rgba(99, 179, 237, 0.6)";
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(target.x + target.width / 2, target.y + target.height / 2);
                ctx.stroke();
            }

            ctx.restore();
        }
    }
};

/**
 * モジュール内でログ出力画面にシステムログを流すヘルパー
 */
function addLocalLog(message, type = 'system') {
    const logContainer = document.getElementById('sys-log');
    if (logContainer) {
        const div = document.createElement('div');
        div.className = `log-item ${type}`;
        div.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
        logContainer.appendChild(div);
        logContainer.scrollTop = logContainer.scrollHeight;
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// グローバルスコープにエンジンを展開
window.spatialEngineCore = SpatialEngineCore;