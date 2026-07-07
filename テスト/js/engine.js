/**
 * 2Dゲームエンジン ＆ 入力抽象化レイヤー
 */
class GameEngine {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.animationFrameId = null;

        this.player = {
            x: 400,
            y: 580,
            speed: 5,
            radius: 15
        };

        this.virtualInputs = {
            UP: false,
            DOWN: false,
            LEFT: false,
            RIGHT: false,
            INTERACT: false
        };

        this.activeOverlay = false;
    }

    init(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext("2d");
        
        this.setupKeyboardInput();
        this.setupVirtualControllerInput();
        
        this.canvas.width = 800;
        this.canvas.height = 600;
    }

    setupKeyboardInput() {
        const keyMap = {
            "ArrowUp": "UP", "KeyW": "UP",
            "ArrowDown": "DOWN", "KeyS": "DOWN",
            "ArrowLeft": "LEFT", "KeyA": "LEFT",
            "ArrowRight": "RIGHT", "KeyD": "RIGHT",
            "Space": "INTERACT", "KeyE": "INTERACT"
        };

        window.addEventListener("keydown", (e) => {
            if (keyMap[e.code] !== undefined) {
                this.virtualInputs[keyMap[e.code]] = true;
                e.preventDefault();
            }
        });

        window.addEventListener("keyup", (e) => {
            if (keyMap[e.code] !== undefined) {
                this.virtualInputs[keyMap[e.code]] = false;
                e.preventDefault();
            }
        });
    }

    setupVirtualControllerInput() {
        const bindButton = (btnId, action) => {
            const btn = document.getElementById(btnId);
            if (!btn) return;

            const startAction = (e) => {
                this.virtualInputs[action] = true;
                e.preventDefault();
            };
            const endAction = (e) => {
                this.virtualInputs[action] = false;
                e.preventDefault();
            };

            btn.addEventListener("touchstart", startAction, { passive: false });
            btn.addEventListener("touchend", endAction, { passive: false });
            btn.addEventListener("mousedown", startAction);
            btn.addEventListener("mouseup", endAction);
            btn.addEventListener("mouseleave", endAction);
        };

        bindButton("v-up", "UP");
        bindButton("v-down", "DOWN");
        bindButton("v-left", "LEFT");
        bindButton("v-right", "RIGHT");
        bindButton("v-action", "INTERACT");
    }

    start() {
        if (!this.animationFrameId) {
            this.gameLoop();
        }
    }

    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    gameLoop() {
        this.update();
        this.render();
        this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
    }

    update() {
        if (this.activeOverlay) return;

        if (this.virtualInputs.UP) this.player.y -= this.player.speed;
        if (this.virtualInputs.DOWN) this.player.y += this.player.speed;
        if (this.virtualInputs.LEFT) this.player.x -= this.player.speed;
        if (this.virtualInputs.RIGHT) this.player.x += this.player.speed;

        this.player.x = Math.max(this.player.radius, Math.min(this.canvas.width - this.player.radius, this.player.x));
        this.player.y = Math.max(this.player.radius, Math.min(this.canvas.height - this.player.radius, this.player.y));

        const entities = window.mockSystem.getVisibleEntities();
        let closeEntity = null;

        entities.forEach(entity => {
            const dx = this.player.x - entity.x;
            const dy = this.player.y - entity.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < (this.player.radius + entity.radius + 15)) {
                closeEntity = entity;
            }
        });

        if (closeEntity && this.virtualInputs.INTERACT) {
            this.virtualInputs.INTERACT = false;
            window.app.onPlayerInteract(closeEntity);
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 背景グリッド
        this.ctx.strokeStyle = "#3a4454";
        this.ctx.lineWidth = 1;
        for (let x = 0; x < this.canvas.width; x += 40) {
            this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, this.canvas.height); this.ctx.stroke();
        }
        for (let y = 0; y < this.canvas.height; y += 40) {
            this.ctx.beginPath(); this.ctx.moveTo(0, y); this.ctx.lineTo(this.canvas.width, y); this.ctx.stroke();
        }

        const entities = window.mockSystem.getVisibleEntities();
        entities.forEach(entity => {
            this.ctx.beginPath();
            this.ctx.arc(entity.x, entity.y, entity.radius, 0, Math.PI * 2);
            
            // 状態に応じた動的な色分けの決定
            if (entity.type === "folder") {
                this.ctx.fillStyle = "#ecc94b"; // 🏠建物フォルダは常に黄色
            } else if (entity.type === "npc") {
                this.ctx.fillStyle = "#ed64a6"; // 🧙‍♂️管理人はピンク
            } else if (entity.type === "file") {
                const tx = window.transactionRegistry.getTransactionForFile(entity.id);
                if (tx) {
                    if (tx.action === "DELETE") {
                        this.ctx.fillStyle = "#e53e3e"; // 🗑削除予定は「赤」
                    } else {
                        this.ctx.fillStyle = "#3182ce"; // 📁移動予定は「青」
                    }
                } else {
                    this.ctx.fillStyle = "#cbd5e0"; // 未決定（保留含む）は「灰」
                }
            }
            
            this.ctx.fill();
            this.ctx.strokeStyle = "#ffffff";
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            // テキストラベル
            this.ctx.fillStyle = "#ffffff";
            this.ctx.font = "12px sans-serif";
            this.ctx.textAlign = "center";
            this.ctx.fillText(entity.name, entity.x, entity.y - entity.radius - 8);
            
            // 予定バッジ文字列
            if (entity.type === "file") {
                const tx = window.transactionRegistry.getTransactionForFile(entity.id);
                if (tx) {
                    this.ctx.fillStyle = tx.action === "DELETE" ? "#feb2b2" : "#90cdf4";
                    this.ctx.font = "bold 11px sans-serif";
                    this.ctx.fillText(`➔ ${tx.proposedDestination}`, entity.x, entity.y + entity.radius + 14);
                }
            }
        });

        // プレイヤー
        this.ctx.beginPath();
        this.ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = "#38a169";
        this.ctx.fill();
        this.ctx.strokeStyle = "#ffffff";
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
}

window.gameEngine = new GameEngine();