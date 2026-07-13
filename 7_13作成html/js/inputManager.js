/**
 * =====================================================================
 * 入力抽象化システム (Input Manager)
 * 
 * 目的:
 * キーボード、マウス、ゲームパッドなどの物理入力を、「ゲーム内共通コマンド」
 * (MOVE_UP, ACTION_TRIGGER, etc.) に変換して EventBus へ流します。
 * 
 * 特徴:
 * - デバイスごとの差異を吸収し、ロジック側を疎結合にします。
 * - マッピング（キーバインド）を動的に変更可能です。
 * - 連打防止や同時押し処理をこのレイヤーで吸収できます。
 * =====================================================================
 */

const InputManager = {
    // 物理キーとゲーム内コマンドの紐付けテーブル
    keyMap: {
        'ArrowUp': 'MOVE_UP',
        'ArrowDown': 'MOVE_DOWN',
        'ArrowLeft': 'MOVE_LEFT',
        'ArrowRight': 'MOVE_RIGHT',
        'w': 'MOVE_UP',
        's': 'MOVE_DOWN',
        'a': 'MOVE_LEFT',
        'd': 'MOVE_RIGHT',
        ' ': 'ACTION_TRIGGER',      // スペースキー
        'Enter': 'ACTION_TRIGGER',
        'Escape': 'UI_MENU',
        'Shift': 'ACTION_DASH'
    },

    // 現在押されているキーの状態（同時押し管理用）
    pressedKeys: new Set(),

    /**
     * 【初期化】
     * ブラウザのイベントリスナーを登録し、入力を待ち受けます。
     */
    init: function() {
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
        window.addEventListener('mousedown', (e) => this.handleMouseDown(e));

        console.log("[InputManager] 入力管理システム初期化完了。");
    },

    handleKeyDown: function(e) {
        // 同じキーの連打（ブラウザのキーリピート）を防止する場合
        if (this.pressedKeys.has(e.key)) return;
        this.pressedKeys.add(e.key);

        const command = this.keyMap[e.key];
        if (command) {
            // ゲーム内コマンドとして通知
            EventBus.emit('INPUT_COMMAND', { command: command, state: 'PRESSED', originalEvent: e });
        }
    },

    handleKeyUp: function(e) {
        this.pressedKeys.delete(e.key);
        
        const command = this.keyMap[e.key];
        if (command) {
            EventBus.emit('INPUT_COMMAND', { command: command, state: 'RELEASED', originalEvent: e });
        }
    },

    handleMouseDown: function(e) {
        // マウスの場所や種類に応じて抽象化する例
        const command = 'CLICK_AT';
        EventBus.emit('INPUT_COMMAND', { 
            command: command, 
            state: 'CLICKED', 
            x: e.clientX, 
            y: e.clientY, 
            button: e.button 
        });
    },

    /**
     * 【マッピングのカスタマイズ】
     * プレイヤーがキーコンフィグを変更した際に呼び出します。
     */
    updateBinding: function(key, command) {
        this.keyMap[key] = command;
        console.log(`[InputManager] マッピング変更: ${key} -> ${command}`);
    }
};

/**
 * =====================================================================
 * 【使用例 / テストコード】
 * =====================================================================
 */

/*
// 1. システム起動時に初期化
InputManager.init();

// 2. 他のユニット（WorldExplorerなど）は、物理キーを気にせずコマンドだけを待つ
EventBus.on('INPUT_COMMAND', (payload) => {
    if (payload.command === 'MOVE_UP' && payload.state === 'PRESSED') {
        console.log("プレイヤーが上に移動しようとしている！");
        // ここで WorldExplorer.movePlayer(...) を呼ぶ
    }
    
    if (payload.command === 'ACTION_TRIGGER') {
        console.log("決定ボタンが押された！");
    }
});
*/