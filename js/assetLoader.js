/**
 * =====================================================================
 * 非同期アセット管理システム (Asset Loader Unit)
 * 
 * 目的:
 * 画像、音声、設定ファイル(JSON)などを非同期で読み込み、キャッシュします。
 * ゲームプロジェクトのパフォーマンス向上と、リソース管理を一元化します。
 * 
 * 特徴:
 * - すべてのリクエストはPromiseで管理され、完了後にEventBusへ通知されます。
 * - 読み込みの進捗率（パーセンテージ）を算出できるため、プログレスバー表示が容易です。
 * - 読み込んだデータはキャッシュされ、他のユニットから参照可能です。
 * =====================================================================
 */

const AssetLoader = {
    // 読み込まれたアセットのキャッシュ { 'assetId': data }
    cache: {},
    
    // 現在の読み込みステータス
    totalItems: 0,
    loadedItems: 0,

    /**
     * 【初期化】
     * 読み込みリクエストを待ち受けます。
     */
    init: function() {
        // [受信] アセットの読み込み開始をリクエストされた時
        EventBus.on('REQUEST_LOAD_ASSETS', (payload) => this.loadManifest(payload.manifest));
    },

    /**
     * 【処理1: マニフェストの読み込み】
     * アセットリストを受け取り、全読み込みを開始します。
     * @param {Array} manifest - { id, url, type: 'IMAGE'|'AUDIO'|'JSON' } の配列
     */
    loadManifest: function(manifest) {
        this.totalItems = manifest.length;
        this.loadedItems = 0;

        if (this.totalItems === 0) {
            EventBus.emit('ASSET_LOAD_COMPLETE', {});
            return;
        }

        console.log(`[AssetLoader] ${this.totalItems} 件のアセット読み込みを開始します...`);

        manifest.forEach(item => {
            this.loadSingleAsset(item);
        });
    },

    /**
     * 【処理2: 単一アセットの読み込み】
     * 型に応じて適切な読み込み手法を選択します。
     */
    loadSingleAsset: function(item) {
        const { id, url, type } = item;

        switch (type) {
            case 'IMAGE':
                const img = new Image();
                img.onload = () => this.onAssetSuccess(id, img);
                img.onerror = () => this.onAssetError(id, url);
                img.src = url;
                break;

            case 'AUDIO':
                const audio = new Audio();
                audio.oncanplaythrough = () => this.onAssetSuccess(id, audio);
                audio.onerror = () => this.onAssetError(id, url);
                audio.src = url;
                break;

            case 'JSON':
                fetch(url)
                    .then(response => response.json())
                    .then(data => this.onAssetSuccess(id, data))
                    .catch(() => this.onAssetError(id, url));
                break;

            default:
                console.warn(`[AssetLoader] 不明なタイプです: ${type}`);
                this.onAssetError(id, url);
        }
    },

    onAssetSuccess: function(id, data) {
        this.cache[id] = data;
        this.loadedItems++;

        // 進捗を通知
        const progress = Math.floor((this.loadedItems / this.totalItems) * 100);
        EventBus.emit('ASSET_PROGRESS', { id, progress, loaded: this.loadedItems, total: this.totalItems });

        // 全完了チェック
        if (this.loadedItems === this.totalItems) {
            console.log("[AssetLoader] 全てのアセット読み込み完了。");
            EventBus.emit('ASSET_LOAD_COMPLETE', {});
        }
    },

    onAssetError: function(id, url) {
        console.error(`[AssetLoader] 読み込み失敗: ${id} (${url})`);
        EventBus.emit('SYSTEM_ERROR', { module: 'AssetLoader', message: `アセットの読み込みに失敗しました: ${id}` });
    },

    /**
     * 【取得】
     * キャッシュからアセットを取得します。
     */
    get: function(id) {
        return this.cache[id];
    }
};

/**
 * =====================================================================
 * 【使用例 / テストコード】
 * =====================================================================
 */

/*
// 1. システム起動時に初期化
AssetLoader.init();

// 2. アセットの読み込みリクエスト
// UI（Unit C）などが読み込みボタンを押した時などに発火
const myManifest = [
    { id: 'player_sprite', url: 'assets/player.png', type: 'IMAGE' },
    { id: 'bgm_main', url: 'assets/bgm.mp3', type: 'AUDIO' },
    { id: 'theme_dark', url: 'assets/theme_dark.json', type: 'JSON' }
];

EventBus.emit('REQUEST_LOAD_ASSETS', { manifest: myManifest });

// 3. 進捗表示（UI側での受信）
EventBus.on('ASSET_PROGRESS', (payload) => {
    console.log(`読込中... ${payload.progress}% (${payload.loaded}/${payload.total})`);
});

// 4. 完了通知（ゲーム開始トリガー）
EventBus.on('ASSET_LOAD_COMPLETE', () => {
    console.log("ゲーム画面へ移行可能！");
    // const themeData = AssetLoader.get('theme_dark');
});
*/