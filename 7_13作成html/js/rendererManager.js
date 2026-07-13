/**
 * =====================================================================
 * レンダリング管理システム (Renderer Manager)
 * 
 * 目的:
 * ゲームの世界状態(Unit B)やUI状態(Unit C)を常に監視し、
 * ブラウザの描画更新タイミング(requestAnimationFrame)に合わせて
 * 画面(Canvas)へ反映させる「描画の司令塔」です。
 * 
 * 特徴:
 * - 各ユニットと直接描画ロジックを分離。
 * - 複数のレイヤー（背景、オブジェクト、HUD、演出、デバッグ）を順次描画。
 * - 描画用キャッシュを保持し、イベント受信時に最新状態へ更新。
 * =====================================================================
 */

const RendererManager = {
    canvas: null,
    ctx: null,
    
    // 現在の描画状態（他ユニットから受け取ったデータのキャッシュ）
    state: {
        world: { player: { x: 0, y: 0 }, objects: {} },
        status: { score: 0, combo: 0, focus: 0 },
        debugLogs: []
    },

    particles: [],

    /**
     * 【初期化】
     * キャンバスを取得し、描画ループを開始します。
     * @param {string} canvasId - HTML上のcanvas要素ID
     */
    init: function(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error("[RendererManager] Canvas要素が見つかりません。");
            return;
        }
        this.ctx = this.canvas.getContext('2d');

        // [受信] 世界の状態（プレイヤー・オブジェクト）が更新されたらキャッシュを更新
        EventBus.on('WORLD_RENDER_REQUIRED', (payload) => {
            this.state.world = payload;
        });

        // [受信] ゲームのステータス（スコア・コンボ等）が更新されたらキャッシュを更新
        EventBus.on('GAME_STATUS_UPDATED', (payload) => {
            this.state.status = payload;
        });

        // [受信] デバッグログを表示する場合
        EventBus.on('LOG_MESSAGE', (payload) => {
            this.state.debugLogs.push(payload.message);
            if (this.state.debugLogs.length > 10) this.state.debugLogs.shift();
        });

        EventBus.on('TRIGGER_EFFECT', (payload) => {
            this.spawnParticles(payload.x, payload.y, payload.type);
        });

        console.log("[RendererManager] 描画システム初期化完了。");
        this.startLoop();
    },

    /**
     * 【描画ループの開始】
     */
    startLoop: function() {
        const loop = () => {
            this.draw();
            requestAnimationFrame(loop);
        };
        loop();
    },

    /**
     * 【描画メイン処理】
     * レイヤー順に描画を実行します。
     */
    draw: function() {
        // 1. 画面クリア
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. 世界の描画 (マップ/オブジェクト)
        this.drawWorldLayer();

        // 3. 演出レイヤー (Juiciness: エフェクト/軌跡)
        this.drawJuicinessLayer();

        // 4. UIレイヤー (Spatial UI/HUD)
        this.drawUILayer();

        // 5. デバッグレイヤー (開発者用)
        this.drawDebugLayer();
    },

    /**
     * 【レイヤー1: ワールド】
     */
    drawWorldLayer: function() {
        // プレイヤーの描画
        const p = this.state.world.player;
        this.ctx.fillStyle = '#3498db';
        this.ctx.fillRect(p.x, p.y, 30, 30); // 簡略化
    },

    /**
     * 【レイヤー2: 演出レイヤー (Juiciness)】
     * パーティクルや軌跡など、操作の心地よさを生む場所。
     */
    drawJuicinessLayer: function() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            
            // 物理演算
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.02; // 寿命を減らす
            p.alpha -= 0.02;

            // 消滅チェック
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            // 描画
            this.ctx.globalAlpha = p.alpha;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1.0; // アルファ値を戻す
    },

    spawnParticles: function(x, y, type) {
        const count = 10;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 1.0,
                alpha: 1.0,
                size: Math.random() * 3 + 1,
                color: type === 'DELETE' ? '#ff4757' : '#2ed573' // 削除なら赤、移動なら緑
            });
        }
    },

    /**
     * 【レイヤー3: UIレイヤー (HUD)】
     * スコア、コンボ、進行状況メーター。
     */
    drawUILayer: function() {
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '16px Arial';
        this.ctx.fillText(`Score: ${this.state.status.score || 0}`, 10, 20);
        this.ctx.fillText(`Combo: ${this.state.status.combo || 0}`, 10, 40);
        // ここにプログレスバーの描画ロジックを追加
    },

    /**
     * 【レイヤー4: デバッグレイヤー】
     * Event Log を画面に流す。
     */
    drawDebugLayer: function() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(this.canvas.width - 200, 0, 200, this.canvas.height);
        
        this.ctx.fillStyle = '#0f0';
        this.state.debugLogs.forEach((msg, i) => {
            this.ctx.fillText(msg, this.canvas.width - 190, 20 + (i * 20));
        });
    }
};

/**
 * =====================================================================
 * 【使用例】
 * HTMLで <canvas id="game-canvas" width="800" height="600"></canvas> を用意し、
 * ゲーム開始時に以下を実行します。
 * =====================================================================
 */

/*
// 起動時に呼び出し
RendererManager.init('game-canvas');
*/