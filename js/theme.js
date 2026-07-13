/**
 * =====================================================================
 * テーマ管理システム (Theme Manager)
 * 
 * 目的:
 * 外部のJSONテーマファイルを読み込み、CSS変数(Custom Properties)の更新と
 * 音響設定(AudioManager)の切り替えを一括で行います。
 * 
 * 特徴:
 * - CSS変数への動的マッピング（例: primaryColor -> --primary-color）
 * - オーディオ設定の外部定義による管理
 * - テーマファイル不在時のデフォルトJSONエクスポート機能
 * =====================================================================
 */

const ThemeManager = {
    // デフォルトのテーマ設定
    defaultTheme: {
        id: "default-theme",
        name: "Standard Light",
        cssVariables: {
            "primaryColor": "#3498db",
            "backgroundColor": "#ffffff",
            "textColor": "#2c3e50"
        },
        audio: {
            bgmId: "bgm_default",
            volumeBGM: 0.5,
            volumeSE: 0.8
        }
    },

    /**
     * 【初期化】
     * システム起動時にイベントリスナーを登録します。
     */
    init: function() {
        // [受信] テーマ適用リクエスト
        EventBus.on('REQUEST_LOAD_THEME', (payload) => this.applyTheme(payload.jsonData));
        
        // [受信] テーマが存在しない等のエラー通知を受けた際、デフォルトを書き出す
        EventBus.on('REQUEST_DEFAULT_THEME', () => this.exportDefaultTheme());

        console.log("[ThemeManager] 初期化完了。");
    },

    /**
     * 【処理1: テーマの適用】
     * JSONデータを解析し、CSSとAudioManagerへ反映します。
     */
    applyTheme: function(themeData) {
        if (!themeData) {
            console.warn("[ThemeManager] テーマデータが不正です。デフォルトを使用します。");
            this.exportDefaultTheme();
            return;
        }

        console.log(`[ThemeManager] テーマ適用開始: ${themeData.name || 'Unknown'}`);

        // CSS変数の適用
        if (themeData.cssVariables) {
            const root = document.documentElement;
            Object.entries(themeData.cssVariables).forEach(([key, value]) => {
                // キャメルケースをケバブケースに変換 (例: primaryColor -> --primary-color)
                const cssVar = `--${key.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase()}`;
                root.style.setProperty(cssVar, value);
            });
        }

        // AudioManagerへの指示
        if (themeData.audio) {
            if (themeData.audio.bgmId) {
                EventBus.emit('PLAY_BGM', { id: themeData.audio.bgmId });
            }
            EventBus.emit('SET_VOLUME', { type: 'bgm', value: themeData.audio.volumeBGM });
            EventBus.emit('SET_VOLUME', { type: 'se', value: themeData.audio.volumeSE });
        }

        EventBus.emit('THEME_APPLIED', { themeId: themeData.id });
    },

    /**
     * 【処理2: デフォルトJSONのエクスポート】
     * ファイルが存在しない場合に、システムが読み込めるデフォルトJSONを作成し通知します。
     */
    exportDefaultTheme: function() {
        const jsonString = JSON.stringify(this.defaultTheme, null, 2);
        
        console.log("[ThemeManager] デフォルトテーマを生成しました。");
        
        // UI層へダウンロードや保存を要求
        EventBus.emit('REQUEST_DOWNLOAD_JSON', {
            fileName: 'theme_default.json',
            content: jsonString
        });
    }
};

/**
 * =====================================================================
 * 【使用例】
 * =====================================================================
 */

/*
// 1. 起動時
ThemeManager.init();

// 2. 外部からテーマJSONを読み込んだ場合（例: File APIで読み込んだ後）
// EventBus.emit('REQUEST_LOAD_THEME', { jsonData: parsedJsonObject });

// 3. テーマが読み込めなかった場合
// EventBus.emit('REQUEST_DEFAULT_THEME');
*/