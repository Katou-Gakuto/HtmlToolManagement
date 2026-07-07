/**
 * 2Dゲームエンジン ＆ 入力・物理・インタラクト制御レイヤー (Unit 2 統合版)
 */
class GameEngine {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.animationFrameId = null;

        // プレイヤーの初期ステート (仕様書 第1章準拠)
        this.player = {
            x: 400,
            y: 450,
            baseSpeed: 4,
            dashSpeed: 7,
            currentSpeed: 4,
            radius: 14,
            isDashing: false
        };

        // 入力抽象化フラグ (仕様書 第8章準拠)
        this.virtualInputs = {
            UP: false,
            DOWN: false,
            LEFT: false,
            RIGHT: false,
            DASH: false, // Shiftでのダッシュ追加
            INTERACT: false
        };

        // 現在プレイヤーが接近している（インタラクト可能な）エンティティ
        this.closestEntity = null;
        this.interactRange = 35; // 接近を感知する距離(ピクセル)
    }

    /**
     * エンジンの初期化
     */
    init(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext("2d");
        
        this.setupKeyboardInput();
        
        // キャンバスサイズを設定
        this.canvas.width = 700;
        this.canvas.height = 550;
    }

    /**
     * キーボード入力のバインド
     */
    setupKeyboardInput() {
        const keyMap = {
            "ArrowUp": "UP", "KeyW": "UP",
            "ArrowDown": "DOWN", "KeyS": "DOWN",
            "ArrowLeft": "LEFT", "KeyA": "LEFT",
            "ArrowRight": "RIGHT", "KeyD": "RIGHT",
            "Space": "INTERACT", "KeyE": "INTERACT",
            "ShiftLeft": "DASH", "ShiftRight": "DASH"
        };

        window.addEventListener("keydown", (e) => {
            if (keyMap[e.code]) {
                // スペースキーによるブラウザスクロールを防止
                if (e.code === "Space") e.preventDefault();
                this.virtualInputs[keyMap[e.code]] = true;
            }
        });

        window.addEventListener("keyup", (e) => {
            if (keyMap[e.code]) {
                this.virtualInputs[keyMap[e.code]] = false;
            }
        });
    }

    /**
     * ループの開始
     */
    start() {
        if (!this.animationFrameId) {
            const loop = () => {
                this.update();
                this.render();
                this.animationFrameId = requestAnimationFrame(loop);
            };
            this.animationFrameId = requestAnimationFrame(loop);
        }
    }

    /**
     * 状態の更新（物理演算・衝突判定・接近判定）
     */
    update() {
        // 1. ダッシュ状態の判定
        this.player.currentSpeed = this.virtualInputs.DASH ? this.player.dashSpeed : this.player.baseSpeed;

        // 2. 8方向移動ベクトルの計算
        let moveX = 0;
        let moveY = 0;

        if (this.virtualInputs.UP) moveY -= 1;
        if (this.virtualInputs.DOWN) moveY += 1;
        if (this.virtualInputs.LEFT) moveX -= 1;
        if (this.virtualInputs.RIGHT) moveX += 1;

        // 斜め移動時の速度正規化 (ベクトル長を1にする)
        if (moveX !== 0 && moveY !== 0) {
            const length = Math.sqrt(moveX * moveX + moveY * moveY);
            moveX /= length;
            moveY /= length;
        }

        // プレイヤー位置の更新
        this.player.x += moveX * this.player.currentSpeed;
        this.player.y += moveY * this.player.currentSpeed;

        // 3. マップ外への境界衝突判定 (仕様書 1.6)
        if (this.player.x - this.player.radius < 0) this.player.x = this.player.radius;
        if (this.player.x + this.player.radius > this.canvas.width) this.player.x = this.canvas.width - this.player.radius;
        if (this.player.y - this.player.radius < 0) this.player.y = this.player.radius;
        if (this.player.y + this.player.radius > this.canvas.height) this.player.y = this.canvas.height - this.player.radius;

        // 4. 動的エンティティの取得と特殊施設の注入 (仕様書 2.3)
        const entities = this.getActiveEntitiesWithFacilities();

        // 5. 最接近オブジェクトの判定（インタラクト圏内判定）
        let minDistance = Infinity;
        let foundEntity = null;

        entities.forEach(entity => {
            const dx = this.player.x - entity.x;
            const dy = this.player.y - entity.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 互いの半径を考慮した実質距離
            const radiusOffset = entity.type === "folder" ? 22 : 15;
            if (distance < this.interactRange + radiusOffset && distance < minDistance) {
                minDistance = distance;
                foundEntity = entity;
            }
        });

        this.closestEntity = foundEntity;

        // 6. インタラクトキーが押された場合の処理実行 (仕様書 1.9 / 2.4)
        if (this.virtualInputs.INTERACT && this.closestEntity) {
            this.handleInteraction(this.closestEntity);
            this.virtualInputs.INTERACT = false; // チャタリング防止のためフラグを下げる
        }
    }

    /**
     * 仮想ファイルシステムのデータに、固定施設(削除神殿、NPCなど)をマッピングして返す
     */
    getActiveEntitiesWithFacilities() {
        // 現在の部屋のファイルをモックシステムから取得
        let list = [];
        if (window.mockSystem && typeof window.mockSystem.getActiveEntities === "function") {
            list = [...window.mockSystem.getActiveEntities()];
        }

        // マップ上の固定位置に「特殊施設」を動的マッピング (仕様書 2.11, 2.13, 2.14)
        // ルート部屋、または特定の部屋に常駐させる
        const currentPath = window.mockSystem ? window.mockSystem.getCurrentPathString() : "/";

        // 全ての部屋の右上に「削除神殿」、右下に「NPC管理人」を配置する設計
        if (!list.some(e => e.id === "facility-trash-temple")) {
            list.push({ id: "facility-trash-temple", type: "facility", name: "🏛️ 削除神殿", x: 600, y: 100, target: "TRASH" });
        }
        if (!list.some(e => e.id === "npc-manager")) {
            list.push({ id: "npc-manager", type: "npc", name: "🔔 管理人", x: 620, y: 450 });
        }
        if (!list.some(e => e.id === "facility-warp")) {
            list.push({ id: "facility-warp", type: "warp", name: "🌀 帰還ポータル", x: 80, y: 100, target: "root" });
        }

        return list;
    }

    /**
     * オブジェクトへのインタラクト処理 (仕分けアクション・部屋遷移)
     */
    handleInteraction(entity) {
        console.log(`[Engine] インタラクト実行: ${entity.name} (${entity.type})`);

        if (entity.type === "folder") {
            // 📁 フォルダに接近して決定した場合は、そのフォルダ専用マップへ移動 (仕様書 2.4)
            const success = window.mockSystem.changeDirectory(entity.targetDir);
            if (success) {
                console.log(`[Engine] 部屋遷移成功 -> ${window.mockSystem.getCurrentPathString()}`);
                // 遷移演出としてプレイヤーの位置を初期化
                this.player.x = 350;
                this.player.y = 450;
                // メインUI側のリスト表示などもリフレッシュ
                if (window.appController && typeof window.appController.refreshUI === "function") {
                    window.appController.refreshUI();
                }
            }
        } else if (entity.type === "file") {
            // 📄 ファイルにインタラクトした場合、サイドバーのインスペクタを開く
            if (window.appController && typeof window.appController.focusEntity === "function") {
                window.appController.focusEntity(entity.id);
            }
        } else if (entity.type === "npc" && entity.id === "npc-manager") {
            // 🔔 管理人NPCの場合、最終コミットモーダルをキックする (仕様書 2.14)
            if (window.appController && typeof window.appController.openFinalConfirmModal === "function") {
                window.appController.openFinalConfirmModal();
            }
        } else if (entity.type === "facility" && entity.target === "TRASH") {
            console.log("[Engine] 削除神殿にアクセスしました。現在保留中の削除ファイルを閲覧・格納できます。");
        } else if (entity.type === "warp") {
            // 🌀 ポータルによるルート階層へのワープマッピング
            window.mockSystem.currentPath = ["root"];
            this.player.x = 400;
            this.player.y = 450;
            if (window.appController && typeof window.appController.refreshUI === "function") {
                window.appController.refreshUI();
            }
        }
    }

    /**
     * マップ・プレイヤーの描画
     */
    render() {
        if (!this.ctx) return;

        // キャンバスのクリア（背景：ダークダンジョン風）
        this.ctx.fillStyle = "#1e222b";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // グリッド線の描画（探索感を出すための背景演出）
        this.ctx.strokeStyle = "rgba(74, 85, 104, 0.2)";
        this.ctx.lineWidth = 1;
        const gridSize = 40;
        for (let x = 0; x < this.canvas.width; x += gridSize) {
            this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, this.canvas.height); this.ctx.stroke();
        }
        for (let y = 0; y < this.canvas.height; y += gridSize) {
            this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(this.canvas.width, y); this.ctx.stroke();
        }

        // 現在のパス（階層）をマップ左上に描画 (仕様書 2.1)
        const currentPathStr = window.mockSystem ? window.mockSystem.getCurrentPathString() : "/root";
        this.ctx.fillStyle = "#4a5568";
        this.ctx.fillRect(10, 10, 300, 26);
        this.ctx.fillStyle = "#63b3ed";
        this.ctx.font = "bold 12px monospace";
        this.ctx.textAlign = "left";
        this.ctx.fillText(`🗺️ AREA: ${currentPathStr}`, 20, 27);

        // オブジェクト（エンティティ・施設）の描画
        const entities = this.getActiveEntitiesWithFacilities();
        entities.forEach(entity => {
            const isClosest = (this.closestEntity && this.closestEntity.id === entity.id);
            
            this.ctx.beginPath();
            
            if (entity.type === "folder") {
                // 📁 フォルダは「大きな建物」として表現
                this.ctx.arc(entity.x, entity.y, 22, 0, Math.PI * 2);
                this.ctx.fillStyle = isClosest ? "#ecc94b" : "#4299e1"; // 接近時はゴールドにハイライト
            } else if (entity.type === "file") {
                // 📄 ファイルは「キャラクター（円）」として表現
                this.ctx.arc(entity.x, entity.y, 14, 0, Math.PI * 2);
                
                // 仕分け予定（トランザクション）の状態に応じた色変化
                if (window.transactionRegistry) {
                    const tx = window.transactionRegistry.getTransactionForFile(entity.id);
                    if (tx) {
                        this.ctx.fillStyle = tx.action === "DELETE" ? "#e53e3e" : "#3182ce"; // 削除は赤、移動は青
                    } else {
                        this.ctx.fillStyle = isClosest ? "#ecc94b" : "#a0aec0"; // 未処理
                    }
                }
            } else if (entity.type === "facility") {
                // 🏛️ 削除神殿などの特殊施設
                this.ctx.arc(entity.x, entity.y, 28, 0, Math.PI * 2);
                this.ctx.fillStyle = isClosest ? "#ecc94b" : "#9f7aea"; // 紫色ベース
            } else if (entity.type === "npc") {
                // 🔔 管理人NPC
                this.ctx.arc(entity.x, entity.y, 16, 0, Math.PI * 2);
                this.ctx.fillStyle = isClosest ? "#ecc94b" : "#ed64a6"; // ピンクベース
            } else if (entity.type === "warp") {
                // 🌀 ポータル
                this.ctx.arc(entity.x, entity.y, 18, 0, Math.PI * 2);
                this.ctx.fillStyle = isClosest ? "#ecc94b" : "#319795"; // ティールベース
            }

            this.ctx.fill();
            this.ctx.strokeStyle = isClosest ? "#ffffff" : "rgba(255,255,255,0.4)";
            this.ctx.lineWidth = isClosest ? 3 : 1.5;
            this.ctx.stroke();

            // ネームラベルの描画
            this.ctx.fillStyle = isClosest ? "#ffffff" : "#e2e8f0";
            this.ctx.font = isClosest ? "bold 12px sans-serif" : "11px sans-serif";
            this.ctx.textAlign = "center";
            this.ctx.fillText(entity.name, entity.x, entity.y - 32);

            // 移動予定バッジのテキスト表記 (ファイルのみ)
            if (entity.type === "file" && window.transactionRegistry) {
                const tx = window.transactionRegistry.getTransactionForFile(entity.id);
                if (tx) {
                    this.ctx.fillStyle = tx.action === "DELETE" ? "#feb2b2" : "#90cdf4";
                    this.ctx.font = "bold 10px sans-serif";
                    this.ctx.fillText(`➔ ${tx.proposedDestination}`, entity.x, entity.y + 26);
                }
            }
        });

        // プレイヤーの描画 (仕様書 1.8 準拠の緑色のドローン/エージェント風)
        this.ctx.beginPath();
        this.ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = this.virtualInputs.DASH ? "#48bb78" : "#38a169"; // ダッシュ中は明るい緑
        this.ctx.fill();
        this.ctx.strokeStyle = "#ffffff";
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // プレイヤーの内円（コア）
        this.ctx.beginPath();
        this.ctx.arc(this.player.x, this.player.y, 5, 0, Math.PI * 2);
        this.ctx.fillStyle = "#ffffff";
        this.ctx.fill();

        // インタラクトポップアップガイドの描画 (接近時のみ)
        if (this.closestEntity) {
            this.ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
            this.ctx.fillRect(this.player.x - 70, this.player.y - 55, 140, 22);
            this.ctx.strokeStyle = "#ecc94b";
            this.ctx.strokeRect(this.player.x - 70, this.player.y - 55, 140, 22);

            this.ctx.fillStyle = "#ffffff";
            this.ctx.font = "bold 10px sans-serif";
            this.ctx.textAlign = "center";
            let actionText = "SPACEで調べる";
            if (this.closestEntity.type === "folder") actionText = "SPACEで入る";
            if (this.closestEntity.type === "npc") actionText = "SPACEで話す";
            this.ctx.fillText(actionText, this.player.x, this.player.y - 40);
        }
    }
}

// グローバルインスタンスの再生成・上書き
window.gameEngine = new GameEngine();