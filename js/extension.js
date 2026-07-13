/**
 * =====================================================================
 * 拡張機能・プラグイン管理システム (Extension Manager)
 * 
 * 目的:
 * 外部のJavaScriptファイル（プラグインや拡張機能）を動的に読み込み、
 * システムに登録します。これにより、本体のコードを修正することなく
 * ゲームに新しい機能やルールを追加可能にします。
 * 
 * 特徴:
 * - DOMへの動的な `<script>` タグ挿入により非同期読み込みを実現。
 * - 読み込み成功・失敗をEventBusで通知し、各ユニットが反応可能。
 * - 重複読み込みを防ぐためのキャッシュ機能（Set）を搭載。
 * =====================================================================
 */

const ExtensionManager = {
    // 既に読み込まれた拡張機能のURLセット（重複ロード防止）
    loadedExtensions: new Set(),

    /**
     * 【初期化】
     * 読み込みリクエストを待ち受けます。
     */
    init: function() {
        // [受信] 拡張機能のロードを要求された時
        EventBus.on('REQUEST_LOAD_EXTENSION', (payload) => this.load(payload.url));
        
        console.log("[ExtensionManager] 初期化完了。");
    },

    /**
     * 【処理: 外部スクリプトの動的ロード】
     * @param {string} url - 読み込むJSファイルのパス
     */
    load: function(url) {
        // 既に読み込み済みの場合はスキップ
        if (this.loadedExtensions.has(url)) {
            console.warn(`[ExtensionManager] 既に読み込まれています: ${url}`);
            return;
        }

        const script = document.createElement('script');
        script.src = url;
        script.async = true; // 非同期でロード

        // 成功時の処理
        script.onload = () => {
            this.loadedExtensions.add(url);
            console.log(`[ExtensionManager] 読み込み成功: ${url}`);
            
            // [送信] 「拡張機能がロードされたよ！」と通知
            // ロードされたJSファイル側で、このイベントをトリガーに初期化処理を行う想定
            EventBus.emit('EXTENSION_LOADED', { url });
        };

        // 失敗時の処理
        script.onerror = () => {
            console.error(`[ExtensionManager] 読み込み失敗: ${url}`);
            
            // [送信] エラー通知（UIなどが「読み込み失敗」を表示するため）
            EventBus.emit('SYSTEM_ERROR', { 
                module: 'ExtensionManager', 
                message: `拡張機能の読み込みに失敗しました: ${url}` 
            });
        };

        document.head.appendChild(script);
    }
};

/**
 * =====================================================================
 * 【手動で繋ぎ合わせるための使用例】
 * =====================================================================
 */

/*
// 1. システム起動時に初期化
ExtensionManager.init();

// 2. 何らかのタイミング（設定画面やゲーム開始時）で拡張機能をロード
EventBus.emit('REQUEST_LOAD_EXTENSION', { url: 'plugins/my-new-skill.js' });

// 3. 外部JSファイル（my-new-skill.js）の記述例:
//
// EventBus.on('EXTENSION_LOADED', (payload) => {
//     if (payload.url === 'plugins/my-new-skill.js') {
//         // ここで新しい機能を登録する
//         console.log("新しいSkillをシステムに登録しました！");
//     }
// });
*/