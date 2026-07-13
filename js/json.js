/**
 * =====================================================================
 * JSON管理システム (Unit A: Core Logic Unit の一部)
 * 
 * 目的:
 * システム内で使用するデータと、外部（別プロジェクト）とやり取りするための
 * JSONテキストの「変換（生成・解析）」のみを担当します。
 * 
 * 特徴:
 * - 実ファイル操作は行わず、あくまで「JSON形式の文字列」を作る/読み解くだけです。
 * - UIやAction管理と直接繋がらず、EventBus経由で依頼を受け、結果を返します。
 * =====================================================================
 */

const JsonManager = {
    /**
     * 【初期化】
     * 自分が対応すべきイベント（依頼）をEventBusに登録して待ち受けます。
     * システム起動時に1度だけ呼び出します。
     */
    init: function() {
        // [受信] 「現在のAction履歴からResult.jsonを作ってほしい」という依頼
        EventBus.on('REQUEST_GENERATE_RESULT_JSON', (payload) => this.generateResultJson(payload));

        // [受信] 「外部から読み込んだJSON文字列をデータ（オブジェクト）にしてほしい」という依頼
        EventBus.on('REQUEST_PARSE_JSON', (payload) => this.parseExternalJson(payload));
    },

    /**
     * 【処理1: Result.json の生成】
     * 実行プロジェクト（ExecuteProject）へ渡すためのJSONテキストを作成します。
     * 
     * @param {Object} payload 
     * @param {Array} payload.actionQueue - 現在たまっている整理予定（Action）の配列
     */
    generateResultJson: function(payload) {
        try {
            const actions = payload.actionQueue || [];

            // ExecuteProjectが読み込むための厳密なフォーマット（スキーマ）に沿って組み立てる
            const resultData = {
                meta: {
                    version: "1.0",
                    exportedAt: new Date().toISOString(), // 現在の時刻（例: "2026-07-13T10:30:00.000Z"）
                    totalActions: actions.length
                },
                // Actionの配列をそのままセット（必要に応じてここでExecuteProject向けにデータを整形・変換可能）
                actions: actions
            };

            // オブジェクトをJSON形式の文字列に変換 (見やすいようにインデントを2スペースで設定)
            const jsonString = JSON.stringify(resultData, null, 2);

            // [送信] 「Result.jsonのテキストデータが完成したよ！」と全体にお知らせ
            // これを受け取ったUI（Unit C）がダウンロード処理などを行います
            EventBus.emit('RESULT_JSON_GENERATED', { 
                fileName: 'Result.json',
                dataString: jsonString 
            });

        } catch (error) {
            // [送信] エラーが起きた場合もイベントで通知
            EventBus.emit('SYSTEM_ERROR', { 
                module: 'JsonManager', 
                message: 'Result.jsonの生成に失敗しました。', 
                detail: error.message 
            });
        }
    },

    /**
     * 【処理2: 外部JSONの解析 (Load/Parse)】
     * 設定ファイル(Config.json)など、文字列のJSONをJavaScriptで扱えるデータに変換します。
     * 
     * @param {Object} payload
     * @param {string} payload.type - なんのJSONか（例: 'CONFIG', 'SAVE_DATA'）
     * @param {string} payload.jsonString - 読み込んだJSON形式の文字列
     */
    parseExternalJson: function(payload) {
        try {
            // 文字列をJavaScriptのオブジェクトに変換
            const parsedObject = JSON.parse(payload.jsonString);

            // [送信] 「解析成功！データとして使えるよ！」と全体にお知らせ
            EventBus.emit('JSON_PARSED_SUCCESS', {
                type: payload.type,
                data: parsedObject
            });

        } catch (error) {
            // [送信] 文法エラー等で読み込めなかった場合
            EventBus.emit('SYSTEM_ERROR', { 
                module: 'JsonManager', 
                message: `${payload.type} JSONの解析に失敗しました。フォーマットが正しいか確認してください。`, 
                detail: error.message 
            });
        }
    }
};

/**
 * =====================================================================
 * 【手動で繋ぎ合わせるための使用例 / テストコード】
 * 
 * 以下のコードは、JsonManagerがどのように依頼を受け、
 * どのように結果を返すかを示したイメージです。
 * =====================================================================
 */

/*
// 1. システム起動時にJsonManagerを初期化（待ち受け開始）
JsonManager.init();


// 2. どこかの機能（例: UIの「確定ボタン」など）から依頼を出す
console.log("--- UIからResult.jsonの生成依頼を発信 ---");

// 仮のActionQueueデータ（実際はUnit AのAction管理モジュールが保持しているデータ）
const dummyActions = [
    { actionId: 'uuid-1', type: 'MOVE', target: { fileId: 'file-a', originalPath: 'C:/temp/a.txt' } }
];

// ★ 関数1つで情報を渡す（依頼）
EventBus.emit('REQUEST_GENERATE_RESULT_JSON', { actionQueue: dummyActions });


// 3. UI側（Unit C）で完成したJSONを受け取る例
EventBus.on('RESULT_JSON_GENERATED', (data) => {
    console.log(`[UI Unit] ${data.fileName} を受け取りました！`);
    console.log("[UI Unit] 中身:\n" + data.dataString);
    
    // ここでHTMLの機能（aタグを使ったダウンロードなど）を実行する
});


// 4. 設定ファイルを読み込む依頼の例
console.log("--- 起動時にConfig.jsonの読み込み依頼を発信 ---");
const dummyConfigString = '{"theme": "dark", "volume": 80}'; // 外部からテキストとして読み込んだと仮定

// ★ 関数1つで情報を渡す（依頼）
EventBus.emit('REQUEST_PARSE_JSON', { 
    type: 'CONFIG', 
    jsonString: dummyConfigString 
});


// 5. 設定管理モジュールが解析結果を受け取る例
EventBus.on('JSON_PARSED_SUCCESS', (payload) => {
    if (payload.type === 'CONFIG') {
        console.log(`[Config Manager] 設定が読み込まれました。テーマ: ${payload.data.theme}`);
    }
});
*/