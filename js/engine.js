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
    
    /**
     * 毎フレームの描画処理
     */
    render() {
        // 1. キャンバスのクリア
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. プレイヤーの描画
        this.drawPlayer();

        // 3. エンティティ（ファイル・フォルダ）の描画
        const entities = window.mockSystem.getVisibleEntities();
        
        entities.forEach(entity => {
            // 色分け: フォルダは青(folder)、ファイルは灰色(file)
            this.ctx.fillStyle = (entity.type === 'folder') ? '#4299e1' : '#a0aec0';
            
            // 矩形の描画
            this.ctx.fillRect(entity.x, entity.y, 40, 40);
            
            // 枠線（フォルダとファイルを見やすく）
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.strokeRect(entity.x, entity.y, 40, 40);
            
            // 名前表示
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(entity.name, entity.x + 20, entity.y - 10);
        });
    }

    /**
     * プレイヤーを描画するメソッド
     */
    drawPlayer() {
        // プレイヤーの位置(this.player.x, this.player.y)に描画
        this.ctx.fillStyle = '#f6e05e'; // 黄色のプレイヤー
        this.ctx.fillRect(this.player.x, this.player.y, 30, 30);
        
        // プレイヤーの視認性を上げるための枠
        this.ctx.strokeStyle = '#000';
        this.ctx.strokeRect(this.player.x, this.player.y, 30, 30);
    }
}

window.gameEngine = new GameEngine();